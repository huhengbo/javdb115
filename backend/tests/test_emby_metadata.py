from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from typing import cast

import pytest
from PIL import Image
from pytest import MonkeyPatch

from app.services.emby_metadata import EmbyMetadataBuilder, EmbyMovieMetadata


@dataclass(frozen=True)
class FakeImageResponse:
    content: bytes
    headers: dict[str, str]

    def raise_for_status(self) -> None:
        return None


def test_metadata_builder_creates_emby_nfo() -> None:
    assets = EmbyMetadataBuilder().build_assets(
        EmbyMovieMetadata(
            code="ABC-123",
            title="Sample Title",
            release_date="2026-05-19",
            source_url="https://javdb.com/v/sample",
            actors=["Actor A", "Actor B"],
            cover_url=None,
        )
    )

    assert [asset.name for asset in assets] == ["ABC-123.nfo"]
    content = assets[0].content.decode()
    assert "<movie>" in content
    assert "<title>Sample Title</title>" in content
    assert "<originaltitle>ABC-123</originaltitle>" in content
    assert "<premiered>2026-05-19</premiered>" in content
    assert "<tag>JavDB</tag>" in content
    assert "<name>Actor A</name>" in content


def test_metadata_builder_adds_variant_tags() -> None:
    cases = {
        "ABC-123-U": ["无码破解"],
        "ABC-123-C": ["中文字幕"],
        "ABC-123-UC": ["无码破解", "中文字幕"],
    }

    for code, tags in cases.items():
        assets = EmbyMetadataBuilder().build_assets(
            EmbyMovieMetadata(
                code=code,
                title=None,
                release_date=None,
                source_url="https://javdb.com/v/sample",
                actors=[],
                cover_url=None,
            )
        )
        content = assets[0].content.decode()
        for tag in tags:
            assert f"<tag>{tag}</tag>" in content


def test_metadata_builder_deduplicates_tags() -> None:
    assets = EmbyMetadataBuilder().build_assets(
        EmbyMovieMetadata(
            code="ABC-123-U",
            title=None,
            release_date=None,
            source_url="https://javdb.com/v/sample",
            actors=[],
            cover_url=None,
            tags=["JavDB", "无码破解", "自定义"],
        )
    )
    content = assets[0].content.decode()

    assert content.count("<tag>JavDB</tag>") == 1
    assert content.count("<tag>无码破解</tag>") == 1
    assert "<tag>自定义</tag>" in content


def test_metadata_builder_creates_emby_image_assets(
    monkeypatch: MonkeyPatch,
) -> None:
    def fake_get(*_: object, **__: object) -> FakeImageResponse:
        return FakeImageResponse(two_panel_jpeg(), {"content-type": "image/jpeg"})

    monkeypatch.setattr("app.services.emby_metadata.httpx.get", fake_get)

    assets = EmbyMetadataBuilder().build_assets(
        EmbyMovieMetadata(
            code="ABC-123",
            title=None,
            release_date=None,
            source_url="https://javdb.com/v/sample",
            actors=[],
            cover_url="https://example.test/cover.jpg",
        )
    )

    assert [asset.name for asset in assets] == [
        "ABC-123.nfo",
        "fanart.jpg",
        "landscape.jpg",
        "poster.jpg",
    ]
    assert jpeg_size(assets[1].content) == (4, 2)
    assert jpeg_size(assets[2].content) == (4, 2)
    assert jpeg_size(assets[3].content) == (2, 2)
    assert dominant_blue(assets[3].content)


def test_metadata_builder_maps_tp_cover_before_download(
    monkeypatch: MonkeyPatch,
) -> None:
    requested_urls: list[str] = []

    def fake_get(url: str, **__: object) -> FakeImageResponse:
        requested_urls.append(url)
        return FakeImageResponse(two_panel_jpeg(), {"content-type": "image/jpeg"})

    monkeypatch.setattr("app.services.emby_metadata.httpx.get", fake_get)

    EmbyMetadataBuilder().build_assets(
        EmbyMovieMetadata(
            code="ABC-123",
            title=None,
            release_date=None,
            source_url="https://javdb.com/v/sample",
            actors=[],
            cover_url="https://tp.cmastd.com/rhe951l4q/covers/ab/abc123.jpg",
        )
    )

    assert requested_urls == ["https://c0.jdbstatic.com/covers/ab/abc123.jpg"]


def test_metadata_builder_rejects_non_image_payload(
    monkeypatch: MonkeyPatch,
) -> None:
    def fake_get(*_: object, **__: object) -> FakeImageResponse:
        return FakeImageResponse(b"not-an-image", {"content-type": "binary/octet-stream"})

    monkeypatch.setattr("app.services.emby_metadata.httpx.get", fake_get)

    with pytest.raises(ValueError, match="not a supported image"):
        EmbyMetadataBuilder().build_assets(
            EmbyMovieMetadata(
                code="ABC-123",
                title=None,
                release_date=None,
                source_url="https://javdb.com/v/sample",
                actors=[],
                cover_url="https://example.test/cover.jpg",
            )
        )


def two_panel_jpeg() -> bytes:
    image = Image.new("RGB", (4, 2))
    for x in range(2):
        for y in range(2):
            image.putpixel((x, y), (255, 0, 0))
    for x in range(2, 4):
        for y in range(2):
            image.putpixel((x, y), (0, 0, 255))
    output = BytesIO()
    image.save(output, format="JPEG", quality=100)
    return output.getvalue()


def jpeg_size(content: bytes) -> tuple[int, int]:
    with Image.open(BytesIO(content)) as image:
        return image.size


def dominant_blue(content: bytes) -> bool:
    with Image.open(BytesIO(content)) as image:
        red, _, blue = cast(tuple[int, int, int], image.convert("RGB").getpixel((0, 0)))
    return blue > red
