"""Unit test cho ``src/core/base_model.py``.

``BaseRecommender`` là abstract base class cho mọi mô hình gợi ý. Test dùng
subclass giả (không train model thật) để kiểm tra:
- không thể khởi tạo trực tiếp / subclass thiếu abstract method;
- danh sách abstract method đúng hợp đồng (``fit/search/save/load``);
- trạng thái mặc định trong ``__init__`` (``tokenizer``, ``config``,
  ``is_fitted``);
- thân mặc định của các abstract method chỉ là no-op (``return None``) —
  code hiện tại dùng ``pass``, KHÔNG ném ``NotImplementedError``;
- ``get_config`` mô tả class + tokenizer + kwargs cấu hình.
"""

import pytest

from src.core.base_model import BaseRecommender

ABSTRACT_METHODS = ("fit", "search", "save", "load")


class FakeTokenizer:
    """Tokenizer giả — chỉ cần ``name()`` cho ``get_config``."""

    def name(self) -> str:
        return "fake-tokenizer"


class DummyRecommender(BaseRecommender):
    """Subclass hợp lệ, ghi lại lời gọi để test hành vi mặc định."""

    def fit(self, corpus, movie_ids, **kwargs):
        self.fitted_corpus = corpus
        self.fitted_ids = movie_ids
        self.fit_kwargs = kwargs
        self.is_fitted = True

    def search(self, query, top_k=10):
        return [{"movie_id": mid, "score": 1.0} for mid in (self.fitted_ids or [])][
            :top_k
        ]

    def save(self, output_dir):
        self.saved_to = output_dir

    def load(self, model_dir):
        self.loaded_from = model_dir


class SuperCallingRecommender(BaseRecommender):
    """Gọi thẳng thân method trừu tượng để kiểm tra hành vi mặc định."""

    def fit(self, corpus, movie_ids, **kwargs):
        return super().fit(corpus, movie_ids, **kwargs)

    def search(self, query, top_k=10):
        return super().search(query, top_k=top_k)

    def save(self, output_dir):
        return super().save(output_dir)

    def load(self, model_dir):
        return super().load(model_dir)


class TestBaseRecommenderAbstract:
    """Hợp đồng abstract của ``BaseRecommender``."""

    def test_cannot_instantiate_directly(self):
        with pytest.raises(TypeError):
            BaseRecommender()

    def test_declared_abstract_methods(self):
        assert set(BaseRecommender.__abstractmethods__) == set(ABSTRACT_METHODS)

    @pytest.mark.parametrize("method_name", ABSTRACT_METHODS)
    def test_abstract_methods_are_flagged(self, method_name):
        method = getattr(BaseRecommender, method_name)

        assert getattr(method, "__isabstractmethod__", False) is True

    def test_subclass_missing_one_abstract_method_cannot_be_instantiated(self):
        class MissingFit(BaseRecommender):
            def search(self, query, top_k=10):
                return []

            def save(self, output_dir):
                pass

            def load(self, model_dir):
                pass

        with pytest.raises(TypeError) as exc_info:
            MissingFit()

        assert "fit" in str(exc_info.value)

    def test_complete_subclass_can_be_instantiated(self):
        model = DummyRecommender()

        assert isinstance(model, BaseRecommender)
        assert model.is_fitted is False


class TestBaseRecommenderInit:
    """Trạng thái mặc định do ``__init__`` thiết lập."""

    def test_defaults(self):
        model = DummyRecommender()

        assert model.tokenizer is None
        assert model.config == {}
        assert model.is_fitted is False

    def test_stores_tokenizer_and_kwargs_config(self):
        tokenizer = FakeTokenizer()

        model = DummyRecommender(tokenizer=tokenizer, alpha=0.5, top_k=20)

        assert model.tokenizer is tokenizer
        assert model.config == {"alpha": 0.5, "top_k": 20}

    def test_fit_contract_updates_state_and_passes_kwargs(self):
        model = DummyRecommender()

        model.fit(["a", "b"], [1, 2], epochs=3)

        assert model.is_fitted is True
        assert model.fitted_corpus == ["a", "b"]
        assert model.fitted_ids == [1, 2]
        assert model.fit_kwargs == {"epochs": 3}
        assert model.search("a", top_k=1) == [{"movie_id": 1, "score": 1.0}]

    def test_save_and_load_are_implemented_by_subclass(self):
        model = DummyRecommender()

        model.save("out-dir")
        model.load("model-dir")

        assert model.saved_to == "out-dir"
        assert model.loaded_from == "model-dir"


class TestAbstractMethodDefaultBody:
    """Thân mặc định của abstract method là no-op (``pass``), không raise."""

    def test_default_bodies_return_none(self):
        model = SuperCallingRecommender()

        assert model.fit(["text"], [1]) is None
        assert model.search("query") is None
        assert model.save("out-dir") is None
        assert model.load("model-dir") is None

    def test_default_body_does_not_change_state(self):
        model = SuperCallingRecommender()

        model.fit(["text"], [1])

        assert model.is_fitted is False


class TestGetConfig:
    """``get_config`` trả metadata cấu hình để log vào experiment tracker."""

    def test_reports_class_name_and_no_tokenizer(self):
        config = DummyRecommender().get_config()

        assert config["model_class"] == "DummyRecommender"
        assert config["tokenizer"] == "none"

    def test_reports_tokenizer_name(self):
        config = DummyRecommender(tokenizer=FakeTokenizer()).get_config()

        assert config["tokenizer"] == "fake-tokenizer"

    def test_merges_kwargs_into_config(self):
        config = DummyRecommender(alpha=0.5, seed=42).get_config()

        assert config["alpha"] == 0.5
        assert config["seed"] == 42

    def test_does_not_leak_internal_state(self):
        config = DummyRecommender(alpha=1).get_config()

        assert "is_fitted" not in config
        assert "config" not in config
        assert "tokenizer" in config

    def test_returns_new_dict_each_call(self):
        model = DummyRecommender(alpha=1)

        first = model.get_config()
        first["alpha"] = 999

        assert model.get_config()["alpha"] == 1
