from __future__ import annotations

from dataclasses import dataclass

import pytest
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


def test_metadata_builder_creates_poster_and_folder_assets(
    monkeypatch: MonkeyPatch,
) -> None:
    def fake_get(*_: object, **__: object) -> FakeImageResponse:
        return FakeImageResponse(b"\xff\xd8\xffimage-bytes", {"content-type": "image/jpeg"})

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
        "poster.jpg",
        "folder.jpg",
    ]
    assert assets[1].content == b"\xff\xd8\xffimage-bytes"


def test_metadata_builder_maps_tp_cover_before_download(
    monkeypatch: MonkeyPatch,
) -> None:
    requested_urls: list[str] = []

    def fake_get(url: str, **__: object) -> FakeImageResponse:
        requested_urls.append(url)
        return FakeImageResponse(b"\xff\xd8\xffimage-bytes", {"content-type": "image/jpeg"})

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
