from pathlib import Path

import pytest

from app import main


def test_frontend_serves_service_worker_instead_of_spa_fallback(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    (tmp_path / "index.html").write_text("<html>app</html>", encoding="utf-8")
    (tmp_path / "sw.js").write_text("self.addEventListener('install', () => {});", encoding="utf-8")
    monkeypatch.setattr(main, "STATIC_DIR", tmp_path)

    response = main.frontend("sw.js")

    assert Path(response.path) == tmp_path / "sw.js"
    assert response.media_type == "text/javascript"
    assert response.headers["cache-control"] == "no-cache, no-store, must-revalidate"


def test_frontend_serves_manifest_instead_of_spa_fallback(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    (tmp_path / "index.html").write_text("<html>app</html>", encoding="utf-8")
    (tmp_path / "manifest.webmanifest").write_text('{"name":"JAVDB 115"}', encoding="utf-8")
    monkeypatch.setattr(main, "STATIC_DIR", tmp_path)

    response = main.frontend("manifest.webmanifest")

    assert Path(response.path) == tmp_path / "manifest.webmanifest"
    assert response.media_type == "application/manifest+json"


def test_frontend_keeps_spa_fallback_for_application_routes(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    (tmp_path / "index.html").write_text("<html>app</html>", encoding="utf-8")
    monkeypatch.setattr(main, "STATIC_DIR", tmp_path)

    response = main.frontend("discovery")

    assert Path(response.path) == tmp_path / "index.html"


def test_frontend_fails_when_declared_pwa_asset_is_missing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    (tmp_path / "index.html").write_text("<html>app</html>", encoding="utf-8")
    monkeypatch.setattr(main, "STATIC_DIR", tmp_path)

    with pytest.raises(RuntimeError, match="missing required asset: sw.js"):
        main.frontend("sw.js")
