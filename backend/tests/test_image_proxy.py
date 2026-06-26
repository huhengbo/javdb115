from __future__ import annotations

from app.media_urls import build_upstream_image_url, external_image_url


def test_build_upstream_image_url_maps_tp_small_covers_to_jdbstatic_covers() -> None:
    url = build_upstream_image_url(
        "tp.cmastd.com",
        "rhe951l4q/small_covers/82/82E0yV.jpg",
    )

    assert url == "https://c0.jdbstatic.com/covers/82/82E0yV.jpg"


def test_build_upstream_image_url_maps_tp_assets_without_token() -> None:
    url = build_upstream_image_url("tp.cmastd.com", "avatars/83/83V.jpg")

    assert url == "https://c0.jdbstatic.com/avatars/83/83V.jpg"


def test_build_upstream_image_url_maps_spfcas_small_covers_to_jdbstatic_covers() -> None:
    url = build_upstream_image_url(
        "tp.spfcas.com",
        "rhe951l4q/small_covers/9e/9eAQp.jpg",
    )

    assert url == "https://c0.jdbstatic.com/covers/9e/9eAQp.jpg"


def test_build_upstream_image_url_maps_spfcas_samples_to_jdbstatic_samples() -> None:
    url = build_upstream_image_url(
        "tp.spfcas.com",
        "rhe951l4q/samples/mb/Mb7Ar1_s_1.jpg",
    )

    assert url == "https://c0.jdbstatic.com/samples/mb/Mb7Ar1_s_1.jpg"


def test_build_upstream_image_url_keeps_non_tp_hosts_unchanged() -> None:
    url = build_upstream_image_url("c0.jdbstatic.com", "samples/dr/DRPRE4_s_0.jpg")

    assert url == "https://c0.jdbstatic.com/samples/dr/DRPRE4_s_0.jpg"


def test_external_image_url_maps_tp_covers_for_telegram() -> None:
    url = external_image_url("https://tp.cmastd.com/rhe951l4q/covers/yx/yx5O9r.jpg")

    assert url == "https://c0.jdbstatic.com/covers/yx/yx5O9r.jpg"


def test_external_image_url_maps_spfcas_covers_for_telegram() -> None:
    url = external_image_url("https://tp.spfcas.com/rhe951l4q/covers/9e/9eAQp.jpg")

    assert url == "https://c0.jdbstatic.com/covers/9e/9eAQp.jpg"


def test_external_image_url_keeps_unknown_hosts() -> None:
    url = external_image_url("https://example.com/image.jpg")

    assert url == "https://example.com/image.jpg"
