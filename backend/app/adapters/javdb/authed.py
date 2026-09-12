from __future__ import annotations

from typing import Any, Protocol, cast


class JavdbAuthedHttp(Protocol):
    def _get(self, path: str, extra_params: str = "") -> dict[str, Any]: ...

    def _post(
        self,
        path: str,
        fields: dict[str, str],
        extra_params: str = "",
    ) -> dict[str, Any]: ...

    def _delete(self, path: str, extra_params: str = "") -> dict[str, Any]: ...

    def _require_success(self, payload: dict[str, Any], fallback: str) -> dict[str, Any]: ...

    def _dict_value(self, data: dict[str, Any], key: str) -> dict[str, Any]: ...

    def _list_value(self, data: dict[str, Any], key: str) -> list[dict[str, Any]]: ...


class JavdbAuthedApi:
    """JavDB App 需登录接口。只依赖底层 HTTP client，不碰设置、路由或业务库。"""

    def __init__(self, http: JavdbAuthedHttp) -> None:
        self._http = http

    def current_user(self) -> dict[str, Any]:
        """当前登录用户。

        入参: 无，依赖 client 上的 authorization。
        出参: dict，字段含 id, username, email, is_vip, vip_expired_at,
        want_watch_count, watched_count。
        """
        return self._data_dict(self._ok(self._http._get("/api/v1/users")), "user")

    def user_additional(self) -> dict[str, Any]:
        return self._data(self._ok(self._http._get("/api/v1/users/additional")))

    def recent_viewed(self, page: int = 1, limit: int = 24) -> list[dict[str, Any]]:
        return self._data_list(
            self._ok(self._http._get("/api/v1/users/recent_viewed", _page(page, limit))),
            "movies",
        )

    def review_movies(
        self,
        status: str,
        *,
        movie_type: str = "0",
        sort_by: str = "create",
        order_by: str = "desc",
        page: int = 1,
        limit: int = 48,
    ) -> list[dict[str, Any]]:
        query = (
            f"status={status}&type={movie_type}&sort_by={sort_by}&order_by={order_by}"
            f"&{_page(page, limit)}"
        )
        return self._data_list(
            self._ok(self._http._get("/api/v2/users/review_movies", query)),
            "movies",
        )

    def want_watch_movies(self, page: int = 1, limit: int = 48) -> list[dict[str, Any]]:
        return self.review_movies("want_watch", page=page, limit=limit)

    def watched_movies(self, page: int = 1, limit: int = 48) -> list[dict[str, Any]]:
        return self.review_movies("watched", page=page, limit=limit)

    def collected_actors(self, page: int = 1, limit: int = 60) -> list[dict[str, Any]]:
        return self._data_list(
            self._ok(self._http._get("/api/v1/users/collected_actors", _page(page, limit))),
            "actors",
        )

    def collected_makers(self, page: int = 1, limit: int = 48) -> list[dict[str, Any]]:
        return self._data_list(
            self._ok(self._http._get("/api/v1/users/collected_makers", _page(page, limit))),
            "makers",
        )

    def collected_series(self, page: int = 1, limit: int = 48) -> list[dict[str, Any]]:
        return self._data_list(
            self._ok(self._http._get("/api/v1/users/collected_series", _page(page, limit))),
            "series",
        )

    def collected_directors(self, page: int = 1, limit: int = 48) -> list[dict[str, Any]]:
        return self._data_list(
            self._ok(self._http._get("/api/v1/users/collected_directors", _page(page, limit))),
            "directors",
        )

    def collected_codes(self, page: int = 1, limit: int = 48) -> list[dict[str, Any]]:
        return self._data_list(
            self._ok(self._http._get("/api/v1/users/collected_codes", _page(page, limit))),
            "codes",
        )

    def collected_lists(self, page: int = 1, limit: int = 48) -> list[dict[str, Any]]:
        return self._data_list(
            self._ok(self._http._get("/api/v1/users/collected_lists", _page(page, limit))),
            "lists",
        )

    def collect_actor(self, actor_id: str) -> dict[str, Any]:
        return self._collect(f"/api/v1/actors/{actor_id}/collect_actions", "collect")

    def uncollect_actor(self, actor_id: str) -> dict[str, Any]:
        return self._collect(f"/api/v1/actors/{actor_id}/collect_actions", "uncollect")

    def collect_maker(self, maker_id: str) -> dict[str, Any]:
        return self._collect(f"/api/v1/makers/{maker_id}/collect_actions", "collect")

    def uncollect_maker(self, maker_id: str) -> dict[str, Any]:
        return self._collect(f"/api/v1/makers/{maker_id}/collect_actions", "uncollect")

    def collect_series(self, series_id: str) -> dict[str, Any]:
        return self._collect(f"/api/v1/series/{series_id}/collect_actions", "collect")

    def uncollect_series(self, series_id: str) -> dict[str, Any]:
        return self._collect(f"/api/v1/series/{series_id}/collect_actions", "uncollect")

    def collect_director(self, director_id: str) -> dict[str, Any]:
        return self._collect(f"/api/v1/directors/{director_id}/collect_actions", "collect")

    def uncollect_director(self, director_id: str) -> dict[str, Any]:
        return self._collect(f"/api/v1/directors/{director_id}/collect_actions", "uncollect")

    def collect_code(self, code_id: str) -> dict[str, Any]:
        return self._collect(f"/api/v1/codes/{code_id}/collect_actions", "collect")

    def uncollect_code(self, code_id: str) -> dict[str, Any]:
        return self._collect(f"/api/v1/codes/{code_id}/collect_actions", "uncollect")

    def collect_list(self, list_id: str) -> dict[str, Any]:
        return self._collect(f"/api/v1/lists/{list_id}/collect_actions", "collect")

    def uncollect_list(self, list_id: str) -> dict[str, Any]:
        return self._collect(f"/api/v1/lists/{list_id}/collect_actions", "uncollect")

    def lists_simple(self) -> list[dict[str, Any]]:
        return self._data_list(self._ok(self._http._get("/api/v1/lists/simple")), "lists")

    def add_list_movie(self, list_id: str, movie_id: str) -> dict[str, Any]:
        return self._list_movie_action(list_id, movie_id, "add")

    def remove_list_movie(self, list_id: str, movie_id: str) -> dict[str, Any]:
        return self._list_movie_action(list_id, movie_id, "remove")

    def set_movie_watch_status(
        self,
        movie_id: str,
        status: str,
        score: str = "0",
        content: str = "",
    ) -> dict[str, Any]:
        return self._data(
            self._ok(
                self._http._post(
                    f"/api/v1/movies/{movie_id}/reviews",
                    {"status": status, "score": score, "content": content},
                )
            )
        )

    def movie_play(
        self,
        movie_id: str,
        source_id: str,
        *,
        from_rankings: bool = False,
        operation: str = "play",
    ) -> dict[str, Any]:
        query = (
            f"source_id={source_id}&from_rankings={str(from_rankings).lower()}"
            f"&operation={operation}"
        )
        return self._data(self._ok(self._http._get(f"/api/v1/movies/{movie_id}/play", query)))

    def movie_resume_play(
        self,
        movie_id: str,
        *,
        source_id: str = "",
        episode: str = "",
        resolution: str = "",
    ) -> dict[str, Any]:
        parts = [item for item in (
            f"source_id={source_id}" if source_id else "",
            f"episode={episode}" if episode else "",
            f"resolution={resolution}" if resolution else "",
        ) if item]
        return self._data(
            self._ok(self._http._get(f"/api/v1/movies/{movie_id}/resume_play", "&".join(parts)))
        )

    def may_also_like(self, movie_id: str) -> list[dict[str, Any]]:
        """登录后的相似作品。

        入参:
            movie_id: 作品 id。
        出参:
            list[dict]，作品列表。未登录返回 JWTVerificationError。
        """
        return self._data_list(
            self._ok(self._http._get("/api/v1/movies/may_also_like", f"movie_id={movie_id}")),
            "movies",
        )

    def like_review(self, movie_id: str, review_id: str) -> dict[str, Any]:
        """给短评点赞。

        入参:
            movie_id: 作品 id。
            review_id: 评论 id。
        出参:
            dict，接口 data。
        """
        return self._data(
            self._ok(
                self._http._post(f"/api/v1/movies/{movie_id}/reviews/{review_id}/like", {})
            )
        )

    def report_review(self, movie_id: str, review_id: str) -> dict[str, Any]:
        """举报短评。需登录。

        入参:
            movie_id: 作品 id。
            review_id: 评论 id。
        出参:
            dict，接口 data。
        """
        return self._data(
            self._ok(
                self._http._post(f"/api/v1/movies/{movie_id}/reviews/{review_id}/report", {})
            )
        )

    def delete_review(self, movie_id: str, review_id: str) -> dict[str, Any]:
        """删除自己的短评。需登录。

        入参:
            movie_id: 作品 id。
            review_id: 评论 id。
        出参:
            dict，接口 data。
        """
        return self._data(
            self._ok(self._http._delete(f"/api/v1/movies/{movie_id}/reviews/{review_id}"))
        )

    def log_movie_played(self, movie_id: str) -> dict[str, Any]:
        """上报播放记录。

        入参:
            movie_id: 作品 id，必填。
        出参:
            dict，接口 data。
        """
        return self._data(
            self._ok(self._http._post("/api/v1/logs/movie_played", {"movie_id": movie_id}))
        )

    def following_tags_push(self, tags: str) -> dict[str, Any]:
        """批量添加关注标签。

        入参:
            tags: 标签内容，服务端要求字段名 `tags`。
        出参:
            dict，接口 data。
        """
        return self._data(
            self._ok(self._http._post("/api/v1/following_tags/batch_push", {"tags": tags}))
        )

    def following_tags_destroy(self, ids: str) -> dict[str, Any]:
        """批量删除关注标签。

        入参:
            ids: 标签 id，逗号分隔，字段名 `ids`。
        出参:
            dict，接口 data。
        """
        return self._data(
            self._ok(self._http._post("/api/v1/following_tags/batch_destroy", {"ids": ids}))
        )

    def unpaid_tickets(self) -> dict[str, Any]:
        """未支付订单。只读。

        入参: 无。
        出参:
            dict，接口 data。
        """
        return self._data(self._ok(self._http._get("/api/v1/users/unpaid_tickets")))

    def following_tags(self) -> list[dict[str, Any]]:
        payload = self._ok(self._http._get("/api/v1/following_tags"))
        data = self._data(payload)
        tags = data.get("following_tags")
        if isinstance(tags, list):
            return [cast(dict[str, Any], item) for item in tags if isinstance(item, dict)]
        return self._http._list_value(payload, "data")

    def wallet(self) -> dict[str, Any]:
        return self._data(self._ok(self._http._get("/api/v1/wallets")))

    def wallet_usdt_chain_types(self) -> list[str]:
        data = self._data(self._ok(self._http._get("/api/v1/wallets/usdt_chain_types")))
        values = data.get("chain_types")
        if not isinstance(values, list):
            return []
        return [str(item) for item in values]

    def binded_withdraw_accounts(self) -> list[dict[str, Any]]:
        return self._data_list(
            self._ok(self._http._get("/api/v1/wallets/binded_withdraw_accounts")),
            "accounts",
        )

    def withdraw_logs(self, page: int = 1) -> dict[str, Any]:
        payload = self._ok(self._http._get("/api/v1/wallets/withdraw_logs", f"page={page}"))
        return self._data(payload)

    def rebate_logs(self, page: int = 1) -> dict[str, Any]:
        return self._data(self._ok(self._http._get("/api/v1/wallets/rebate_logs", f"page={page}")))

    def transaction_logs(self, page: int = 1) -> dict[str, Any]:
        return self._data(
            self._ok(self._http._get("/api/v1/users/transaction_logs", f"page={page}"))
        )

    def promotion_logs(self, page: int = 1) -> dict[str, Any]:
        return self._data(
            self._ok(self._http._get("/api/v1/users/promotion_logs", f"page={page}"))
        )

    def _collect(self, path: str, action: str) -> dict[str, Any]:
        return self._data(self._ok(self._http._post(path, {"name": action})))

    def _list_movie_action(self, list_id: str, movie_id: str, action: str) -> dict[str, Any]:
        return self._data(
            self._ok(
                self._http._post(
                    f"/api/v1/lists/{list_id}/movie_actions",
                    {"movie_id": movie_id, "name": action},
                )
            )
        )

    def _ok(
        self,
        payload: dict[str, Any],
        fallback: str = "JavDB 需登录接口调用失败",
    ) -> dict[str, Any]:
        return self._http._require_success(payload, fallback)

    def _data(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._http._dict_value(payload, "data")

    def _data_dict(self, payload: dict[str, Any], key: str) -> dict[str, Any]:
        return self._http._dict_value(self._data(payload), key)

    def _data_list(self, payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
        return self._http._list_value(self._data(payload), key)


def _page(page: int, limit: int) -> str:
    return f"page={page}&limit={limit}"
