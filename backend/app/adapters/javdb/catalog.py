from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.adapters.javdb.query import query_string

if TYPE_CHECKING:
    from app.adapters.javdb.client import JavdbApiClient


class JavdbCatalogApi:
    """公开目录类接口。广告和支付下单不在这里。"""

    def actors(self: JavdbApiClient, rtype: str, page: int = 1) -> list[dict[str, Any]]:
        """演员列表。

        入参:
            rtype: 分类，`0` 有码 / `1` 无码 / `2` 欧美 / `3` FC2。必填。
            page: 页码，从 1 开始。
        出参:
            list[dict]，每项常见字段: id, type, avatar_url, name, name_zht,
            other_name, uncensored, gender, videos_count。
        """
        return self._items("/api/v1/actors", "actors", query_string(type=rtype, page=page))

    def actors_recommend(self: JavdbApiClient) -> dict[str, Any]:
        """推荐演员。

        入参: 无。
        出参:
            dict，含 new_actors / monthly_actors / recommend_actors，
            每项演员字段同 actors()。
        """
        return self._data("/api/v1/actors/recommend")

    def directors(self: JavdbApiClient, rtype: str, page: int = 1) -> list[dict[str, Any]]:
        """导演列表。

        入参:
            rtype: 分类 `0|1|2|3`，必填。
            page: 页码。
        出参:
            list[dict]，导演条目；常见字段含 id, name。
        """
        return self._items(
            "/api/v1/directors", "directors", query_string(type=rtype, page=page)
        )

    def director_detail(self: JavdbApiClient, director_id: str) -> dict[str, Any]:
        """导演详情。

        入参:
            director_id: 导演 id。
        出参:
            dict，含 director；后续作品列表用
            movies_by_tag(filter_by='{type}:d:{id}:')。
        """
        return self._data(f"/api/v1/directors/{director_id}")

    def makers(self: JavdbApiClient, rtype: str, page: int = 1) -> list[dict[str, Any]]:
        """片商列表。

        入参:
            rtype: `0` 有码 / `1` 无码 / `2` 欧美 / `3` FC2。必填。
            page: 页码。
        出参:
            list[dict]，常见字段: id, type, name, videos_count。
        """
        return self._items("/api/v1/makers", "makers", query_string(type=rtype, page=page))

    def maker_detail(self: JavdbApiClient, maker_id: str) -> dict[str, Any]:
        """片商详情。

        入参:
            maker_id: 片商 id。
        出参:
            dict，含 maker, share_info, has_collected。
            作品列表: movies_by_tag(filter_by='{type}:m:{id}:')。
        """
        return self._data(f"/api/v1/makers/{maker_id}")

    def series_list(self: JavdbApiClient, rtype: str, page: int = 1) -> list[dict[str, Any]]:
        """系列列表。

        入参:
            rtype: `0|1|2|3`，必填。
            page: 页码。
        出参:
            list[dict]，字段: id, type, name, videos_count。
        """
        return self._items("/api/v1/series", "series", query_string(type=rtype, page=page))

    def series_detail(self: JavdbApiClient, series_id: str) -> dict[str, Any]:
        """系列详情。

        入参:
            series_id: 系列 id。
        出参:
            dict，含 series, share_info, has_collected。
            作品列表: movies_by_tag(filter_by='{type}:s:{id}:')。
        """
        return self._data(f"/api/v1/series/{series_id}")

    def series_letters(self: JavdbApiClient) -> list[dict[str, Any]]:
        """系列字母索引。

        入参: 无。
        出参:
            list[dict]，字段: id, letter, type, description, videos_count, views_count。
        """
        return self._items("/api/v1/series/letters", "letters")

    def code_detail(self: JavdbApiClient, code_id: str) -> dict[str, Any]:
        """番号前缀详情。id 用作品的 number_letter，例如 `IPZZ`。

        入参:
            code_id: 番号前缀。
        出参:
            dict，含 code(name, videos_count), share_info, has_collected。
            作品列表: movies_by_tag(filter_by='0:c:{code_id}:')。
        """
        return self._data(f"/api/v1/codes/{code_id}")

    def publisher_detail(self: JavdbApiClient, publisher_id: str) -> dict[str, Any]:
        """发行商详情。

        入参:
            publisher_id: 发行商 id。
        出参:
            dict，含 publisher, share_info。
        """
        return self._data(f"/api/v1/publishers/{publisher_id}")

    def catalog_tags(self: JavdbApiClient, rtype: str) -> list[dict[str, Any]]:
        """分类筛选项。

        入参:
            rtype: `0` 有码 / `1` 无码 / `2` 欧美 / `3` FC2 / `4` 动画。
        出参:
            list[dict]，每组含 category, category_id, tags[{id,name}]。
            再配合 movies_by_tag(filter_by='{type}:t:{main}:{extra}:{year}:{duration}:{month}')。
        """
        return self._items("/api/v2/tags", "tags", query_string(type=rtype))

    def search_magnet(self: JavdbApiClient, query: str, page: int = 1) -> list[dict[str, Any]]:
        """按关键字搜磁链（不依赖作品 id）。

        入参:
            query: 番号或关键词，必填。
            page: 页码。
        出参:
            list[dict]，字段: id, title, hash, size, files_count, created_at。
        """
        return self._items(
            "/api/v1/search_magnet", "magnets", query_string(q=query, page=page)
        )

    def search_image(
        self: JavdbApiClient,
        image: bytes,
        filename: str = "image.jpg",
    ) -> dict[str, Any]:
        """以图搜演员。公开签名接口，不要求登录。

        入参:
            image: 图片字节，字段名必须是 `image`。支持 jpg/png/gif/mp4。
            filename: 上传文件名，仅用于 multipart。
        出参:
            dict。识别成功时 type='actor'，actors[] 含 id, name, avatar_url,
            uncensored, percentage(0-100)。
        """
        payload = self._post_files("/api/v2/search_image", {"image": (filename, image)})
        return self._dict_value(self._require_success(payload, "以图搜片失败"), "data")

    def lists_related(self: JavdbApiClient, movie_id: str) -> list[dict[str, Any]]:
        """作品相关片单。

        入参:
            movie_id: 作品 id，必填。
        出参:
            list[dict]，字段: id, name, description, movies_count, views_count,
            collections_count, is_default, share_info, created_at。
        """
        return self._items("/api/v1/lists/related", "lists", query_string(movie_id=movie_id))

    def list_detail(self: JavdbApiClient, list_id: str) -> dict[str, Any]:
        """片单详情。

        入参:
            list_id: 片单 id。
        出参:
            dict，含 list, is_creator, share_info, has_collected。
            作品列表: movies_by_tag(filter_by='0:l:{list_id}:')。
        """
        return self._data(f"/api/v1/lists/{list_id}")

    def articles(self: JavdbApiClient, page: int = 1) -> list[dict[str, Any]]:
        """文章列表。

        入参:
            page: 页码。
        出参:
            list[dict]，字段: id, title, cover_url, author, category, released_at。
        """
        return self._items("/api/v1/articles", "articles", query_string(page=page))

    def article_detail(self: JavdbApiClient, article_id: str) -> dict[str, Any]:
        """文章详情。

        入参:
            article_id: 文章 id。
        出参:
            dict，字段: id, title, origin_name, origin_url, cover_url, author,
            category, image_domain, content, released_at, related_movies。
        """
        return self._data(f"/api/v1/articles/{article_id}")

    def movies_recommend_periods(self: JavdbApiClient) -> list[dict[str, Any]]:
        """推荐期次列表，配合 movies_recommend(period) 使用。

        入参: 无。
        出参:
            list[dict]，字段: period, movies_count, views_count, created_at。
        """
        return self._items("/api/v1/movies/recommend_periods", "periods")

    def reviews_hotly(self: JavdbApiClient, period: str = "daily") -> list[dict[str, Any]]:
        """热评。

        入参:
            period: `daily` / `weekly` / `monthly`。
        出参:
            list[dict]，评论条目。
        """
        return self._items("/api/v1/reviews/hotly", "reviews", query_string(period=period))

    def magnet_apps(self: JavdbApiClient) -> list[dict[str, Any]]:
        """推荐的磁力客户端（115 / PikPak 等）。不含广告位。

        入参: 无。
        出参:
            list[dict]，字段: name, description, recommended, links[{text,href}]。
        """
        return self._items("/api/v1/magnet_apps", "apps")

    def helps(self: JavdbApiClient, category: str) -> list[dict[str, Any]]:
        """帮助文案。

        入参:
            category: 帮助分类，必填。
        出参:
            list[dict]，字段: question, answer。
        """
        return self._items("/api/v1/helps", "helps", query_string(category=category))

    def plans(self: JavdbApiClient) -> dict[str, Any]:
        """会员套餐展示（只读，不含下单）。

        入参: 无。
        出参:
            dict，含 plan_message, plans, platforms 等展示字段。
        """
        return self._data("/api/v3/plans")

    def _items(
        self: JavdbApiClient, path: str, key: str, extra_params: str = ""
    ) -> list[dict[str, Any]]:
        return self._list_value(self._data(path, extra_params), key)
