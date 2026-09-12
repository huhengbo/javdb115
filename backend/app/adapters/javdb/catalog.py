from __future__ import annotations

from typing import Any

from app.adapters.javdb.query import query_string


class JavdbCatalogApi:
    """公开目录类接口。广告和支付下单不在这里。"""

    # These helpers are implemented by JavdbApiClient. Keeping the contract on the
    # mixin itself avoids annotating ``self`` as a concrete subclass, which is
    # invalid for mypy and makes the mixin harder to reuse/test.
    def _data(self, path: str, extra_params: str = "") -> dict[str, Any]:
        raise NotImplementedError

    def _list_value(self, data: dict[str, Any], key: str) -> list[dict[str, Any]]:
        raise NotImplementedError

    def _post_files(
        self,
        path: str,
        files: dict[str, tuple[str, bytes]],
        extra_params: str = "",
    ) -> dict[str, Any]:
        raise NotImplementedError

    def _dict_value(self, data: dict[str, Any], key: str) -> dict[str, Any]:
        raise NotImplementedError

    def _require_success(self, payload: dict[str, Any], fallback: str) -> dict[str, Any]:
        raise NotImplementedError

    def actors(self, rtype: str, page: int = 1) -> list[dict[str, Any]]:
        return self._items("/api/v1/actors", "actors", query_string(type=rtype, page=page))

    def actors_recommend(self) -> dict[str, Any]:
        return self._data("/api/v1/actors/recommend")

    def directors(self, rtype: str, page: int = 1) -> list[dict[str, Any]]:
        return self._items(
            "/api/v1/directors", "directors", query_string(type=rtype, page=page)
        )

    def director_detail(self, director_id: str) -> dict[str, Any]:
        return self._data(f"/api/v1/directors/{director_id}")

    def makers(self, rtype: str, page: int = 1) -> list[dict[str, Any]]:
        return self._items("/api/v1/makers", "makers", query_string(type=rtype, page=page))

    def maker_detail(self, maker_id: str) -> dict[str, Any]:
        return self._data(f"/api/v1/makers/{maker_id}")

    def series_list(self, rtype: str, page: int = 1) -> list[dict[str, Any]]:
        return self._items("/api/v1/series", "series", query_string(type=rtype, page=page))

    def series_detail(self, series_id: str) -> dict[str, Any]:
        return self._data(f"/api/v1/series/{series_id}")

    def series_letters(self) -> list[dict[str, Any]]:
        return self._items("/api/v1/series/letters", "letters")

    def code_detail(self, code_id: str) -> dict[str, Any]:
        return self._data(f"/api/v1/codes/{code_id}")

    def publisher_detail(self, publisher_id: str) -> dict[str, Any]:
        return self._data(f"/api/v1/publishers/{publisher_id}")

    def catalog_tags(self, rtype: str) -> list[dict[str, Any]]:
        return self._items("/api/v2/tags", "tags", query_string(type=rtype))

    def search_magnet(self, query: str, page: int = 1) -> list[dict[str, Any]]:
        return self._items(
            "/api/v1/search_magnet", "magnets", query_string(q=query, page=page)
        )

    def search_image(
        self,
        image: bytes,
        filename: str = "image.jpg",
    ) -> dict[str, Any]:
        payload = self._post_files("/api/v2/search_image", {"image": (filename, image)})
        return self._dict_value(self._require_success(payload, "以图搜片失败"), "data")

    def lists_related(self, movie_id: str) -> list[dict[str, Any]]:
        return self._items("/api/v1/lists/related", "lists", query_string(movie_id=movie_id))

    def list_detail(self, list_id: str) -> dict[str, Any]:
        return self._data(f"/api/v1/lists/{list_id}")

    def articles(self, page: int = 1) -> list[dict[str, Any]]:
        return self._items("/api/v1/articles", "articles", query_string(page=page))

    def article_detail(self, article_id: str) -> dict[str, Any]:
        return self._data(f"/api/v1/articles/{article_id}")

    def movies_recommend_periods(self) -> list[dict[str, Any]]:
        return self._items("/api/v1/movies/recommend_periods", "periods")

    def reviews_hotly(self, period: str = "daily") -> list[dict[str, Any]]:
        return self._items("/api/v1/reviews/hotly", "reviews", query_string(period=period))

    def magnet_apps(self) -> list[dict[str, Any]]:
        return self._items("/api/v1/magnet_apps", "apps")

    def helps(self, category: str) -> list[dict[str, Any]]:
        return self._items("/api/v1/helps", "helps", query_string(category=category))

    def plans(self) -> dict[str, Any]:
        return self._data("/api/v3/plans")

    def _items(
        self,
        path: str,
        key: str,
        extra_params: str = "",
    ) -> list[dict[str, Any]]:
        return self._list_value(self._data(path, extra_params), key)
