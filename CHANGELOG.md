# Changelog

All notable changes to this project are documented here. The project follows Semantic Versioning.

## [Unreleased]

### Added

- Versioned SQLite migrations and backup/restore tooling.
- Frontend and end-to-end security regression checks.
- Multi-architecture Docker release pipeline for `linux/amd64` and `linux/arm64`.
- GHCR image publication, image smoke tests, vulnerability scanning, SBOM, and provenance.
- Authenticated encryption for sensitive settings stored in SQLite, with automatic migration of legacy plaintext values.

### Changed

- Browser authentication now uses HttpOnly session cookies instead of storing tokens in `localStorage`.
- Sensitive settings are write-only through the Web API and are classified server-side.
- Runtime container uses a non-root user and locked Python dependencies.

### Security

- Added login failure throttling and temporary lockout.
- Added baseline HTTP security headers.
- 115 Cookie and Telegram Bot Token are no longer returned by settings APIs.
- 115 Cookie and Telegram Bot Token are encrypted at rest using a key derived from `APP_SECRET_KEY`.

## [0.1.0] - 2026-09-12

### Added

- Initial public release baseline for JavDB subscription, 115 offline download automation, media organization, Telegram integration, and Docker deployment.
