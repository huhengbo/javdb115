from __future__ import annotations

from app.api.image_proxy import build_upstream_image_url


def test_build_upstream_image_url_maps_tp_small_covers_to_jdbstatic_covers() -> None:
    url = build_upstream_image_url(
        "tp.cmastd.com",
        "rhe951l4q/small_covers/82/82E0yV.jpg",
    )

    assert url == "https://c0.jdbstatic.com/covers/82/82E0yV.jpg"


def test_build_upstream_image_url_maps_tp_assets_without_token() -> None:
    url = build_upstream_image_url("tp.cmastd.com", "avatars/83/83V.jpg")

    assert url == "https://c0.jdbstatic.com/avatars/83/83V.jpg"


def test_build_upstream_image_url_keeps_non_tp_hosts_unchanged() -> None:
    url = build_upstream_image_url("c0.jdbstatic.com", "samples/dr/DRPRE4_s_0.jpg")

    assert url == "https://c0.jdbstatic.com/samples/dr/DRPRE4_s_0.jpg"
