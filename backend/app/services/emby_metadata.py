from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath
from urllib.parse import urlparse
from xml.etree import ElementTree

import httpx

from app.media_urls import external_image_url

IMAGE_TIMEOUT_SECONDS = 20
IMAGE_HEADERS = {
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 javdb115/1.0",
}
IMAGE_EXTENSIONS_BY_TYPE = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@dataclass(frozen=True)
class EmbyMovieMetadata:
    code: str
    title: str | None
    release_date: str | None
    source_url: str
    actors: list[str]
    cover_url: str | None


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
        self._add_text(movie, "tag", "JavDB")
        self._add_text(movie, "plot", metadata.source_url)
        for actor in metadata.actors:
            self._add_actor(movie, actor)
        return movie

    def _poster_image_asset(self, cover_url: str | None) -> list[MetadataAsset]:
        if not cover_url:
            return []
        image_url = external_image_url(cover_url) or cover_url
        image = self._download_image(image_url)
        extension = self._image_extension(
            image_url,
            image.headers.get("content-type"),
            image.content,
        )
        return [
            MetadataAsset(f"poster{extension}", image.content),
            MetadataAsset(f"folder{extension}", image.content),
        ]

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

    def _image_extension(self, url: str, content_type: str | None, content: bytes) -> str:
        signature_extension = self._image_signature_extension(content)
        if signature_extension:
            return signature_extension
        media_type = (content_type or "").split(";", 1)[0].strip().lower()
        if media_type in IMAGE_EXTENSIONS_BY_TYPE:
            return IMAGE_EXTENSIONS_BY_TYPE[media_type]
        suffix = PurePosixPath(urlparse(url).path).suffix.lower()
        if suffix in IMAGE_EXTENSIONS_BY_TYPE.values():
            return suffix
        return ".jpg"

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
