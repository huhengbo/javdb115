from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from xml.etree import ElementTree

import httpx
from PIL import Image

from app.media_urls import external_image_url

IMAGE_TIMEOUT_SECONDS = 20
IMAGE_HEADERS = {
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 javdb115/1.0",
}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
BASE_TAGS = ("JavDB",)
VARIANT_TAGS_BY_SUFFIX = {
    "U": ("无码破解",),
    "C": ("中文字幕",),
    "UC": ("无码破解", "中文字幕"),
}


@dataclass(frozen=True)
class EmbyMovieMetadata:
    code: str
    title: str | None
    release_date: str | None
    source_url: str
    actors: list[str]
    cover_url: str | None
    tags: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class MetadataAsset:
    name: str
    content: bytes


class EmbyMetadataBuilder:
    def build_assets(self, metadata: EmbyMovieMetadata) -> list[MetadataAsset]:
        assets = [self._nfo_asset(metadata)]
        image = self._poster_image_asset(metadata.cover_url)
        if image:
            assets.extend(image)
        return assets

    def _nfo_asset(self, metadata: EmbyMovieMetadata) -> MetadataAsset:
        content = ElementTree.tostring(
            self._movie_element(metadata),
            encoding="utf-8",
            xml_declaration=True,
        )
        return MetadataAsset(f"{metadata.code}.nfo", content)

    def _movie_element(self, metadata: EmbyMovieMetadata) -> ElementTree.Element:
        movie = ElementTree.Element("movie")
        self._add_text(movie, "title", metadata.title or metadata.code)
        self._add_text(movie, "originaltitle", metadata.code)
        self._add_text(movie, "sorttitle", metadata.code)
        self._add_text(movie, "id", metadata.code)
        self._add_unique_id(movie, metadata)
        self._add_text(movie, "premiered", metadata.release_date)
        self._add_text(movie, "releasedate", metadata.release_date)
        self._add_text(movie, "studio", "JavDB")
        for tag in self._tags(metadata):
            self._add_text(movie, "tag", tag)
        self._add_text(movie, "plot", metadata.source_url)
        for actor in metadata.actors:
            self._add_actor(movie, actor)
        return movie

    def _tags(self, metadata: EmbyMovieMetadata) -> list[str]:
        tags = [*BASE_TAGS, *metadata.tags, *self._variant_tags(metadata.code)]
        return self._unique_non_empty(tags)

    def _variant_tags(self, code: str) -> list[str]:
        suffix = code.rsplit("-", 1)[-1].upper() if "-" in code else ""
        return list(VARIANT_TAGS_BY_SUFFIX.get(suffix, ()))

    def _unique_non_empty(self, values: list[str]) -> list[str]:
        seen: set[str] = set()
        unique: list[str] = []
        for value in values:
            normalized = value.strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            unique.append(normalized)
        return unique

    def _poster_image_asset(self, cover_url: str | None) -> list[MetadataAsset]:
        if not cover_url:
            return []
        image_url = external_image_url(cover_url) or cover_url
        image = self._download_image(image_url)
        fanart = self._jpeg_bytes(image.content)
        poster = self._right_half_jpeg_bytes(image.content)
        return [
            MetadataAsset("fanart.jpg", fanart),
            MetadataAsset("landscape.jpg", fanart),
            MetadataAsset("poster.jpg", poster),
        ]

    def _jpeg_bytes(self, content: bytes) -> bytes:
        with Image.open(BytesIO(content)) as image:
            return self._encode_jpeg(image)

    def _right_half_jpeg_bytes(self, content: bytes) -> bytes:
        with Image.open(BytesIO(content)) as image:
            left = image.width // 2 if image.width > 1 else 0
            right_half = image.crop((left, 0, image.width, image.height))
            return self._encode_jpeg(right_half)

    def _encode_jpeg(self, image: Image.Image) -> bytes:
        output = BytesIO()
        image.convert("RGB").save(output, format="JPEG", quality=95)
        return output.getvalue()

    def _download_image(self, url: str) -> httpx.Response:
        response = httpx.get(
            url,
            headers=IMAGE_HEADERS,
            follow_redirects=True,
            timeout=IMAGE_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        if not response.content:
            raise ValueError(f"metadata image was empty: {url}")
        if self._image_signature_extension(response.content) is None:
            raise ValueError(f"metadata image was not a supported image: {url}")
        return response

    def _image_signature_extension(self, content: bytes) -> str | None:
        if content.startswith(b"\xff\xd8\xff"):
            return ".jpg"
        if content.startswith(PNG_SIGNATURE):
            return ".png"
        if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
            return ".webp"
        return None

    def _add_unique_id(
        self,
        movie: ElementTree.Element,
        metadata: EmbyMovieMetadata,
    ) -> None:
        unique_id = ElementTree.SubElement(movie, "uniqueid")
        unique_id.set("type", "javdb")
        unique_id.set("default", "true")
        unique_id.text = metadata.code

    def _add_actor(self, movie: ElementTree.Element, name: str) -> None:
        actor = ElementTree.SubElement(movie, "actor")
        self._add_text(actor, "name", name)

    def _add_text(
        self,
        parent: ElementTree.Element,
        tag: str,
        value: str | None,
    ) -> None:
        if not value:
            return
        element = ElementTree.SubElement(parent, tag)
        element.text = value
