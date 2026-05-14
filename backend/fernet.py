"""Fernet-based helpers for encrypting refresh tokens at rest.

The Fernet key lives in the FERNET_KEY env var and is loaded by config.py.
Each call to `encrypt_token` produces a different ciphertext for the same
plaintext because Fernet includes a random IV. Decryption with a wrong or
tampered key/ciphertext raises cryptography.fernet.InvalidToken.
"""
from __future__ import annotations

from cryptography.fernet import Fernet


def encrypt_token(plaintext: str, key: str) -> str:
    """Encrypt a token string with the given Fernet key. Returns a base64 str."""
    f = Fernet(key.encode() if isinstance(key, str) else key)
    return f.encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_token(ciphertext: str, key: str) -> str:
    """Decrypt a token previously produced by encrypt_token.

    Raises cryptography.fernet.InvalidToken if the key is wrong or the
    ciphertext was tampered with.
    """
    f = Fernet(key.encode() if isinstance(key, str) else key)
    return f.decrypt(ciphertext.encode("ascii")).decode("utf-8")
