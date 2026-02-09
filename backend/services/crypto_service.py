"""
Encryption and HMAC for tracked search queries.
Never log or persist plaintext query; use query_hash (or prefix) only.
"""

import base64
import hashlib
import hmac
import os

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def _get_encryption_key() -> bytes:
    raw = os.getenv("SEARCH_ENCRYPTION_KEY", "").strip()
    if not raw or raw == "your_encryption_key_here":
        raise RuntimeError(
            "SEARCH_ENCRYPTION_KEY is required for tracked searches. "
            "Generate with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    if len(raw) == 44 and raw.endswith("="):
        return raw.encode("utf-8")
    # Derive 32-byte key from a shorter secret
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"marketmaker_search_salt_v1",
        iterations=100000,
    )
    return base64.urlsafe_b64encode(kdf.derive(raw.encode("utf-8")))


def _get_hmac_secret() -> bytes:
    secret = os.getenv("HMAC_SECRET", "").strip() or os.getenv("JOB_SECRET", "").strip()
    if not secret:
        raise RuntimeError("HMAC_SECRET or JOB_SECRET is required for query_hash")
    return secret.encode("utf-8")


def _fernet() -> Fernet:
    key = _get_encryption_key()
    return Fernet(key)


def encrypt_query(plaintext: str) -> str:
    """Encrypt query for storage. Returns base64-encoded ciphertext."""
    f = _fernet()
    return f.encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_query(ciphertext: str) -> str:
    """Decrypt stored query. Never log the result."""
    f = _fernet()
    return f.decrypt(ciphertext.encode("ascii")).decode("utf-8")


def query_hmac(plaintext: str) -> str:
    """HMAC-SHA256 of query for dedupe and logging. Return hex string."""
    secret = _get_hmac_secret()
    return hmac.new(secret, plaintext.encode("utf-8"), hashlib.sha256).hexdigest()


def query_hash_prefix(query_hash: str, length: int = 12) -> str:
    """Safe prefix for logging (no plaintext)."""
    return (query_hash or "")[:length]
