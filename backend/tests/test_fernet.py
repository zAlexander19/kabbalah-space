"""Tests for Fernet encrypt/decrypt helpers."""
import pytest
from cryptography.fernet import Fernet

from fernet import encrypt_token, decrypt_token


@pytest.fixture
def key() -> str:
    return Fernet.generate_key().decode()


def test_roundtrip(key):
    plaintext = "1//abc-refresh-token-from-google"
    encrypted = encrypt_token(plaintext, key)
    assert encrypted != plaintext
    assert decrypt_token(encrypted, key) == plaintext


def test_encrypt_is_nondeterministic(key):
    """Two encryptions of the same plaintext must differ (random IV)."""
    plaintext = "same-token"
    a = encrypt_token(plaintext, key)
    b = encrypt_token(plaintext, key)
    assert a != b
    assert decrypt_token(a, key) == decrypt_token(b, key) == plaintext


def test_decrypt_wrong_key_raises(key):
    encrypted = encrypt_token("secret", key)
    other_key = Fernet.generate_key().decode()
    with pytest.raises(Exception):
        decrypt_token(encrypted, other_key)


def test_decrypt_tampered_raises(key):
    encrypted = encrypt_token("secret", key)
    tampered = encrypted[:-1] + ("A" if encrypted[-1] != "A" else "B")
    with pytest.raises(Exception):
        decrypt_token(tampered, key)
