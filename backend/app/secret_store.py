from __future__ import annotations

import base64
import hashlib
import secrets
from typing import Any

from Crypto.Cipher import AES  # type: ignore[import-untyped]

SECRET_VALUE_PREFIX = "enc:v1:"
_NONCE_BYTES = 12
_TAG_BYTES = 16
_KEY_CONTEXT = b"javdb115-settings-v1\x00"


class SecretDecryptionError(ValueError):
    """Raised when an encrypted setting cannot be decrypted safely."""


def is_encrypted_secret(value: str) -> bool:
    return value.startswith(SECRET_VALUE_PREFIX)


def encrypt_secret(value: str, secret_key: str) -> str:
    if not value:
        return value
    key = _derive_key(secret_key)
    nonce = secrets.token_bytes(_NONCE_BYTES)
    cipher: Any = AES.new(key, AES.MODE_GCM, nonce=nonce, mac_len=_TAG_BYTES)
    ciphertext, tag = cipher.encrypt_and_digest(value.encode("utf-8"))
    payload = base64.urlsafe_b64encode(nonce + tag + ciphertext).decode("ascii").rstrip("=")
    return f"{SECRET_VALUE_PREFIX}{payload}"


def decrypt_secret(value: str, secret_key: str) -> str:
    if not is_encrypted_secret(value):
        return value
    encoded = value.removeprefix(SECRET_VALUE_PREFIX)
    try:
        raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        if len(raw) < _NONCE_BYTES + _TAG_BYTES:
            raise ValueError("encrypted payload is too short")
        nonce = raw[:_NONCE_BYTES]
        tag = raw[_NONCE_BYTES : _NONCE_BYTES + _TAG_BYTES]
        ciphertext = raw[_NONCE_BYTES + _TAG_BYTES :]
        cipher: Any = AES.new(
            _derive_key(secret_key),
            AES.MODE_GCM,
            nonce=nonce,
            mac_len=_TAG_BYTES,
        )
        plaintext = cipher.decrypt_and_verify(ciphertext, tag)
        return plaintext.decode("utf-8")
    except (ValueError, UnicodeDecodeError) as exc:
        raise SecretDecryptionError(
            "Unable to decrypt a secret setting. APP_SECRET_KEY may have changed "
            "or the database value is corrupted."
        ) from exc


def _derive_key(secret_key: str) -> bytes:
    if not secret_key:
        raise ValueError("APP_SECRET_KEY must not be empty")
    return hashlib.sha256(_KEY_CONTEXT + secret_key.encode("utf-8")).digest()
