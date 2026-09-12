from __future__ import annotations

import pytest

from app.api.javdb_proxy import movies_top
from app.errors import IntegrationError, JavdbAuthRequiredError


class LoginRequiredClient:
    def movies_top(
        self,
        page: int = 1,
        limit: int = 50,
        rtype: str = "all",
        type_value: str = "",
    ) -> list[dict[str, object]]:
        del page, limit, rtype, type_value
        raise IntegrationError("TOP250 需要 JavDB 登录，请先在设置中登录 JavDB 账号")


class FailedClient:
    def movies_top(
        self,
        page: int = 1,
        limit: int = 50,
        rtype: str = "all",
        type_value: str = "",
    ) -> list[dict[str, object]]:
        del page, limit, rtype, type_value
        raise IntegrationError("JavDB API request failed")


def test_top250_translates_login_failure_to_business_auth_error() -> None:
    with pytest.raises(JavdbAuthRequiredError) as caught:
        movies_top(page=1, limit=50, type="all", type_value="", client=LoginRequiredClient())  # type: ignore[arg-type]

    assert caught.value.status_code == 403
    assert caught.value.code == "javdb_auth_required"


def test_top250_keeps_unrelated_integration_errors() -> None:
    with pytest.raises(IntegrationError, match="JavDB API request failed"):
        movies_top(page=1, limit=50, type="all", type_value="", client=FailedClient())  # type: ignore[arg-type]
