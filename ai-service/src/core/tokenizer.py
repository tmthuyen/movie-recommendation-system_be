from utils import setup_logger
from pathlib import Path
from abc import ABC, abstractmethod
from underthesea import word_tokenize
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
            self.stop_words = set()
            vi_stop_words_path = Path(__file__).parent.parent / "utils" / "vietnamese-stopwords.txt"
            en_stop_words_path = Path(__file__).parent.parent / "utils" / "english-stopwords.txt"
            
            for path in [vi_stop_words_path, en_stop_words_path]:
                if path.exists():
                    with open(path, 'r', encoding='utf-8') as f:
                        for line in f:
                            w = line.strip().lower()
                            if w:
                                self.stop_words.add(w)
            
            self.logger.info(f"✅ UndertheseaTokenizer khởi tạo thành công! (Loaded {len(self.stop_words)} stop words)")
        except ImportError:
            self.logger.error("❌ Underthesea chưa được cài đặt. Vui lòng cài bằng: pip install underthesea")
            raise ImportError("Underthesea chưa được cài đặt.")
        
    def name(self) -> str:
        return "underthesea"
    
    def tokenize(self, text: str) -> list[str]:
        """Tách từ, làm sạch văn bản, gắn gạch dưới cho từ ghép và bỏ stop words"""
        if not text or not str(text).strip():
            return []
            
        try:
            # 1. Clean text (Bỏ dấu câu, chuyển chữ thường)
            cleaned_text = clean_text(str(text), type='normal')
            
            # 2. Tokenize bằng underthesea với format="text" để tạo dấu gạch nối (VD: "bạn_bè")
            # Sau đó split() chuỗi đó ra thành danh sách
            token_string = self._word_tokenize(cleaned_text, format="text")
            tokens = token_string.split()
            
            # 3. Loại bỏ stop words
            filtered_tokens = [t for t in tokens if t not in self.stop_words]
            return filtered_tokens
            
        except Exception as e:
            self.logger.warning(f"Underthesea lỗi với input '{str(text)[:50]}': {e}")
            return str(text).split()


class EnglishTokenizer(BaseTokenizer):
    """
    Tách từ cơ bản cho tiếng Anh (dùng split()).
    """
    
    def __init__(self):
        super().__init__()
        self.stop_words = set()
        stop_words_path = Path(__file__).parent.parent / "utils" / "english-stopwords.txt"
        if stop_words_path.exists():
            with open(stop_words_path, 'r', encoding='utf-8') as f:
                for line in f:
                    w = line.strip().lower()
                    if w:
                        self.stop_words.add(w)
        self.logger.info(f"✅ EnglishTokenizer khởi tạo thành công! (Loaded {len(self.stop_words)} stop words)")
        
    def name(self) -> str:
        return "split"
    
    def tokenize(self, text: str) -> list[str]:
        if not text or not str(text).strip():
            return []
            
        # 1. Clean text (Bỏ dấu câu, chuyển chữ thường)
        cleaned_text = clean_text(str(text), type='normal')
        
        # 2. Tokenize (Tách theo khoảng trắng)
        tokens = cleaned_text.split()
        
        # 3. Lọc stop words
        filtered_tokens = [t for t in tokens if t not in self.stop_words]
        return filtered_tokens

def get_tokenizer(lang: str) -> BaseTokenizer:
    if lang.lower() == 'vi':
        return UndertheseaTokenizer()
    return EnglishTokenizer()
