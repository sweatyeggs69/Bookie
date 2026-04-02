from io import BytesIO
from pathlib import Path
import sys

from werkzeug.datastructures import FileStorage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import _magic_ok


def _upload(payload: bytes, name: str = "upload.bin") -> FileStorage:
    return FileStorage(stream=BytesIO(payload), filename=name)


def test_magic_ok_accepts_valid_pdf_signature() -> None:
    assert _magic_ok(_upload(b"%PDF-1.7\nrest"), "pdf") is True


def test_magic_ok_rejects_invalid_pdf_signature() -> None:
    assert _magic_ok(_upload(b"NOTPDF"), "pdf") is False


def test_magic_ok_accepts_valid_epub_signature() -> None:
    assert _magic_ok(_upload(b"PK\x03\x04dummy"), "epub") is True


def test_magic_ok_rejects_invalid_epub_signature() -> None:
    assert _magic_ok(_upload(b"Rar!\x1a\x07\x00"), "epub") is False


def test_magic_ok_accepts_extension_only_types_without_signature_rule() -> None:
    assert _magic_ok(_upload(b"anything"), "txt") is True
