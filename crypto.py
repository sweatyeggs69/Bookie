"""Symmetric encryption for sensitive settings stored in the database."""
import stat
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

_ENC_PREFIX = "enc:"


def _get_fernet(data_dir: Path) -> Fernet:
    key_file = data_dir / "encryption_key"
    key_file.parent.mkdir(parents=True, exist_ok=True)
    if key_file.exists():
        key = key_file.read_bytes().strip()
    else:
        key = Fernet.generate_key()
        key_file.write_bytes(key)
        key_file.chmod(stat.S_IRUSR | stat.S_IWUSR)
    return Fernet(key)


def encrypt_value(value: str, data_dir: Path) -> str:
    """Encrypt *value* and return a prefixed string safe for database storage."""
    token = _get_fernet(data_dir).encrypt(value.encode()).decode()
    return _ENC_PREFIX + token


def decrypt_value(stored: str, data_dir: Path) -> str:
    """Decrypt a value previously encrypted with :func:`encrypt_value`.

    Falls back to returning *stored* as-is for legacy plaintext values so that
    existing installations continue to work until the password is next saved.
    """
    if not stored or not stored.startswith(_ENC_PREFIX):
        return stored
    try:
        return _get_fernet(data_dir).decrypt(stored[len(_ENC_PREFIX):].encode()).decode()
    except InvalidToken:
        # Corrupt or wrong key – return empty string to force re-entry
        return ""
