"""KOReader progress sync server, so KOReader devices can keep their reading
position in step with each other and Bookie can show how far through each book
you are.

Implements the protocol of KOReader's "Progress sync" plugin
(https://github.com/koreader/koreader-sync-server). In KOReader, choose
Tools > Progress sync > Custom sync server and enter https://<bookie>/kosync,
then log in with the normal Bookie username and password.

KOReader names each book by a "document" ID: by default a partial MD5 of the
file, or optionally the MD5 of its filename. Bookie records those IDs for every
file it serves, so progress can be linked to the book it belongs to.
"""
import hashlib
import logging
import time
from functools import wraps
from pathlib import Path

from flask import abort, jsonify, request

from auth import _clear_failures, _login_blocked, _record_failure, check_sync_key, has_sync_key
from models import Book, BookFingerprint, ReadingProgress, Settings, db

logger = logging.getLogger(__name__)

# Error codes and statuses used by koreader-sync-server; KOReader shows the message.
_UNAUTHORIZED = (2001, 401, "Unauthorized")
_USER_EXISTS = (2002, 402, "Registration is disabled. Log in with your Bookie username and password.")
_INVALID_FIELDS = (2003, 403, "Invalid request")
_DOCUMENT_MISSING = (2004, 403, "Field 'document' not provided.")

_MAX_FIELD = 128


def _error(err):
    code, status, message = err
    return jsonify({"code": code, "message": message}), status


def partial_md5(path: Path) -> str | None:
    """KOReader's default document ID: MD5 over 1 KiB samples taken at
    offsets 0 and 1024 << 2i for i = 0..10, stopping at the end of the file.
    Mirrors util.partialMD5 in KOReader (whose first offset, 1024 << -2,
    wraps to 0 in LuaJIT)."""
    step = size = 1024
    digest = hashlib.md5()
    try:
        with open(path, "rb") as fh:
            for i in range(-1, 11):
                fh.seek(0 if i < 0 else step << (2 * i))
                sample = fh.read(size)
                if not sample:
                    break
                digest.update(sample)
    except OSError as exc:
        logger.warning("Could not fingerprint %s: %s", path, exc)
        return None
    return digest.hexdigest()


def filename_md5(name: str) -> str:
    """KOReader's alternative document ID: MD5 of the file's base name."""
    return hashlib.md5(name.encode()).hexdigest()


def record_fingerprints(book: Book, path: Path):
    """Remember the document IDs KOReader will use for *path* as *book*'s."""
    documents = {filename_md5(path.name)}
    binary = partial_md5(path)
    if binary:
        documents.add(binary)
    for document in documents:
        row = db.session.get(BookFingerprint, document)
        if row is None:
            db.session.add(BookFingerprint(document=document, book_id=book.id))
        elif row.book_id != book.id:
            row.book_id = book.id
        # Link progress that arrived before Bookie knew this document
        ReadingProgress.query.filter_by(document=document, book_id=None).update({"book_id": book.id})
    db.session.commit()


def _resolve_book_id(document: str, book_path) -> int | None:
    row = db.session.get(BookFingerprint, document)
    if row:
        return row.book_id
    # Unknown document: fingerprint the books that have never been, which
    # covers files copied to a device some other way than the OPDS feed.
    unseen = Book.query.filter(~Book.fingerprints.any()).all()
    for book in unseen:
        path = book_path(book)
        if path.exists():
            record_fingerprints(book, path)
    row = db.session.get(BookFingerprint, document)
    return row.book_id if row else None


def register_kosync_routes(app, book_path):
    """Register the /kosync routes. *book_path* maps a Book to its file on disk."""

    def kosync_enabled(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if Settings.get("kosync_enabled", "false") != "true":
                logger.warning("KOReader sync request for %s refused: enable it in Settings > Account",
                               request.path)
                abort(404)
            return f(*args, **kwargs)
        return decorated

    def sync_auth_required(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            client = request.remote_addr or "unknown"
            if _login_blocked(client):
                return jsonify({"code": 2001, "message": "Too many failed attempts. Try again later."}), 429
            username = (request.headers.get("x-auth-user") or "").strip()
            key = request.headers.get("x-auth-key") or ""
            if username and key and check_sync_key(username, key, Settings):
                _clear_failures(client)
                return f(*args, **kwargs)
            if not has_sync_key(Settings):
                logger.warning("KOReader sync login refused: sign in to the Bookie web app or OPDS feed once to "
                               "activate sync for your password")
            else:
                _record_failure(client)
                logger.warning("Failed KOReader sync login attempt from %s", client)
            return _error(_UNAUTHORIZED)
        return decorated

    @app.route("/kosync/healthcheck", methods=["GET"])
    @kosync_enabled
    def kosync_healthcheck():
        return jsonify({"state": "OK"})

    @app.route("/kosync/users/create", methods=["POST"])
    @kosync_enabled
    def kosync_register():
        # Bookie has a single account. Accept "Register" with its credentials
        # so the button behaves like Login; refuse anything else.
        data = request.get_json(silent=True) or {}
        username = str(data.get("username") or "").strip()
        key = str(data.get("password") or "")
        client = request.remote_addr or "unknown"
        if _login_blocked(client):
            return jsonify({"code": 2001, "message": "Too many failed attempts. Try again later."}), 429
        if username and key and check_sync_key(username, key, Settings):
            _clear_failures(client)
            return jsonify({"username": username}), 201
        _record_failure(client)
        return _error(_USER_EXISTS)

    @app.route("/kosync/users/auth", methods=["GET"])
    @kosync_enabled
    @sync_auth_required
    def kosync_auth():
        return jsonify({"authorized": "OK"})

    @app.route("/kosync/syncs/progress", methods=["PUT"])
    @kosync_enabled
    @sync_auth_required
    def kosync_put_progress():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return _error(_INVALID_FIELDS)
        document = data.get("document")
        if not isinstance(document, str) or not document.strip():
            return _error(_DOCUMENT_MISSING)
        document = document.strip().lower()
        progress = data.get("progress")
        percentage = data.get("percentage")
        device = data.get("device")
        device_id = data.get("device_id")
        if (len(document) > 32
                or not isinstance(progress, (str, int, float)) or isinstance(progress, bool)
                or not isinstance(percentage, (int, float)) or isinstance(percentage, bool)
                or not isinstance(device, str)
                or (device_id is not None and not isinstance(device_id, str))):
            return _error(_INVALID_FIELDS)

        now = int(time.time())
        row = ReadingProgress.query.filter_by(document=document).first()
        if row is None or row.book_id is None:
            book_id = _resolve_book_id(document, book_path)
            if row is None:
                row = ReadingProgress(document=document)
                db.session.add(row)
            row.book_id = book_id
        row.progress = str(progress)
        row.percentage = max(0.0, min(1.0, float(percentage)))
        row.device = device[:_MAX_FIELD]
        row.device_id = (device_id or "")[:_MAX_FIELD]
        row.timestamp = now
        db.session.commit()
        return jsonify({"document": document, "timestamp": now})

    @app.route("/kosync/syncs/progress/<document>", methods=["GET"])
    @kosync_enabled
    @sync_auth_required
    def kosync_get_progress(document):
        row = ReadingProgress.query.filter_by(document=document.strip().lower()).first()
        if row is None:
            return jsonify({})
        return jsonify({
            "document": row.document,
            "progress": row.progress,
            "percentage": row.percentage,
            "device": row.device,
            "device_id": row.device_id,
            "timestamp": row.timestamp,
        })
