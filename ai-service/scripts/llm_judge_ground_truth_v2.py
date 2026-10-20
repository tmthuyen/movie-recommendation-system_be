#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""llm_judge_ground_truth_v2.py.

===============================
Module LLM-as-a-Judge sử dụng Gemini API để thẩm định và gán nhãn Ground Truth V2 (Bước 3):
1. Giao thức đánh giá mù (Double-Blind Protocol):
   - Chỉ cung cấp query và nội dung tóm tắt phim (title, genres, release_date, vote_average, overview).
   - Tuyệt đối không cung cấp thông tin phim nguồn (source_movie_id / is_source_movie),
     mô hình truy xuất (pooled_by) hay thứ hạng điểm số (model_ranks / retrieval_scores).
2. Thang điểm 0–3 và Rubric thống nhất cho 5 nhóm truy vấn:
   - Lexical, Semantic, Abstract, Typo_Slang, Short_Long.
   - Hỗ trợ trạng thái 'insufficient_evidence' (llm_grade = None, llm_verdict = 'insufficient_evidence')
     KHI VÀ CHỈ KHI tóm tắt phim quá ngắn, mơ hồ hoặc không đủ cốt truyện theo nhận định của LLM.
   - TUYỆT ĐỐI KHÔNG ghi lỗi API, timeout, hay lỗi parse JSON thành insufficient_evidence.
3. Nguyên tắc bảo vệ tính toàn vẹn Ground Truth:
   - Không tự ý ghi đè các nhãn con người đã xác nhận (verified_by_human == True).
   - Lưu trữ tách biệt: llm_grade, llm_verdict, judge_model, llm_reasoning, rubric_version, llm_judged_at.
   - Luôn giữ verified_by_human = False đối với nhãn do LLM sinh ra.
4. Kỹ thuật API tin cậy & Khả năng phục hồi sự cố:
   - Hỗ trợ gom cụm (batching 5 cặp/request), retry với exponential backoff.
   - Phân biệt rõ lỗi API (quota, server, network, json parse) và đánh giá hợp lệ.
   - Checkpoint an toàn qua file tạm (.tmp) và thay thế nguyên tử (os.replace) kèm file backup (.bak).
   - Tự động khôi phục dữ liệu từ file backup nếu file checkpoint chính bị hỏng (corrupted JSON).
   - Chỉ bỏ qua các cặp có kết quả HỢP LỆ; các cặp lỗi được đưa vào pending để retry.
   - Khi toàn bộ kết quả đã có trong checkpoint, vẫn tự động đồng bộ vào Ground Truth V2 và annotation queue.
   - Chế độ Pilot (--pilot): Chạy thử nghiệm 25 cặp phân bổ đều 5 nhóm trước khi chạy hàng loạt.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import random
import re
import shutil
import socket
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

# Khắc phục lỗi Windows IPv6 DNS resolution hang khi gọi Google API
_orig_getaddrinfo = socket.getaddrinfo


def _ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)


socket.getaddrinfo = _ipv4_getaddrinfo

# Thiết lập encoding UTF-8 cho Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = CURRENT_DIR.parent
PROJECT_ROOT = AI_SERVICE_DIR.parent
GT_DIR = AI_SERVICE_DIR / "experiments" / "ground_truth"
ENV_FILE = AI_SERVICE_DIR / ".env"

if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

try:
    from annotate_ground_truth_v2 import sync_annotation_queue
except ImportError:
    sync_annotation_queue = None

GROUND_TRUTH_V2_FILE = GT_DIR / "ground_truth_v2.json"
ANNOTATION_QUEUE_FILE = GT_DIR / "annotation_queue_v2.json"
PILOT_RESULTS_FILE = GT_DIR / "pilot_llm_judge_results.json"
FULL_LLM_RESULTS_FILE = GT_DIR / "llm_judge_checkpoint.json"

DEFAULT_JUDGE_MODEL = "gemini-3.5-flash"
RUBRIC_VERSION = "2.0-unified-5groups"
DEFAULT_BATCH_SIZE = 5
MAX_RETRIES = 4
INITIAL_BACKOFF = 2.0


# ══════════════════════════════════════════════════════════════════════════════
# 1. ĐỊNH NGHĨA NGOẠI LỆ & HÀM XỬ LÝ FILE NGUYÊN TỬ
# ══════════════════════════════════════════════════════════════════════════════


class LLMJudgeError(Exception):
    """Lớp ngoại lệ cơ sở cho hệ thống LLM Judge."""

    def __init__(
        self,
        message: str,
        error_type: str = "general_error",
        status_code: Optional[int] = None,
    ):
        super().__init__(message)
        self.error_type = error_type
        self.status_code = status_code


class LLMQuotaExceededError(LLMJudgeError):
    """Lỗi hết quota hoặc chạm rate limit (HTTP 429)."""

    def __init__(self, message: str):
        super().__init__(message, error_type="quota_exceeded", status_code=429)


class LLMServerError(LLMJudgeError):
    """Lỗi máy chủ Google/Gemini (HTTP 500, 502, 503, 504)."""

    def __init__(self, message: str, status_code: int = 503):
        super().__init__(message, error_type="server_error", status_code=status_code)


class LLMNetworkError(LLMJudgeError):
    """Lỗi kết nối mạng, DNS hoặc timeout."""

    def __init__(self, message: str):
        super().__init__(message, error_type="network_error")


class LLMJSONParseError(LLMJudgeError):
    """Lỗi bóc tách JSON từ phản hồi LLM."""

    def __init__(self, message: str):
        super().__init__(message, error_type="json_parse_error")


def atomic_save_json(target_path: Path, data: Any, create_backup: bool = True) -> None:
    """Ghi dữ liệu JSON an toàn bằng file tạm (.tmp) và thay thế nguyên tử (os.replace).

    Duy trì file backup (.bak) trước khi ghi đè để khôi phục nếu hệ điều hành hoặc nguồn điện gặp sự cố.
    """
    target_path = Path(target_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = target_path.with_suffix(".tmp")
    bak_path = target_path.with_suffix(".bak")

    # 1. Ghi vào file tạm và flush/fsync ra đĩa
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        try:
            os.fsync(f.fileno())
        except OSError:
            pass

    # 2. Tạo bản sao lưu (.bak) của file chính hiện tại nếu file chính tồn tại và hợp lệ
    if create_backup and target_path.exists():
        try:
            shutil.copy2(target_path, bak_path)
        except Exception:
            pass

    # 3. Thay thế nguyên tử file tạm thành file chính
    os.replace(tmp_path, target_path)


def load_checkpoint_safe(checkpoint_file: Path) -> Dict[str, Any]:
    """Nạp checkpoint an toàn. Nếu file chính bị hỏng (corrupted JSON),

    tự động khôi phục từ file .bak.
    """
    checkpoint_file = Path(checkpoint_file)
    bak_file = checkpoint_file.with_suffix(".bak")

    if not checkpoint_file.exists():
        if bak_file.exists():
            print(
                f"⚠️ Không tìm thấy '{checkpoint_file.name}', tự động khôi phục từ '{bak_file.name}'..."
            )
            try:
                with open(bak_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                atomic_save_json(checkpoint_file, data, create_backup=False)
                return data
            except Exception as e:
                print(f"❌ File backup '{bak_file.name}' cũng bị lỗi: {e}")
        return {}

    try:
        with open(checkpoint_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"⚠️ [Checkpoint Corrupted] File checkpoint '{checkpoint_file.name}' bị hỏng ({e})!")
        if bak_file.exists():
            print(f"🔄 Đang tiến hành khôi phục từ file backup '{bak_file.name}'...")
            try:
                with open(bak_file, "r", encoding="utf-8") as f:
                    restored_data = json.load(f)
                atomic_save_json(checkpoint_file, restored_data, create_backup=False)
                print(
                    f"✅ Khôi phục thành công {len(restored_data.get('judgments', [])):,} bản ghi từ backup!"
                )
                return restored_data
            except Exception as be:
                print(f"❌ File backup '{bak_file.name}' cũng không đọc được: {be}")
        raise RuntimeError(
            f"Checkpoint '{checkpoint_file.name}' bị hỏng ({e}) và không tìm thấy bản backup hợp lệ để khôi phục!"
        )


def is_valid_judgment(j: Dict[str, Any]) -> bool:
    """Xác định một bản ghi đánh giá LLM có hợp lệ hay không.

    Quy tắc chặt chẽ:
    - Không chứa cờ lỗi (status != 'error', error_type is None).
    - Có điểm 0–3 và verdict hợp lệ (relevant, partially_relevant, irrelevant).
    - Hoặc verdict == 'insufficient_evidence' với llm_grade is None và lý do nội dung thực tế từ LLM.
    - Loại trừ tuyệt đối các lỗi API bị ghi nhầm thành insufficient_evidence.
    """
    if not isinstance(j, dict):
        return False
    if j.get("status") == "error" or j.get("error_type"):
        return False

    verdict = j.get("llm_verdict")
    grade = j.get("llm_grade")
    reasoning = str(j.get("llm_reasoning") or "").strip()

    # Chặn các chuỗi lỗi API trong reasoning
    err_signatures = [
        "lỗi gọi api",
        "lỗi mạng",
        "http 429",
        "http 500",
        "http 502",
        "http 503",
        "connection error",
        "quota exceeded",
        "jsondecodeerror",
    ]
    reasoning_lower = reasoning.lower()
    if any(sig in reasoning_lower for sig in err_signatures):
        return False

    if verdict in ("relevant", "partially_relevant", "irrelevant"):
        return grade in (0, 1, 2, 3)

    if verdict == "insufficient_evidence":
        return grade is None and len(reasoning) > 0

    return False


# ══════════════════════════════════════════════════════════════════════════════
# 2. NẠP CẤU HÌNH VÀ GEMINI API KEY
# ══════════════════════════════════════════════════════════════════════════════


def get_gemini_api_key() -> str:
    """Nạp GEMINI_API_KEY từ biến môi trường hoặc file ai-service/.env."""
    key = os.getenv("GEMINI_API_KEY", "")
    if key:
        return key.strip()

    if ENV_FILE.exists():
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY=") and not line.startswith("#"):
                    val = line.split("=", 1)[1].strip()
                    val = val.strip("'\"")
                    if val:
                        return val
    raise RuntimeError(
        f"[FATAL] Không tìm thấy GEMINI_API_KEY trong môi trường hoặc file {ENV_FILE}!"
    )


# ══════════════════════════════════════════════════════════════════════════════
# 3. RUBRIC ĐÁNH GIÁ 5 NHÓM TRUY VẤN (UNIFIED RUBRIC)
# ══════════════════════════════════════════════════════════════════════════════

JUDGE_SYSTEM_PROMPT = """Bạn là một chuyên gia thẩm định dữ liệu truy hồi thông tin (Information Retrieval Judge) cho hệ thống tìm kiếm phim.
Nhiệm vụ của bạn là đánh giá mức độ liên quan (relevance) giữa câu TRUY VẤN của người dùng và NỘI DUNG TÓM TẮT BỘ PHIM trên thang điểm 0–3 theo giao thức ĐÁNH GIÁ MÙ (Double-Blind).

THANG ĐIỂM CHUẨN:
- 3 (Rất liên quan - Primary Match): Bộ phim đáp ứng hoàn toàn ý định tìm kiếm, khớp chính xác thực thể/tựa đề hoặc chủ đề cốt lõi.
- 2 (Liên quan - Strong Partial Match): Bộ phim có liên quan cao đến cốt truyện, cùng motif hoặc thể loại chính, là gợi ý rất tốt cho người dùng.
- 1 (Liên quan một phần - Weak / Peripheral Match): Chỉ chia sẻ yếu tố phụ, thể loại hoặc chi tiết thứ yếu; không phải trọng tâm câu tìm kiếm.
- 0 (Không liên quan - Irrelevant): Hoàn toàn không liên quan, khác biệt về chủ đề và ý định.

ĐẶC THÙ THEO 5 NHÓM TRUY VẤN:
1. Lexical (Khớp từ khóa/thực thể):
   - Grade 3: Tựa đề hoặc thực thể chính trùng khớp gần như chính xác với truy vấn.
   - Grade 2: Chứa từ khóa chính hoặc liên quan mật thiết tới thực thể tìm kiếm.
   - Grade 1: Chỉ chứa 1 từ khóa ngẫu nhiên/thứ yếu.
   - Grade 0: Không chứa và không liên quan đến từ khóa.
2. Semantic (Khái niệm & chủ đề đồng nghĩa/tương đương):
   - Grade 3: Cốt truyện phản ánh chính xác ý định ngữ nghĩa của truy vấn (cùng hiện tượng, motif, xung đột).
   - Grade 2: Cùng đề tài lớn hoặc thể loại giải quyết nhu cầu tương đương.
   - Grade 1: Đề cập thoáng qua một khía cạnh phụ của chủ đề.
   - Grade 0: Ý nghĩa ngữ nghĩa khác biệt hoàn toàn.
3. Abstract (Cảm xúc, biểu tượng, cốt truyện ẩn dụ):
   - Grade 3: Khớp trọn vẹn thông điệp ẩn dụ, cảm xúc chủ đạo (buồn, sâu lắng, truyền cảm hứng, rùng rợn, suy tư triết học).
   - Grade 2: Khớp mạnh mẽ với không khí hoặc phong cách nghệ thuật được mô tả.
   - Grade 1: Có yếu tố cảm xúc tương tự nhưng không rõ nét.
   - Grade 0: Không gợi lên cảm xúc hay hình tượng trong truy vấn.
4. Typo_Slang (Lỗi chính tả, từ lóng, teencode, viết tắt):
   - Grade 3: Nhận diện chính xác thuật ngữ lóng / lỗi gõ và khớp trọn vẹn bộ phim mà người dùng thực sự hướng tới.
   - Grade 2: Khớp với nội dung sau khi sửa lỗi ở mức độ tương đối.
   - Grade 1: Khớp mơ hồ với một cách hiểu khác.
   - Grade 0: Không nhận diện được hoặc không liên quan.
5. Short_Long (Truy vấn cực ngắn hoặc mô tả tình tiết dài nhiều mệnh đề):
   - Grade 3: Thỏa mãn trọn vẹn chuỗi điều kiện phức tạp (mô tả dài) hoặc là đại diện tiêu biểu nhất của từ khóa cực ngắn.
   - Grade 2: Thỏa mãn 70-80% các tình tiết/điều kiện trong mô tả dài.
   - Grade 1: Chỉ thỏa mãn 1 tình tiết nhỏ trong mô tả dài.
   - Grade 0: Không thỏa mãn các điều kiện chính.

QUY TẮC KHÔNG ĐỦ BẰNG CHỨNG (INSUFFICIENT EVIDENCE):
- Nếu tóm tắt phim bị rỗng, quá ngắn (< 30 ký tự) hoặc không chứa thông tin cốt truyện đủ để thẩm định,
  hãy trả về:
  "grade": null
  "verdict": "insufficient_evidence"
  và nêu rõ lý do trong "reasoning". TUYỆT ĐỐI KHÔNG ÉP CHẤM ĐIỂM BỪA KHI THIẾU DỮ LIỆU.

QUY TẮC PHẢN HỒI:
- Phản hồi bằng đúng định dạng JSON hợp lệ (không kèm markdown ngoài codeblock json).
- Cấu trúc danh sách các kết quả đánh giá:
[
  {
    "pair_id": "<query_id>_<movie_id>",
    "query_id": "<query_id>",
    "movie_id": <movie_id_int>,
    "grade": 0 | 1 | 2 | 3 | null,
    "verdict": "relevant" | "partially_relevant" | "irrelevant" | "insufficient_evidence",
    "reasoning": "Giải thích ngắn gọn 1-2 câu tiếng Việt dựa trên so sánh giữa query và tóm tắt phim"
  }
]
"""


def build_judge_prompt(pairs: List[Dict[str, Any]]) -> str:
    """Xây dựng prompt đánh giá mù cho một batch các cặp query - phim."""
    items_text = []
    for idx, p in enumerate(pairs, start=1):
        overview_text = p.get("overview_full") or p.get("overview_snippet") or ""
        items_text.append(
            f"--- CẶP #{idx} (Pair ID: {p['pair_id']}) ---\n"
            f"Query ID: {p['query_id']}\n"
            f"Nhóm Query: {p.get('query_type', 'General')}\n"
            f"Truy vấn: \"{p['query']}\"\n"
            f"Phim: #{p['movie_id']}\n"
            f"Tiêu đề VI: {p.get('title_vi', '')}\n"
            f"Tiêu đề EN: {p.get('title_en', '')}\n"
            f"Thể loại: {p.get('genres', '')}\n"
            f"Năm phát hành: {p.get('release_date', '')}\n"
            f"Điểm vote: {p.get('vote_average', '')}/10\n"
            f"Tóm tắt nội dung: {overview_text}\n"
        )

    user_content = (
        f"Hãy đánh giá {len(pairs)} cặp truy vấn – phim dưới đây theo đúng Rubric và trả về JSON:\n\n"
        + "\n".join(items_text)
    )
    return user_content


# ══════════════════════════════════════════════════════════════════════════════
# 4. GỌI GEMINI API VỚI RETRY VÀ PHÂN BIỆT LỖI
# ══════════════════════════════════════════════════════════════════════════════


def call_gemini_api(
    prompt: str,
    api_key: str,
    model_name: str = DEFAULT_JUDGE_MODEL,
    max_retries: int = MAX_RETRIES,
) -> Tuple[str, str]:
    """Gọi Gemini API qua REST endpoint với retry exponential backoff và model fallback."""
    candidate_models = [model_name]
    for fb in ["gemini-3.5-flash-lite", "gemini-flash-lite-latest"]:
        if fb not in candidate_models:
            candidate_models.append(fb)

    last_status: Optional[int] = None
    last_err: Optional[Exception] = None

    for m_target in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_target}:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": f"{JUDGE_SYSTEM_PROMPT}\n\n{prompt}"}]}],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
        }

        backoff = INITIAL_BACKOFF
        for attempt in range(1, max_retries + 1):
            try:
                print(
                    f"      [Gemini API] Đang gửi request tới {m_target} (lần {attempt}/{max_retries})...",
                    flush=True,
                )
                resp = requests.post(url, json=payload, timeout=45)
                last_status = resp.status_code
                print(f"      [Gemini API] Nhận status {resp.status_code}", flush=True)

                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            return parts[0].get("text", ""), m_target
                    raise LLMJudgeError(
                        f"Response rỗng từ Gemini API: {data}", error_type="empty_response"
                    )

                last_err = RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
                if resp.status_code in (429, 503):
                    print(
                        f"   ⚠️ Status {resp.status_code} ({m_target}). Chờ {backoff:.1f}s trước khi thử lại...",
                        flush=True,
                    )
                    time.sleep(backoff)
                    backoff *= 1.5
                    # Nếu retry đến lần 2 vẫn lỗi 503/429, chuyển sang fallback model tiếp theo
                    if attempt >= 2 and m_target != candidate_models[-1]:
                        print(f"   🔄 Chuyển sang model dự phòng tiếp theo...", flush=True)
                        break
                else:
                    break

            except requests.exceptions.RequestException as e:
                last_err = e
                last_status = None
                print(
                    f"   ⚠️ Lỗi kết nối mạng: {e}. Chờ {backoff:.1f}s trước khi thử lại...",
                    flush=True,
                )
                time.sleep(backoff)
                backoff *= 2

    # Phân loại ngoại lệ chính xác dựa trên mã trạng thái cuối cùng
    if last_status == 429:
        raise LLMQuotaExceededError(
            f"Hết quota hoặc chạm trần rate limit Gemini API (HTTP 429): {last_err}"
        )
    elif last_status in (500, 502, 503, 504):
        raise LLMServerError(
            f"Lỗi máy chủ Gemini API (HTTP {last_status}): {last_err}", status_code=last_status
        )
    elif isinstance(last_err, requests.exceptions.RequestException):
        raise LLMNetworkError(f"Lỗi kết nối mạng tới Gemini API: {last_err}")

    raise LLMJudgeError(
        f"Đã thử lại qua tất cả models nhưng không thành công: {last_err}",
        error_type="api_error",
        status_code=last_status,
    )


def clean_and_parse_json(raw_text: str) -> List[Dict[str, Any]]:
    """Làm sạch và bóc tách dữ liệu JSON từ phản hồi LLM."""
    text = raw_text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
        elif (
            isinstance(parsed, dict)
            and "results" in parsed
            and isinstance(parsed["results"], list)
        ):
            return parsed["results"]
        elif (
            isinstance(parsed, dict)
            and "judgments" in parsed
            and isinstance(parsed["judgments"], list)
        ):
            return parsed["judgments"]
        return [parsed]
    except json.JSONDecodeError as je:
        # Cố gắng tìm đoạn json array bằng regex
        match = re.search(r"\[\s*\{.*\}\s*\]", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                pass
        raise LLMJSONParseError(
            f"Lỗi phân tích cú pháp JSON từ phản hồi LLM: {je}. Raw snippet: {text[:150]}"
        )


# ══════════════════════════════════════════════════════════════════════════════
# 5. CHỌN MẪU PILOT VÀ TOÀN BỘ ỨNG VIÊN CHƯA GÁN NHÃN
# ══════════════════════════════════════════════════════════════════════════════


def get_pilot_pairs_sample(
    gt_data: Dict[str, Any],
    pairs_per_group: int = 5,
    seed: int = 42,
) -> List[Dict[str, Any]]:
    """Chọn mẫu phân tầng 20–30 cặp đại diện cho 5 nhóm truy vấn để chạy thử nghiệm Pilot."""
    rng = random.Random(seed)
    pairs_by_group = {
        "Lexical": [],
        "Semantic": [],
        "Abstract": [],
        "Typo_Slang": [],
        "Short_Long": [],
    }

    for q in gt_data.get("queries", []):
        qid = q["query_id"]
        q_type = q.get("query_type", "Lexical")
        q_text = q["query"]

        for c in q.get("candidates", []):
            if c.get("verified_by_human"):
                continue

            pair_item = {
                "pair_id": f"{qid}_{c['movie_id']}",
                "query_id": qid,
                "query_type": q_type,
                "query": q_text,
                "movie_id": int(c["movie_id"]),
                "tmdb_id": c.get("tmdb_id"),
                "title_vi": c.get("title_vi"),
                "title_en": c.get("title_en"),
                "genres": c.get("genres"),
                "release_date": c.get("release_date"),
                "vote_average": c.get("vote_average"),
                "overview_snippet": c.get("overview_snippet"),
                "overview_full": c.get("overview_full"),
            }
            if q_type in pairs_by_group:
                pairs_by_group[q_type].append(pair_item)

    sampled_pilot_pairs = []
    for grp, p_list in pairs_by_group.items():
        rng.shuffle(p_list)
        selected = p_list[:pairs_per_group]
        sampled_pilot_pairs.extend(selected)

    return sampled_pilot_pairs


def get_all_unassessed_pairs(
    gt_data: Dict[str, Any],
    skip_already_judged: bool = True,
) -> List[Dict[str, Any]]:
    """Lấy danh sách tất cả các cặp truy vấn - phim chưa được con người xác nhận."""
    pairs = []
    for q in gt_data.get("queries", []):
        qid = q["query_id"]
        q_type = q.get("query_type", "General")
        q_text = q["query"]

        for c in q.get("candidates", []):
            if c.get("verified_by_human"):
                continue

            if skip_already_judged and is_valid_judgment(c):
                continue

            pair_item = {
                "pair_id": f"{qid}_{c['movie_id']}",
                "query_id": qid,
                "query_type": q_type,
                "query": q_text,
                "movie_id": int(c["movie_id"]),
                "tmdb_id": c.get("tmdb_id"),
                "title_vi": c.get("title_vi"),
                "title_en": c.get("title_en"),
                "genres": c.get("genres"),
                "release_date": c.get("release_date"),
                "vote_average": c.get("vote_average"),
                "overview_snippet": c.get("overview_snippet"),
                "overview_full": c.get("overview_full"),
            }
            pairs.append(pair_item)
    return pairs


# ══════════════════════════════════════════════════════════════════════════════
# 6. ĐÁNH GIÁ VÀ CẬP NHẬT GROUND TRUTH V2 (CHECKPOINT & RESUME)
# ══════════════════════════════════════════════════════════════════════════════


def run_llm_judge(
    gt_data: Dict[str, Any],
    pairs_to_judge: List[Dict[str, Any]],
    api_key: str,
    batch_size: int = DEFAULT_BATCH_SIZE,
    model_name: str = DEFAULT_JUDGE_MODEL,
    output_file: Optional[Path] = None,
    checkpoint_file: Optional[Path] = None,
    resume: bool = True,
    delay_seconds: float = 2.0,
    apply_to_gt: bool = False,
    gt_file: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """Thực thi đánh giá LLM-as-a-Judge cho danh sách cặp truy vấn - phim với checkpoint an toàn và resume."""
    checkpoint_judgments: Dict[str, Dict[str, Any]] = {}

    active_ckpt = checkpoint_file or output_file
    if resume and active_ckpt:
        ckpt_data = load_checkpoint_safe(active_ckpt)
        for j in ckpt_data.get("judgments", []):
            pid = j.get("pair_id")
            if pid:
                checkpoint_judgments[pid] = j
        if checkpoint_judgments:
            valid_cached = sum(1 for j in checkpoint_judgments.values() if is_valid_judgment(j))
            error_cached = sum(
                1 for j in checkpoint_judgments.values() if j.get("status") == "error"
            )
            print(
                f"📦 [Checkpoint] Đã nạp {len(checkpoint_judgments):,} bản ghi từ checkpoint '{active_ckpt.name}' "
                f"({valid_cached:,} hợp lệ, {error_cached:,} lỗi cần retry)."
            )

    # LỌC PENDING: Chỉ bỏ qua các cặp có kết quả HỢP LỆ; các cặp chưa có hoặc bị lỗi sẽ được retry!
    pending_pairs = []
    valid_count = 0
    error_count = 0
    for p in pairs_to_judge:
        pid = p["pair_id"]
        existing = checkpoint_judgments.get(pid)
        if existing and is_valid_judgment(existing):
            valid_count += 1
        else:
            if existing and existing.get("status") == "error":
                error_count += 1
            pending_pairs.append(p)

    total_pairs = len(pairs_to_judge)
    print(f"🤖 Bắt đầu LLM-as-a-Judge ({model_name}):", flush=True)
    print(f"   • Tổng số cặp cần thẩm định:   {total_pairs:,} cặp", flush=True)
    print(
        f"   • Đã có kết quả hợp lệ:        {valid_count:,} cặp (bỏ qua không gọi API)", flush=True
    )
    if error_count > 0:
        print(f"   • Cặp lỗi từ phiên trước:      {error_count:,} cặp (sẽ được retry)", flush=True)
    print(f"   • Cần gọi API mới/retry:       {len(pending_pairs):,} cặp", flush=True)
    print(f"   • Batch size:                  {batch_size} cặp/lần gọi API", flush=True)
    print(
        f"   • Pacing delay:                {delay_seconds}s giữa các batch (kiểm soát quota API)",
        flush=True,
    )
    print(f"   • Rubric version:              {RUBRIC_VERSION}", flush=True)
    print(
        f"   • Double-blind:                Không gửi thông tin model, rank hay phim nguồn tới LLM\n",
        flush=True,
    )

    # NẾU TOÀN BỘ ĐÃ CÓ TRONG CHECKPOINT: VẪN ĐỒNG BỘ VÀO GT & QUEUE NẾU APPLY_TO_GT
    if not pending_pairs:
        print("✅ Toàn bộ các cặp đã được đánh giá xong trong checkpoint hợp lệ!")
        if apply_to_gt and gt_file:
            valid_judgments = [j for j in checkpoint_judgments.values() if is_valid_judgment(j)]
            applied_count = apply_llm_judgments_to_ground_truth(gt_data, valid_judgments)
            atomic_save_json(gt_file, gt_data)
            if sync_annotation_queue is not None:
                try:
                    sync_annotation_queue(gt_data)
                    print(
                        f"💾 Đã đồng bộ {applied_count:,} nhãn LLM từ checkpoint vào {gt_file.name} và {ANNOTATION_QUEUE_FILE.name}!"
                    )
                except Exception as e:
                    print(f"   ⚠️ Lỗi đồng bộ annotation queue: {e}")
        return list(checkpoint_judgments.values())

    total_batches = (len(pending_pairs) + batch_size - 1) // batch_size

    for b_idx in range(total_batches):
        start = b_idx * batch_size
        end = min(start + batch_size, len(pending_pairs))
        batch = pending_pairs[start:end]

        completed_so_far = sum(1 for j in checkpoint_judgments.values() if is_valid_judgment(j))
        pct = round((completed_so_far / max(1, total_pairs)) * 100, 1)
        print(
            f"   [Batch {b_idx + 1}/{total_batches}] Đang đánh giá {len(batch)} cặp ({start + 1}–{end}/{len(pending_pairs)}) — Hoàn tất: {completed_so_far}/{total_pairs} ({pct}%)...",
            flush=True,
        )
        prompt = build_judge_prompt(batch)

        try:
            raw_resp, used_model = call_gemini_api(prompt, api_key=api_key, model_name=model_name)
            parsed_batch = clean_and_parse_json(raw_resp)

            resp_by_pair = {}
            for item in parsed_batch:
                pid = item.get("pair_id") or f"{item.get('query_id')}_{item.get('movie_id')}"
                resp_by_pair[pid] = item

            for p in batch:
                pid = p["pair_id"]
                judgment = resp_by_pair.get(pid)

                # Trường hợp LLM bỏ sót không trả về cặp này trong JSON
                if judgment is None:
                    prev_retry = checkpoint_judgments.get(pid, {}).get("retry_count", 0)
                    checkpoint_judgments[pid] = {
                        "pair_id": pid,
                        "query_id": p["query_id"],
                        "query_type": p.get("query_type"),
                        "query": p["query"],
                        "movie_id": p["movie_id"],
                        "title_vi": p.get("title_vi"),
                        "title_en": p.get("title_en"),
                        "llm_grade": None,
                        "llm_verdict": None,
                        "llm_reasoning": None,
                        "status": "error",
                        "error_type": "missing_item_in_response",
                        "error_message": f"LLM không trả về kết quả cho pair_id '{pid}'",
                        "retry_count": prev_retry + 1,
                        "last_error_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "verified_by_human": False,
                    }
                    continue

                raw_grade = judgment.get("grade")
                raw_verdict = str(judgment.get("verdict") or "").strip().lower()
                reasoning = judgment.get("reasoning") or judgment.get("explanation") or ""

                grade = None
                verdict = None

                if raw_verdict == "insufficient_evidence":
                    verdict = "insufficient_evidence"
                    grade = None
                elif raw_grade is not None:
                    try:
                        g_int = int(raw_grade)
                        if g_int in (0, 1, 2, 3):
                            grade = g_int
                            verdict = {
                                3: "relevant",
                                2: "relevant",
                                1: "partially_relevant",
                                0: "irrelevant",
                            }.get(grade, "relevant")
                    except (ValueError, TypeError):
                        pass

                # Nếu cả grade lẫn verdict đều không hợp lệ
                if grade is None and verdict != "insufficient_evidence":
                    prev_retry = checkpoint_judgments.get(pid, {}).get("retry_count", 0)
                    checkpoint_judgments[pid] = {
                        "pair_id": pid,
                        "query_id": p["query_id"],
                        "query_type": p.get("query_type"),
                        "query": p["query"],
                        "movie_id": p["movie_id"],
                        "title_vi": p.get("title_vi"),
                        "title_en": p.get("title_en"),
                        "llm_grade": None,
                        "llm_verdict": None,
                        "llm_reasoning": None,
                        "status": "error",
                        "error_type": "invalid_output_schema",
                        "error_message": f"LLM trả về grade={raw_grade}, verdict={raw_verdict} không hợp lệ",
                        "retry_count": prev_retry + 1,
                        "last_error_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "verified_by_human": False,
                    }
                    continue

                res_record = {
                    "pair_id": pid,
                    "query_id": p["query_id"],
                    "query_type": p.get("query_type"),
                    "query": p["query"],
                    "movie_id": p["movie_id"],
                    "title_vi": p.get("title_vi"),
                    "title_en": p.get("title_en"),
                    "llm_grade": grade,
                    "llm_verdict": verdict,
                    "llm_reasoning": reasoning,
                    "judge_model": used_model,
                    "rubric_version": RUBRIC_VERSION,
                    "llm_judged_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "status": "llm_judged",
                    "verified_by_human": False,
                }
                checkpoint_judgments[pid] = res_record

        except (LLMJudgeError, Exception) as e:
            err_type = getattr(e, "error_type", "api_error")
            err_msg = str(e)
            print(f"   ❌ Lỗi khi đánh giá batch {b_idx + 1} [{err_type}]: {err_msg}")

            # Đánh dấu lỗi rõ ràng cho từng cặp trong batch (TUYỆT ĐỐI KHÔNG GHI THÀNH insufficient_evidence!)
            for p in batch:
                pid = p["pair_id"]
                prev_retry = checkpoint_judgments.get(pid, {}).get("retry_count", 0)
                checkpoint_judgments[pid] = {
                    "pair_id": pid,
                    "query_id": p["query_id"],
                    "query_type": p.get("query_type"),
                    "query": p["query"],
                    "movie_id": p["movie_id"],
                    "title_vi": p.get("title_vi"),
                    "title_en": p.get("title_en"),
                    "llm_grade": None,
                    "llm_verdict": None,
                    "llm_reasoning": None,
                    "status": "error",
                    "error_type": err_type,
                    "error_message": err_msg,
                    "retry_count": prev_retry + 1,
                    "last_error_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "verified_by_human": False,
                }

            # Nếu lỗi chạm trần Quota 429, lưu an toàn và dừng khẩn cấp
            if err_type == "quota_exceeded":
                print("\n🛑 Quota API Gemini đã chạm trần (HTTP 429 Rate Limit / Quota Exceeded)!")
                print("💾 Đang lưu tiến độ hợp lệ vào checkpoint an toàn trước khi dừng...")
                if active_ckpt:
                    valid_list = [j for j in checkpoint_judgments.values() if is_valid_judgment(j)]
                    atomic_save_json(
                        active_ckpt,
                        {
                            "total_judged": len(valid_list),
                            "total_target": total_pairs,
                            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            "judgments": list(checkpoint_judgments.values()),
                        },
                    )
                if apply_to_gt and gt_file:
                    valid_list = [j for j in checkpoint_judgments.values() if is_valid_judgment(j)]
                    apply_llm_judgments_to_ground_truth(gt_data, valid_list)
                    atomic_save_json(gt_file, gt_data)
                    if sync_annotation_queue is not None:
                        try:
                            sync_annotation_queue(gt_data)
                        except Exception:
                            pass
                print(
                    "💡 Tiến độ đã được lưu vào checkpoint an toàn. Bạn có thể đợi quota hồi phục rồi chạy lại lệnh để tự động tiếp tục (resume).\n"
                )
                break

        # GHI CHECKPOINT AN TOÀN NGUYÊN TỬ SAU MỖI BATCH
        if active_ckpt:
            valid_list = [j for j in checkpoint_judgments.values() if is_valid_judgment(j)]
            atomic_save_json(
                active_ckpt,
                {
                    "total_judged": len(valid_list),
                    "total_target": total_pairs,
                    "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "judgments": list(checkpoint_judgments.values()),
                },
            )

        # CẬP NHẬT TĂNG DẦN VÀO GROUND TRUTH & QUEUE SAU MỖI 10 BATCH
        if apply_to_gt and gt_file and (b_idx + 1) % 10 == 0:
            valid_list = [j for j in checkpoint_judgments.values() if is_valid_judgment(j)]
            apply_llm_judgments_to_ground_truth(gt_data, valid_list)
            atomic_save_json(gt_file, gt_data)
            if sync_annotation_queue is not None:
                try:
                    sync_annotation_queue(gt_data)
                except Exception as e:
                    print(f"   ⚠️ Lỗi đồng bộ annotation queue: {e}")

        time.sleep(delay_seconds)

    # CẬP NHẬT KẾT THÚC VÀ ĐỒNG BỘ TOÀN DIỆN
    valid_final = [j for j in checkpoint_judgments.values() if is_valid_judgment(j)]
    if apply_to_gt and gt_file:
        applied_count = apply_llm_judgments_to_ground_truth(gt_data, valid_final)
        atomic_save_json(gt_file, gt_data)
        if sync_annotation_queue is not None:
            try:
                sync_annotation_queue(gt_data)
                print(
                    f"\n💾 Đã lưu và đồng bộ toàn bộ {applied_count:,} kết quả LLM hợp lệ vào {gt_file.name} và {ANNOTATION_QUEUE_FILE.name}!"
                )
            except Exception as e:
                print(f"   ⚠️ Lỗi đồng bộ annotation queue: {e}")
        else:
            print(f"\n💾 Đã lưu toàn bộ {applied_count:,} kết quả LLM hợp lệ vào {gt_file.name}!")

    return list(checkpoint_judgments.values())


def apply_llm_judgments_to_ground_truth(
    gt_data: Dict[str, Any],
    judgments: List[Dict[str, Any]],
) -> int:
    """Cập nhật các kết quả LLM-as-a-Judge HỢP LỆ vào ground_truth_v2.json.

    Tuân thủ nghiêm ngặt:
    - Bỏ qua toàn bộ bản ghi lỗi API (chỉ nhận is_valid_judgment == True).
    - KHÔNG ghi đè nhãn mà con người đã thẩm định (verified_by_human == True).
    - Lưu riêng llm_grade, judge_model, reasoning, rubric_version.
    - Giữ verified_by_human = False đối với nhãn do LLM sinh ra.
    """
    judgment_map = {j["pair_id"]: j for j in judgments if is_valid_judgment(j)}
    updated_count = 0

    for q in gt_data.get("queries", []):
        qid = q["query_id"]
        for c in q.get("candidates", []):
            pid = f"{qid}_{c['movie_id']}"
            if pid in judgment_map:
                j = judgment_map[pid]
                c["llm_grade"] = j["llm_grade"]
                c["llm_verdict"] = j["llm_verdict"]
                c["llm_reasoning"] = j["llm_reasoning"]
                c["judge_model"] = j["judge_model"]
                c["rubric_version"] = j["rubric_version"]
                c["llm_judged_at"] = j["llm_judged_at"]

                # Tuyệt đối không ghi đè nhãn con người đã thẩm định
                if not c.get("verified_by_human"):
                    c["status"] = "llm_judged"
                    c["verified_by_human"] = False
                    updated_count += 1

    return updated_count


def print_pilot_summary(results: List[Dict[str, Any]]) -> None:
    """In bảng tổng kết kết quả chạy Pilot cho người dùng kiểm tra."""
    print("\n" + "=" * 95)
    print("📋 KẾT QUẢ ĐÁNH GIÁ LLM-AS-A-JUDGE")
    print("=" * 95)
    print(
        f"{'Nhóm':<12} | {'Query ID':<8} | {'Phim ID':<8} | {'Grade':<6} | {'Verdict':<15} | {'Lý do (Trích lược)':<40}"
    )
    print("-" * 95)

    grade_counts = {3: 0, 2: 0, 1: 0, 0: 0, "insufficient_evidence": 0, "error": 0}

    for r in results[:30]:
        grp = r.get("query_type", "")[:12]
        qid = r.get("query_id", "")[:8]
        mid = str(r.get("movie_id", ""))[:8]
        grd = str(r.get("llm_grade") if r.get("llm_grade") is not None else "null")
        vrd = str(r.get("llm_verdict", ""))[:15]
        rsn = (r.get("llm_reasoning") or r.get("error_message") or "").replace("\n", " ")
        if len(rsn) > 38:
            rsn = rsn[:35] + "..."

        if r.get("status") == "error":
            grade_counts["error"] += 1
            vrd = f"ERR:{r.get('error_type', '')}"[:15]
        else:
            g_val = r.get("llm_grade")
            if g_val in grade_counts:
                grade_counts[g_val] += 1
            elif r.get("llm_verdict") == "insufficient_evidence":
                grade_counts["insufficient_evidence"] += 1

        print(f"{grp:<12} | {qid:<8} | {mid:<8} | {grd:<6} | {vrd:<15} | {rsn:<40}")

    if len(results) > 30:
        print(f"... và {len(results) - 30} cặp khác.")

    print("=" * 95)
    print("📊 Phân bổ điểm:")
    print(f"  • Grade 3 (Rất liên quan):    {grade_counts[3]}")
    print(f"  • Grade 2 (Liên quan):        {grade_counts[2]}")
    print(f"  • Grade 1 (Một phần):         {grade_counts[1]}")
    print(f"  • Grade 0 (Không liên quan):   {grade_counts[0]}")
    print(f"  • Insufficient Evidence:      {grade_counts['insufficient_evidence']}")
    if grade_counts["error"] > 0:
        print(f"  • Lỗi API cần retry:          {grade_counts['error']}")
    print(
        "\n🔒 Lưu ý: Nhãn LLM được lưu độc lập, KHÔNG tự coi là Ground Truth đã xác minh (verified_by_human = False)."
    )
    print("=" * 95 + "\n")


# ══════════════════════════════════════════════════════════════════════════════
# 7. ENTRYPOINT CLI
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="LLM-as-a-Judge cho Ground Truth V2 bằng Gemini API"
    )
    parser.add_argument(
        "--pilot",
        action="store_true",
        help="Chạy thử nghiệm trên 25 cặp (5 cặp/nhóm) để kiểm tra",
    )
    parser.add_argument(
        "--full", action="store_true", help="Chạy hàng loạt cho TOÀN BỘ ứng viên chưa đánh giá"
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Xác nhận thực thi chạy hàng loạt (bắt buộc khi dùng --full)",
    )
    parser.add_argument(
        "--limit", type=int, default=25, help="Số lượng cặp đánh giá (khi chạy pilot)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help="Số cặp gộp trong 1 request (mặc định: 5)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=2.0,
        help="Thời gian chờ giữa các request (giây) để kiểm soát quota (mặc định: 2.0)",
    )
    parser.add_argument(
        "--model", type=str, default=DEFAULT_JUDGE_MODEL, help="Tên model Gemini"
    )
    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="Không nạp lại checkpoint cũ (chạy lại từ đầu)",
    )
    parser.add_argument(
        "--apply-to-gt",
        action="store_true",
        help="Cập nhật trực tiếp kết quả vào ground_truth_v2.json",
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Xem thống kê số lượng ứng viên đã/chưa có nhãn LLM",
    )
    args = parser.parse_args()

    if not GROUND_TRUTH_V2_FILE.exists():
        sys.exit(
            f"[ERROR] Không tìm thấy file {GROUND_TRUTH_V2_FILE}. Vui lòng chạy build_ground_truth_v2.py trước!"
        )

    with open(GROUND_TRUTH_V2_FILE, "r", encoding="utf-8") as f:
        gt_data = json.load(f)

    if args.stats:
        unassessed = get_all_unassessed_pairs(gt_data, skip_already_judged=True)
        all_pairs = get_all_unassessed_pairs(gt_data, skip_already_judged=False)
        judged_count = len(all_pairs) - len(unassessed)

        checkpoint_records = {}
        if FULL_LLM_RESULTS_FILE.exists():
            ckpt = load_checkpoint_safe(FULL_LLM_RESULTS_FILE)
            for j in ckpt.get("judgments", []):
                checkpoint_records[j.get("pair_id")] = j

        valid_in_ckpt = sum(1 for j in checkpoint_records.values() if is_valid_judgment(j))
        errors_in_ckpt = sum(
            1 for j in checkpoint_records.values() if j.get("status") == "error"
        )

        print("\n" + "=" * 75)
        print("📊 THỐNG KÊ TIẾN ĐỘ LLM-AS-A-JUDGE (GROUND TRUTH V2)")
        print("=" * 75)
        print(f"  • Tổng số cặp ứng viên trong Ground Truth:  {len(all_pairs):,} cặp")
        print(
            f"  • Đã có nhãn LLM trong Ground Truth:       {judged_count:,} cặp ({round(judged_count/max(1, len(all_pairs))*100, 1)}%)"
        )
        print(f"  • Chưa có nhãn LLM trong Ground Truth:     {len(unassessed):,} cặp")
        if FULL_LLM_RESULTS_FILE.exists():
            print(f"  • File checkpoint:                         {FULL_LLM_RESULTS_FILE.name}")
            print(f"    - Kết quả hợp lệ trong checkpoint:       {valid_in_ckpt:,} cặp")
            print(f"    - Lỗi API cần retry trong checkpoint:    {errors_in_ckpt:,} cặp")
            bak_f = FULL_LLM_RESULTS_FILE.with_suffix(".bak")
            print(
                f"    - Bản sao lưu phục hồi (.bak):           {'Có sẵn' if bak_f.exists() else 'Chưa tạo'}"
            )
        print("=" * 75 + "\n")
        sys.exit(0)

    api_key = get_gemini_api_key()

    if args.pilot:
        pairs = get_pilot_pairs_sample(gt_data, pairs_per_group=args.limit // 5)
        print(
            f"🧪 [PILOT MODE] Đã chọn {len(pairs)} cặp phân tầng đại diện 5 nhóm truy vấn để chạy thử nghiệm."
        )
        results = run_llm_judge(
            gt_data=gt_data,
            pairs_to_judge=pairs,
            api_key=api_key,
            batch_size=args.batch_size,
            model_name=args.model,
            output_file=PILOT_RESULTS_FILE,
            checkpoint_file=PILOT_RESULTS_FILE,
            resume=not args.no_resume,
            delay_seconds=args.delay,
            apply_to_gt=args.apply_to_gt,
            gt_file=GROUND_TRUTH_V2_FILE if args.apply_to_gt else None,
        )
        print_pilot_summary(results)

    elif args.full:
        unassessed_pairs = get_all_unassessed_pairs(
            gt_data, skip_already_judged=not args.no_resume
        )
        if not args.confirm:
            print("\n" + "=" * 80)
            print("⚠️  CẢNH BÁO: CHẾ ĐỘ CHẠY HÀNG LOẠT (FULL LLM JUDGE)")
            print("=" * 80)
            print(f"Tổng số ứng viên trong Ground Truth V2: {len(unassessed_pairs):,} cặp cần đánh giá.")
            print(
                f"Ước tính số request API: ~{(len(unassessed_pairs) + args.batch_size - 1) // args.batch_size:,} requests (batch_size={args.batch_size})."
            )
            print("Chế độ này sẽ gửi hàng trăm yêu cầu API tới Gemini.")
            print("\nĐể bảo vệ hạn mức quota và tránh gọi API ngoài ý muốn, bạn cần thêm cờ '--confirm':")
            print("👉 Lệnh chạy an toàn (Pay-as-you-go):")
            print(
                "   python ai-service/scripts/llm_judge_ground_truth_v2.py --full --confirm --apply-to-gt --batch-size 5 --delay 2.0"
            )
            print("👉 Lệnh chạy an toàn (Free Tier 15 RPM):")
            print(
                "   python ai-service/scripts/llm_judge_ground_truth_v2.py --full --confirm --apply-to-gt --batch-size 5 --delay 4.5"
            )
            print("=" * 80 + "\n")
            sys.exit(0)

        print(
            f"\n🚀 [FULL BATCH MODE] Bắt đầu đánh giá hàng loạt cho {len(unassessed_pairs):,} cặp ứng viên..."
        )
        results = run_llm_judge(
            gt_data=gt_data,
            pairs_to_judge=unassessed_pairs,
            api_key=api_key,
            batch_size=args.batch_size,
            model_name=args.model,
            output_file=FULL_LLM_RESULTS_FILE,
            checkpoint_file=FULL_LLM_RESULTS_FILE,
            resume=not args.no_resume,
            delay_seconds=args.delay,
            apply_to_gt=args.apply_to_gt,
            gt_file=GROUND_TRUTH_V2_FILE if args.apply_to_gt else None,
        )
        print(f"\n🏁 Hoàn thành phiên đánh giá! Đã xử lý {len(results):,} cặp.")
    else:
        print("\n" + "=" * 70)
        print("💡 HƯỚNG DẪN SỬ DỤNG LLM-AS-A-JUDGE:")
        print("=" * 70)
        print("1. Chạy thử nghiệm Pilot (25 cặp phân tầng):")
        print("   python ai-service/scripts/llm_judge_ground_truth_v2.py --pilot")
        print("\n2. Xem thống kê tiến độ:")
        print("   python ai-service/scripts/llm_judge_ground_truth_v2.py --stats")
        print("\n3. Chạy hàng loạt (Full) cho toàn bộ ứng viên chưa đánh giá:")
        print(
            "   python ai-service/scripts/llm_judge_ground_truth_v2.py --full --confirm --apply-to-gt"
        )
        print("=" * 70 + "\n")
