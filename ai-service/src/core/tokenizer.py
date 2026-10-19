import hashlib
import re
import unicodedata
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Set

from underthesea import word_tokenize

from utils import setup_logger
from utils.clean_text_utils import clean_text


class BaseTokenizer(ABC):
    """
    Hợp đồng chung cho mọi bộ tách từ.
    """

    def __init__(self):
        self.logger = setup_logger()

    @abstractmethod
    def tokenize(self, text: str) -> list[str]:
        """Tách 1 câu thành list token"""
        pass

    @abstractmethod
    def name(self) -> str:
        """Tên thư viện tách từ"""
        pass

    def tokenize_batch(self, sentences: list[str]) -> list[list[str]]:
        """Tách nhiều câu cùng lúc"""
        return [self.tokenize(sentence) for sentence in sentences]

    def get_config(self) -> dict:
        """Trả về dictionary chứa thông tin cấu hình của tokenizer."""
        stop_words_list = sorted(list(getattr(self, "stop_words", set())))
        return {
            "class": self.__class__.__name__,
            "name": self.name(),
            "stop_words_count": len(stop_words_list),
            "stop_words_hash": self.get_config_hash(),
        }

    def get_config_hash(self) -> str:
        """Mã băm sha256 đại diện cho cấu hình và danh sách stop words của tokenizer."""
        stop_words_list = sorted(list(getattr(self, "stop_words", set())))
        signature = f"{self.__class__.__name__}:{self.name()}:{len(stop_words_list)}:{','.join(stop_words_list)}"
        return hashlib.sha256(signature.encode("utf-8")).hexdigest()

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(lib={self.name()})"


class UndertheseaTokenizer(BaseTokenizer):
    """
    Tách từ dùng thư viện underthesea. Phù hợp tiếng Việt.
    """

    def __init__(self):
        super().__init__()
        try:
            self._word_tokenize = word_tokenize

            # Load stop words (Cả Tiếng Anh và Tiếng Việt)
            self.stop_words: Set[str] = set()
            vi_stop_words_path = (
                Path(__file__).parent.parent / "utils" / "vietnamese-stopwords.txt"
            )
            en_stop_words_path = (
                Path(__file__).parent.parent / "utils" / "english-stopwords.txt"
            )

            for path in [vi_stop_words_path, en_stop_words_path]:
                if path.exists():
                    with open(path, "r", encoding="utf-8") as f:
                        for line in f:
                            w = line.strip().lower()
                            if w:
                                self.stop_words.add(w)

            self.logger.info(
                f"✅ UndertheseaTokenizer khởi tạo thành công! (Loaded {len(self.stop_words)} stop words)"
            )
        except ImportError:
            self.logger.error(
                "❌ Underthesea chưa được cài đặt. Vui lòng cài bằng: pip install underthesea"
            )
            raise ImportError("Underthesea chưa được cài đặt.")

    def name(self) -> str:
        return "underthesea"

    def tokenize(self, text: str) -> list[str]:
        """Tách từ tiếng Việt bằng underthesea, giữ nguyên ranh giới câu, gắn gạch nối cho từ ghép và bỏ stop words."""
        if not text or not str(text).strip():
            return []

        try:
            raw_text = unicodedata.normalize("NFC", str(text).strip())
            # 1. Tokenize bằng underthesea trên văn bản nguyên bản để tận dụng dấu câu phân định ranh giới câu/mệnh đề
            token_string = self._word_tokenize(raw_text, format="text")
            tokens = token_string.split()

            # 2. Làm sạch dấu câu ở rìa mỗi token và loại bỏ stop words
            filtered_tokens = []
            for t in tokens:
                clean_t = re.sub(r"^[^\w]+|[^\w]+$", "", t.lower())
                if clean_t and clean_t not in self.stop_words and len(clean_t) > 1:
                    filtered_tokens.append(clean_t)
            return filtered_tokens

        except Exception as e:
            self.logger.warning(f"Underthesea lỗi với input '{str(text)[:50]}': {e}")
            return [w.lower() for w in re.findall(r"\w+", str(text)) if len(w) > 1]


class EnglishTokenizer(BaseTokenizer):
    """
    Tách từ cơ bản cho tiếng Anh (dùng split()).
    """

    def __init__(self):
        super().__init__()
        self.stop_words: Set[str] = set()
        stop_words_path = (
            Path(__file__).parent.parent / "utils" / "english-stopwords.txt"
        )
        if stop_words_path.exists():
            with open(stop_words_path, "r", encoding="utf-8") as f:
                for line in f:
                    w = line.strip().lower()
                    if w:
                        self.stop_words.add(w)
        self.logger.info(
            f"✅ EnglishTokenizer khởi tạo thành công! (Loaded {len(self.stop_words)} stop words)"
        )

    def name(self) -> str:
        return "split"

    def tokenize(self, text: str) -> list[str]:
        if not text or not str(text).strip():
            return []

        # 1. Clean text (Bỏ dấu câu, chuyển chữ thường)
        cleaned_text = clean_text(str(text), type="normal")

        # 2. Tokenize (Tách theo khoảng trắng)
        tokens = cleaned_text.split()

        # 3. Lọc stop words
        filtered_tokens = [t for t in tokens if t not in self.stop_words]
        return filtered_tokens


def get_tokenizer(lang: str) -> BaseTokenizer:
    if lang.lower() == "vi":
        return UndertheseaTokenizer()
    return EnglishTokenizer()
