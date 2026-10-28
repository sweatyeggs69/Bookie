"""Bookie – Docker ebook manager with Material Design 3 UI."""
import io
import json
import math
import os
import re
import secrets
import shutil
import logging
import stat
import tempfile
import time
import urllib.request
import urllib.error
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone, date
from pathlib import Path

import crypto


DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DEFAULT_DB_FILENAME = "bookie.db"
LEGACY_DB_FILENAME = "booker.db"


def _get_or_create_secret_key() -> str:
    key_file = DATA_DIR / "secret_key"
    key_file.parent.mkdir(parents=True, exist_ok=True)
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_hex(32)
    key_file.write_text(key)
    key_file.chmod(stat.S_IRUSR | stat.S_IWUSR)
    return key


# ---------------------------------------------------------------------------
# Embedded metadata extraction
# ---------------------------------------------------------------------------

def extract_embedded_metadata(file_path: Path, ext: str) -> dict:
    """Extract title/author/etc. from embedded EPUB or PDF metadata."""
    if ext == "epub":
        return _extract_epub_metadata(file_path)
    elif ext == "pdf":
        return _extract_pdf_metadata(file_path)
    return {}


def _extract_epub_metadata(path: Path) -> dict:
    try:
        with zipfile.ZipFile(str(path)) as zf:
            # Locate OPF from container.xml
            with zf.open("META-INF/container.xml") as f:
                croot = ET.parse(f).getroot()
            ns_c = {"c": "urn:oasis:names:tc:opendocument:xmlns:container"}
            rf = croot.find(".//c:rootfile", ns_c)
            if rf is None:
                return {}
            opf_path = rf.get("full-path", "")
            with zf.open(opf_path) as f:
                oroot = ET.parse(f).getroot()

        ns = {
            "dc": "http://purl.org/dc/elements/1.1/",
            "opf": "http://www.idpf.org/2007/opf",
        }

        def dc(tag):
            el = oroot.find(f".//dc:{tag}", ns)
            return el.text.strip() if el is not None and el.text else None

        # ISBN from dc:identifier
        isbn10 = isbn13 = None
        for el in oroot.findall(".//dc:identifier", ns):
            scheme = (el.get("{http://www.idpf.org/2007/opf}scheme") or "").lower()
            val = re.sub(r"[-\s]", "", el.text or "")
            val = re.sub(r"^urn:isbn:", "", val, flags=re.IGNORECASE)
            if val.isdigit():
                if len(val) == 13 and isbn13 is None:
                    isbn13 = val
                elif len(val) == 10 and isbn10 is None:
                    isbn10 = val
            elif "isbn" in scheme:
                if val.isdigit() and len(val) == 13:
                    isbn13 = val
                elif val.isdigit() and len(val) == 10:
                    isbn10 = val

        # Creators: primary author is first without refine role or role=aut
        authors = []
        for el in oroot.findall(".//dc:creator", ns):
            if el.text:
                authors.append(el.text.strip())
        author = authors[0] if authors else None

        date_raw = dc("date")
        pub_date = date_raw[:4] if date_raw else None

        return {
            "title": dc("title"),
            "author": author,
            "publisher": dc("publisher"),
            "language": dc("language"),
            "description": dc("description"),
            "published_date": pub_date,
            "isbn": isbn10,
            "isbn13": isbn13,
        }
    except Exception as exc:
        logger.debug("EPUB metadata extraction failed: %s", exc)
        return {}


def _extract_pdf_metadata(path: Path) -> dict:
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        info = reader.metadata or {}

        def clean(val):
            return val.strip() if isinstance(val, str) and val.strip() else None

        raw_date = info.get("/CreationDate", "")
        pub_date = None
        if raw_date and len(raw_date) >= 6:
            # D:YYYYMMDDHHmmSS format
            digits = re.sub(r"[^0-9]", "", raw_date[:10])
            if len(digits) >= 4:
                pub_date = digits[:4]

        return {
            "title": clean(info.get("/Title")),
            "author": clean(info.get("/Author")),
            "publisher": clean(info.get("/Creator") or info.get("/Producer")),
            "description": clean(info.get("/Subject")),
            "published_date": pub_date,
        }
    except Exception as exc:
        logger.debug("PDF metadata extraction failed: %s", exc)
        return {}

from flask import (
    Flask,
    jsonify,
    request,
    send_file,
    send_from_directory,
    redirect,
    session,
    abort,
    make_response,
)
from werkzeug.utils import secure_filename

from sqlalchemy.orm import subqueryload
from models import db, Book, Settings, EmailAddress, Tag, BookTag
from auth import has_sync_key, login_required, register_auth_routes
import scraper
import covers as cover_mgr
import mailer
import renamer
from opds import register_opds_routes, wants_opds
from kosync import record_fingerprints, register_kosync_routes
import epub_cleanup

# Set the root logger to INFO so that INFO+ records are captured from the start.
# logging.basicConfig() is a no-op when any handler is already registered, so
# we configure the root logger explicitly.
_LOG_FORMAT = "%(asctime)s %(levelname)-8s %(name)s: %(message)s"
_root_logger = logging.getLogger()
_root_logger.setLevel(logging.INFO)

# Attach a StreamHandler so INFO+ records reach the terminal.  Only add one if
# the root logger has no StreamHandler yet — gunicorn/uWSGI add their own
# handler before importing the app, so we skip it to avoid duplicate output.
if not any(isinstance(h, logging.StreamHandler) for h in _root_logger.handlers):
    _console_handler = logging.StreamHandler()
    _console_handler.setFormatter(logging.Formatter(_LOG_FORMAT))
    _root_logger.addHandler(_console_handler)

# Silence chatty library loggers so DEBUG/INFO mode doesn't flood the output
# with irrelevant framework noise.
for _noisy_logger in ("werkzeug", "sqlalchemy.engine", "sqlalchemy.pool",
                      "urllib3", "PIL", "asyncio"):
    logging.getLogger(_noisy_logger).setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

# In-memory log buffer — keeps the last N lines so the Logs tab has something
# to show.  Size is intentionally modest: even at DEBUG the suppressed library
# loggers mean we only store app-level records.
_LOG_BUFFER_CAPACITY = 500

class _LogBuffer(logging.Handler):
    def __init__(self, capacity: int = _LOG_BUFFER_CAPACITY):
        super().__init__()
        self._buf: list[str] = []
        self._cap = capacity
    def emit(self, record: logging.LogRecord) -> None:
        self._buf.append(self.format(record))
        if len(self._buf) > self._cap:
            self._buf = self._buf[-self._cap:]
    def get_lines(self) -> list[str]:
        return list(self._buf)

_log_buffer = _LogBuffer()
_log_buffer.setFormatter(logging.Formatter(_LOG_FORMAT))
logging.getLogger().addHandler(_log_buffer)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BOOKS_DIR = DATA_DIR / "books"
COVERS_DIR = DATA_DIR / "covers"
ALLOWED_EXTENSIONS = {"epub", "pdf", "mobi", "azw", "azw3", "fb2", "djvu", "cbz", "cbr", "txt"}
MAX_UPLOAD_MB = 128

# Magic-byte signatures for formats where we can reliably verify content.
# Extensions not listed here are accepted on extension alone (txt, fb2, mobi, etc.
# have no universal single-byte signature that is safe to enforce).
_MAGIC_BYTES: dict[str, list[bytes]] = {
    "epub": [b"PK\x03\x04"],           # EPUB is a ZIP archive
    "pdf":  [b"%PDF"],
    "cbz":  [b"PK\x03\x04"],           # CBZ is a ZIP archive
    "cbr":  [b"Rar!\x1a\x07\x00",      # RAR v4
             b"Rar!\x1a\x07\x01\x00",  # RAR v5
             b"PK\x03\x04"],            # some CBRs are actually ZIPs
    "djvu": [b"AT&TFORM"],
}
_MAGIC_READ_BYTES = 8  # max prefix length we need to read


def _magic_ok(file_storage, ext: str) -> bool:
    """Return True if the uploaded file's header matches the expected format."""
    sigs = _MAGIC_BYTES.get(ext)
    if not sigs:
        return True  # no check defined for this extension
    header = file_storage.read(_MAGIC_READ_BYTES)
    file_storage.seek(0)
    return any(header.startswith(sig) for sig in sigs)


_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

def _valid_email(value: str) -> bool:
    return bool(_EMAIL_RE.match(value))


def _safe_int(value, default: int) -> int:
    """Convert *value* to int, returning *default* on failure."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _book_path(book) -> Path:
    """Return the absolute path of *book*'s file, refusing anything outside BOOKS_DIR."""
    path = (BOOKS_DIR / book.filename).resolve()
    if not path.is_relative_to(BOOKS_DIR.resolve()):
        abort(400)
    return path


PREVIEW_DIR = DATA_DIR / "cleanup-previews"
PREVIEW_TTL = 3600  # seconds a cleaned preview copy stays downloadable


def _render_before_after(original: str, cleaned: str, page: str | None) -> dict:
    if not page:
        return {"page": None, "page_before": "", "page_after": ""}
    return {"page": page, "page_before": epub_cleanup.render_page(original, page),
            "page_after": epub_cleanup.render_page(cleaned, page)}


def _prune_previews() -> None:
    """Delete preview copies older than PREVIEW_TTL."""
    if not PREVIEW_DIR.exists():
        return
    cutoff = time.time() - PREVIEW_TTL
    for f in PREVIEW_DIR.iterdir():
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
        except OSError:
            pass


def _editable_book(book_id: int):
    """The book, or a 409 while an EPUB cleanup is rewriting its file."""
    book = Book.query.get_or_404(book_id)
    if book.is_cleaning():
        abort(make_response(jsonify({"error": "This book is being cleaned up. Try again in a moment."}), 409))
    return book


def _id_list(data: dict, key: str = "ids") -> list[int]:
    """Return the integer IDs in data[key], ignoring anything that isn't one."""
    raw = data.get(key) if isinstance(data, dict) else None
    if not isinstance(raw, list):
        return []
    return [i for i in raw if isinstance(i, int) and not isinstance(i, bool)]


_VALID_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR"}


def _cleanup_empty_dirs(directory: Path) -> None:
    """Remove *directory* and its parent if both are empty and not BOOKS_DIR."""
    try:
        for folder in [directory, directory.parent]:
            if folder != BOOKS_DIR and folder.exists() and not any(folder.iterdir()):
                folder.rmdir()
    except Exception as exc:
        logger.debug("Could not remove empty directory %s: %s", directory, exc)



# ---------------------------------------------------------------------------
# Update check
# ---------------------------------------------------------------------------

_UPDATE_CHECK_TTL = 3600  # seconds
_update_check_cache: tuple[float, dict] | None = None


def _check_for_update() -> dict:
    """Query GHCR for the latest image creation date and compare to BUILD_DATE."""
    global _update_check_cache

    now = time.time()
    if _update_check_cache and (now - _update_check_cache[0]) < _UPDATE_CHECK_TTL:
        return _update_check_cache[1]

    build_date = os.environ.get("BUILD_DATE", "").strip()
    if not build_date:
        result: dict = {"update_available": False, "reason": "no_build_date"}
        _update_check_cache = (now, result)
        return result

    ghcr_image = os.environ.get("GHCR_IMAGE", "ghcr.io/sweatyeggs69/bookie").strip()
    # Expect format: registry/owner/image  (e.g. ghcr.io/sweatyeggs69/bookie)
    slash_idx = ghcr_image.find("/")
    if slash_idx == -1:
        result = {"update_available": False, "reason": "invalid_image"}
        _update_check_cache = (now, result)
        return result

    registry = ghcr_image[:slash_idx]
    image_path = ghcr_image[slash_idx + 1:]

    try:
        # 1. Obtain an anonymous pull token from the registry
        token_url = f"https://{registry}/token?scope=repository:{image_path}:pull"
        with urllib.request.urlopen(token_url, timeout=10) as resp:
            token_data = json.loads(resp.read())
        token = token_data.get("token") or token_data.get("access_token", "")

        # 2. Fetch the manifest for the 'latest' tag
        manifest_url = f"https://{registry}/v2/{image_path}/manifests/latest"
        manifest_req = urllib.request.Request(
            manifest_url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": (
                    "application/vnd.oci.image.manifest.v1+json,"
                    "application/vnd.docker.distribution.manifest.v2+json"
                ),
            },
        )
        with urllib.request.urlopen(manifest_req, timeout=10) as resp:
            manifest = json.loads(resp.read())

        config_digest = manifest.get("config", {}).get("digest", "")
        if not config_digest:
            result = {"update_available": False, "reason": "no_config_digest"}
            _update_check_cache = (now, result)
            return result

        # 3. Fetch the config blob to read the image creation timestamp
        blob_url = f"https://{registry}/v2/{image_path}/blobs/{config_digest}"
        blob_req = urllib.request.Request(
            blob_url,
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(blob_req, timeout=10) as resp:
            config = json.loads(resp.read())

        # Prefer the OCI label (set at pipeline start, same moment as BUILD_DATE)
        # over config["created"] which is set when Docker build finishes (always later).
        labels = config.get("config", {}).get("Labels") or {}
        latest_created = labels.get("org.opencontainers.image.created", "") or config.get("created", "")
        # ISO-8601 strings compare lexicographically
        update_available = bool(latest_created and latest_created > build_date)
        result = {
            "update_available": update_available,
            "current_build": build_date,
            "latest_build": latest_created,
        }
    except Exception as exc:
        logger.debug("Update check failed: %s", exc)
        result = {"update_available": False, "reason": "check_failed"}

    _update_check_cache = (now, result)
    return result


def create_app():
    _db_env = os.environ.get("DATABASE_URL")
    if not _db_env:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        _legacy_db = DATA_DIR / LEGACY_DB_FILENAME
        _default_db = DATA_DIR / DEFAULT_DB_FILENAME
        if _legacy_db.exists() and not _default_db.exists():
            _legacy_db.replace(_default_db)

    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
        "DATABASE_URL", f"sqlite:///{(DATA_DIR / DEFAULT_DB_FILENAME).absolute()}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or _get_or_create_secret_key()
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    _secure_env = os.environ.get("SESSION_COOKIE_SECURE", "").lower()
    if _secure_env in ("0", "false", "no"):
        app.config["SESSION_COOKIE_SECURE"] = False
    elif _secure_env in ("1", "true", "yes"):
        app.config["SESSION_COOKIE_SECURE"] = True
    else:
        app.config["SESSION_COOKIE_SECURE"] = not app.debug

    db.init_app(app)

    with app.app_context():
        BOOKS_DIR.mkdir(parents=True, exist_ok=True)
        COVERS_DIR.mkdir(parents=True, exist_ok=True)
        db.create_all()
        _migrate_db(app)
        # Restore persisted log level (defaults to INFO on first run)
        _saved_level = (Settings.get("log_level") or "INFO").upper()
        if _saved_level not in _VALID_LOG_LEVELS:
            _saved_level = "INFO"
        logging.getLogger().setLevel(getattr(logging, _saved_level))

    # Cross-site request guard. Browsers label every request with
    # Sec-Fetch-Site; refusing state-changing API calls that come from another
    # site (including sibling subdomains, which SameSite=Lax cookies don't
    # stop) blocks CSRF without breaking non-browser clients, which don't
    # send the header.
    @app.before_request
    def reject_cross_site_writes():
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return None
        if request.headers.get("Sec-Fetch-Site", "") in ("cross-site", "same-site"):
            return jsonify({"error": "Cross-site request refused"}), 403
        return None

    # Security headers
    @app.after_request
    def set_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response

    # Register auth routes
    register_auth_routes(app, Settings)
    register_opds_routes(app, _book_path)
    register_kosync_routes(app, _book_path)

    # -----------------------------------------------------------------------
    # Frontend – serve React SPA
    # -----------------------------------------------------------------------

    _REACT_DIST = Path(__file__).parent / "static" / "dist"

    @app.route("/static/site.webmanifest")
    def web_manifest():
        resp = send_from_directory("static", "site.webmanifest")
        resp.headers["Content-Type"] = "application/manifest+json"
        resp.headers["Cache-Control"] = "no-cache"
        return resp

    @app.route("/sw.js")
    def service_worker():
        """Serve SW from root scope so it can control all pages."""
        resp = send_from_directory("static", "sw.js")
        resp.headers["Service-Worker-Allowed"] = "/"
        resp.headers["Cache-Control"] = "no-cache"
        return resp

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        # Never intercept API routes
        if path.startswith("api/") or path.startswith("static/"):
            abort(404)
        # An e-reader pointed at the bare server address gets the catalog.
        # Serve it here rather than redirecting: some KOReader versions drop
        # the login when following a redirect, so /opds would answer 401.
        if not path and wants_opds(request.headers.get("Accept", "")):
            return app.view_functions["opds_root"]()
        target = _REACT_DIST / path
        if path and target.exists() and target.is_file():
            return send_from_directory(_REACT_DIST, path)
        return send_from_directory(_REACT_DIST, "index.html")

    # -----------------------------------------------------------------------
    # Books – CRUD
    # -----------------------------------------------------------------------

    def _filtered_books_query():
        """Book query with the library filters from the request's query string."""
        query = Book.query
        search = request.args.get("q", "").strip()
        if search:
            # Escape LIKE metacharacters so they're treated as literals
            escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            like = f"%{escaped}%"
            query = query.filter(
                db.or_(
                    Book.title.ilike(like, escape="\\"),
                    Book.author.ilike(like, escape="\\"),
                    Book.series.ilike(like, escape="\\"),
                    Book.isbn.ilike(like, escape="\\"),
                    Book.isbn13.ilike(like, escape="\\"),
                )
            )
        fmt = request.args.get("format")
        if fmt:
            query = query.filter(Book.file_format == fmt.lower())
        series_filter = request.args.get("series")
        if series_filter:
            query = query.filter(Book.series == series_filter)
        lang = request.args.get("language")
        if lang:
            query = query.filter(Book.language == lang)
        tag = request.args.get("tag")
        if tag:
            query = query.join(BookTag, BookTag.book_id == Book.id).join(Tag, Tag.id == BookTag.tag_id).filter(Tag.name == tag)
        return query

    @app.route("/api/books", methods=["GET"])
    @login_required
    def list_books():
        query = _filtered_books_query()
        _SORT_COLS = {"author", "title", "series", "published_date", "date_added", "file_size", "rating"}
        sort = request.args.get("sort", "author")
        if sort not in _SORT_COLS:
            sort = "author"
        order = request.args.get("order", "asc")
        if sort == "series":
            # Sort nulls last, then by series name, then by series order
            if order == "desc":
                query = query.order_by(
                    db.case((Book.series.is_(None), 1), else_=0).asc(),
                    Book.series.desc(),
                    db.case((Book.series_order.is_(None), 1), else_=0).asc(),
                    Book.series_order.desc(),
                )
            else:
                query = query.order_by(
                    db.case((Book.series.is_(None), 1), else_=0).asc(),
                    Book.series.asc(),
                    db.case((Book.series_order.is_(None), 1), else_=0).asc(),
                    Book.series_order.asc(),
                )
        elif sort == "author":
            # Author primary, then series name + order as secondary (nulls last), then title
            if order == "desc":
                query = query.order_by(
                    Book.author.desc(),
                    db.case((Book.series.is_(None), 1), else_=0).asc(),
                    Book.series.asc(),
                    db.case((Book.series_order.is_(None), 1), else_=0).asc(),
                    Book.series_order.asc(),
                    Book.title.desc(),
                )
            else:
                query = query.order_by(
                    Book.author.asc(),
                    db.case((Book.series.is_(None), 1), else_=0).asc(),
                    Book.series.asc(),
                    db.case((Book.series_order.is_(None), 1), else_=0).asc(),
                    Book.series_order.asc(),
                    Book.title.asc(),
                )
        elif sort == "title":
            # Sort by title, stripping leading articles (A, An, The)
            sort_key = db.case(
                (Book.title.ilike("the %"), db.func.substr(Book.title, 5)),
                (Book.title.ilike("an %"), db.func.substr(Book.title, 4)),
                (Book.title.ilike("a %"), db.func.substr(Book.title, 3)),
                else_=Book.title,
            )
            query = query.order_by(sort_key.desc() if order == "desc" else sort_key.asc())
        else:
            col = getattr(Book, sort, None)
            if col is not None:
                query = query.order_by(col.desc() if order == "desc" else col.asc())
        page = max(1, request.args.get("page", 1, type=int))
        per_page = min(max(1, request.args.get("per_page", 40, type=int)), 200)
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)
        return jsonify({
            "books": [b.to_dict() for b in paginated.items],
            "total": paginated.total,
            "pages": paginated.pages,
            "page": page,
        })

    @app.route("/api/books/<int:book_id>", methods=["GET"])
    @login_required
    def get_book(book_id):
        book = Book.query.get_or_404(book_id)
        return jsonify(book.to_dict())

    @app.route("/api/books/scan", methods=["POST"])
    @login_required
    def scan_books():
        """Walk BOOKS_DIR, register new files, and remove DB entries for deleted files."""
        # ── Remove stale records (file deleted from disk) ──────────────────
        removed = 0
        for book in Book.query.all():
            if not (BOOKS_DIR / book.filename).exists():
                cover_mgr.delete_cover(book.id)
                db.session.delete(book)
                removed += 1
        db.session.commit()

        # ── Register new files ─────────────────────────────────────────────
        known = {b.filename for b in Book.query.with_entities(Book.filename).all()}
        auto_meta = Settings.get("auto_metadata", "false") == "true"
        added = 0
        for path in BOOKS_DIR.rglob("*"):
            if not path.is_file():
                continue
            ext = path.suffix.lstrip(".").lower()
            if ext not in ALLOWED_EXTENSIONS:
                continue
            rel = str(path.relative_to(BOOKS_DIR))
            if rel in known:
                continue

            book = Book(
                filename=rel,
                file_format=ext,
                file_size=path.stat().st_size,
                title=path.stem,
            )
            db.session.add(book)
            db.session.flush()

            # Extract embedded cover
            cover_data = None
            if ext == "epub":
                cover_data = cover_mgr.extract_cover_from_epub(str(path))
            elif ext == "pdf":
                cover_data = cover_mgr.extract_cover_from_pdf(str(path))
            if cover_data:
                cf = cover_mgr.save_cover(book.id, cover_data)
                if cf:
                    book.cover_filename = cf

            # Extract and apply embedded metadata (title, author, ISBN, …)
            embedded = extract_embedded_metadata(path, ext)
            if any(embedded.values()):
                _apply_metadata(book, embedded, replace_missing_only=False)

            # Auto-fetch from online sources if the setting is on
            if auto_meta:
                try:
                    _auto_fetch_metadata(book)
                except Exception as exc:
                    logger.warning("Auto-fetch failed for scanned book %s: %s", rel, exc)

            # Apply rename/organize scheme
            try:
                _rename_and_organize(book, path)
            except Exception as exc:
                logger.warning("Rename failed for scanned book %s: %s", rel, exc)

            added += 1
            known.add(book.filename)  # use updated filename after rename

        db.session.commit()
        return jsonify({"added": added, "removed": removed})

    @app.route("/api/books/upload", methods=["POST"])
    @login_required
    def upload_book():
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400
        file = request.files["file"]
        if not file.filename:
            return jsonify({"error": "Empty filename"}), 400

        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            return jsonify({"error": f"Unsupported format: {ext}"}), 400
        if not _magic_ok(file, ext):
            return jsonify({"error": f"File content does not match declared format (.{ext})"}), 400

        # secure_filename drops non-ASCII characters, so a name like "书.epub"
        # would otherwise come back as just "epub" with no extension.
        stem = secure_filename(file.filename.rsplit(".", 1)[0]) or "book"
        filename = f"{stem}.{ext}"
        dest = BOOKS_DIR / filename
        counter = 1
        while dest.exists():
            filename = f"{stem}_{counter}.{ext}"
            dest = BOOKS_DIR / filename
            counter += 1

        file.save(str(dest))
        size = dest.stat().st_size

        # Lock the book for the whole import when it will be cleaned, so it
        # can't be edited while metadata is fetched and the file is rewritten
        clean = ext == "epub" and Settings.get("epub_cleanup_on_upload", "false") == "true"
        book = Book(
            filename=filename,
            file_format=ext,
            file_size=size,
            title=Path(filename).stem,
            cleanup_started=datetime.now(timezone.utc) if clean else None,
        )
        db.session.add(book)
        db.session.commit()
        try:
            _process_upload(book, dest, ext, clean)
        finally:
            if book.cleanup_started:
                book.cleanup_started = None
                db.session.commit()
        return jsonify(book.to_dict()), 201

    def _process_upload(book, dest, ext, clean):
        filename = book.filename

        # Extract embedded cover
        cover_data = None
        if ext == "epub":
            cover_data = cover_mgr.extract_cover_from_epub(str(dest))
        elif ext == "pdf":
            cover_data = cover_mgr.extract_cover_from_pdf(str(dest))
        if cover_data:
            cf = cover_mgr.save_cover(book.id, cover_data)
            if cf:
                book.cover_filename = cf
                db.session.commit()

        # Apply embedded metadata first (title, author, ISBN, etc.)
        embedded = extract_embedded_metadata(dest, ext)
        if any(embedded.values()):
            _apply_metadata(book, embedded, replace_missing_only=False)

        # Auto-fetch from online sources to fill remaining gaps. The book is
        # already saved, so a failure here must not turn the upload into an error.
        auto_meta = Settings.get("auto_metadata", "false")
        if auto_meta == "true":
            try:
                _auto_fetch_metadata(book)
            except Exception as exc:
                logger.warning("Auto-fetch failed for uploaded book %s: %s", filename, exc)

        # Apply renaming scheme + folder organization
        try:
            _rename_and_organize(book, dest)
        except Exception as exc:
            logger.warning("Rename failed for uploaded book %s: %s", filename, exc)

        if clean:
            try:
                _cleanup_book(book, locked=True)
            except Exception as exc:
                logger.warning("Cleanup failed for uploaded book %s: %s", book.filename, exc)

    @app.route("/api/books/<int:book_id>", methods=["PUT"])
    @login_required
    def update_book(book_id):
        book = _editable_book(book_id)
        data = request.get_json(silent=True)
        if data is None:
            data = {}
        elif not isinstance(data, dict):
            return jsonify({"error": "Invalid JSON payload"}), 400
        fields = [
            "title", "author", "published_date", "page_count",
            "series", "series_order", "rating",
        ]
        for f in fields:
            if f not in data:
                continue
            val = data[f]
            if f == "published_date" and isinstance(val, str):
                val = val[:4] or None
            if f in ("title", "author", "series") and val is not None:
                if not isinstance(val, str):
                    return jsonify({"error": f"Invalid value for {f}"}), 400
                val = val.strip() or None
            if f == "page_count" and val not in (None, ""):
                try:
                    val = int(val)
                except (TypeError, ValueError):
                    return jsonify({"error": "Invalid value for page_count"}), 400
            elif f == "page_count":
                val = None
            # Guard float fields against NaN / Infinity which would corrupt sorting
            if f in ("series_order", "rating") and val is not None:
                try:
                    val = float(val)
                except (TypeError, ValueError):
                    return jsonify({"error": f"Invalid value for {f}"}), 400
                if not math.isfinite(val):
                    return jsonify({"error": f"{f} must be a finite number"}), 400
            setattr(book, f, val)
        db.session.commit()
        # Re-apply rename/organize after metadata update
        file_path = BOOKS_DIR / book.filename
        if file_path.exists():
            try:
                _rename_and_organize(book, file_path)
            except Exception as exc:
                logger.warning("Rename after save failed for book %s: %s", book_id, exc)
        _write_metadata_to_file(book)
        return jsonify(book.to_dict())

    @app.route("/api/books/<int:book_id>", methods=["DELETE"])
    @login_required
    def delete_book(book_id):
        book = _editable_book(book_id)
        filepath = _book_path(book)
        parent = filepath.parent
        if filepath.exists():
            filepath.unlink()
        _cleanup_empty_dirs(parent)
        cover_mgr.delete_cover(book_id)
        db.session.delete(book)
        db.session.commit()
        return jsonify({"success": True})

    @app.route("/api/books/ids", methods=["GET"])
    @login_required
    def get_book_ids():
        """Return all book IDs matching the current filters (no pagination)."""
        query = _filtered_books_query()
        return jsonify({"ids": [b.id for b in query.with_entities(Book.id).all()]})

    @app.route("/api/books/bulk-fetch-metadata", methods=["POST"])
    @login_required
    def bulk_fetch_metadata():
        """Fetch metadata for a list of book IDs, one at a time."""
        ids = _id_list(request.get_json(silent=True) or {})
        updated = 0
        for book_id in ids:
            book = db.session.get(Book, book_id)
            if not book or book.is_cleaning():
                continue
            _auto_fetch_metadata(book)
            # Keep file names in line with the new metadata, as a single fetch does
            file_path = BOOKS_DIR / book.filename
            if file_path.exists():
                try:
                    _rename_and_organize(book, file_path)
                except Exception as exc:
                    logger.warning("Rename after bulk fetch failed for book %s: %s", book_id, exc)
            _write_metadata_to_file(book)
            updated += 1
            if updated < len(ids):
                time.sleep(1)  # be polite to metadata sources
        return jsonify({"updated": updated})

    @app.route("/api/books/<int:book_id>/cleanup", methods=["POST"])
    @login_required
    def cleanup_book(book_id):
        book = _editable_book(book_id)
        if book.file_format != "epub":
            return jsonify({"error": "Cleanup only supports EPUB files"}), 400
        try:
            actions = _cleanup_book(book)
        except FileNotFoundError:
            return jsonify({"error": "File not found on disk"}), 404
        except epub_cleanup.CleanupError as exc:
            return jsonify({"error": str(exc)}), 422
        except Exception as exc:
            logger.warning("Cleanup failed for book %s: %s", book_id, exc)
            return jsonify({"error": f"Cleanup failed: {exc}"}), 500
        return jsonify({"actions": actions, "book": book.to_dict()})

    @app.route("/api/books/bulk-cleanup", methods=["POST"])
    @login_required
    def bulk_cleanup_books():
        """Clean the given books. The client sends small batches so a large
        library never runs into the worker timeout."""
        ids = _id_list(request.get_json(silent=True) or {})
        cleaned = unchanged = skipped = 0
        errors = []
        for book_id in ids:
            book = db.session.get(Book, book_id)
            if not book or book.file_format != "epub" or book.is_cleaning():
                skipped += 1
                continue
            try:
                if _cleanup_book(book):
                    cleaned += 1
                else:
                    unchanged += 1
            except Exception as exc:
                logger.warning("Cleanup failed for book %s: %s", book_id, exc)
                errors.append({"id": book_id, "title": book.title, "error": str(exc)})
        return jsonify({"cleaned": cleaned, "unchanged": unchanged, "skipped": skipped, "errors": errors})

    @app.route("/api/cleanup/preview", methods=["POST"])
    @login_required
    def cleanup_preview():
        """Clean an uploaded EPUB without adding it to the library, and report
        what changed. The cleaned copy can be downloaded for a while afterwards."""
        file = request.files.get("file")
        if not file or not file.filename:
            return jsonify({"error": "No file provided"}), 400
        if not file.filename.lower().endswith(".epub") or not _magic_ok(file, "epub"):
            return jsonify({"error": "Choose an EPUB file"}), 400
        # Steps from the form, so unsaved checkboxes can be tried out
        raw_steps = request.form.get("steps")
        steps = epub_cleanup.parse_steps(raw_steps) - {"metadata"}
        _prune_previews()
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        token = secrets.token_urlsafe(16)
        path = PREVIEW_DIR / f"{token}.epub"
        file.save(str(path))
        original = PREVIEW_DIR / f"{token}.orig.epub"
        try:
            shutil.copyfile(path, original)
            before = epub_cleanup.summarize(str(path))
            actions = epub_cleanup.clean_epub(str(path), {}, steps)
            after = epub_cleanup.summarize(str(path))
            diff = epub_cleanup.preview_diff(before, after)
            rendered = _render_before_after(str(original), str(path), epub_cleanup.first_changed_page(diff))
        except epub_cleanup.CleanupError as exc:
            path.unlink(missing_ok=True)
            return jsonify({"error": str(exc)}), 422
        except Exception as exc:
            path.unlink(missing_ok=True)
            logger.warning("Cleanup preview failed for %s: %s", file.filename, exc)
            return jsonify({"error": f"Could not clean this file: {exc}"}), 422
        finally:
            original.unlink(missing_ok=True)
        name = secure_filename(file.filename.rsplit(".", 1)[0]) or "book"
        (PREVIEW_DIR / f"{token}.name").write_text(f"{name}_clean.epub")
        return jsonify({"token": token, "actions": actions, **diff, **rendered})

    @app.route("/api/cleanup/sample-preview", methods=["POST"])
    @login_required
    def cleanup_sample_preview():
        """Run the chosen steps on Bookie's built-in messy sample, so the settings
        page can show a live before/after without the user picking a file."""
        data = request.get_json(silent=True) or {}
        steps = epub_cleanup.parse_steps(data.get("steps")) - {"metadata"}
        with tempfile.TemporaryDirectory() as tmp:
            original = os.path.join(tmp, "before.epub")
            path = os.path.join(tmp, "after.epub")
            epub_cleanup.write_sample_epub(original)
            shutil.copyfile(original, path)
            before = epub_cleanup.summarize(original)
            actions = epub_cleanup.clean_epub(path, {}, steps)
            after = epub_cleanup.summarize(path)
            rendered = _render_before_after(original, path, epub_cleanup.SAMPLE_PAGE)
        return jsonify({"actions": actions, **epub_cleanup.preview_diff(before, after), **rendered})

    @app.route("/api/cleanup/preview/<token>", methods=["GET"])
    @login_required
    def cleanup_preview_download(token):
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", token):
            abort(404)
        path = PREVIEW_DIR / f"{token}.epub"
        if not path.exists():
            return jsonify({"error": "This preview has expired. Run it again."}), 404
        name_file = PREVIEW_DIR / f"{token}.name"
        name = name_file.read_text() if name_file.exists() else "book_clean.epub"
        return send_file(str(path), as_attachment=True, download_name=name,
                         mimetype="application/epub+zip")

    @app.route("/api/books/bulk-delete", methods=["POST"])
    @login_required
    def bulk_delete_books():
        ids = _id_list(request.get_json(silent=True) or {})
        deleted = 0
        for book_id in ids:
            book = db.session.get(Book, book_id)
            if not book or book.is_cleaning():
                continue
            filepath = _book_path(book)
            parent = filepath.parent
            if filepath.exists():
                filepath.unlink()
            _cleanup_empty_dirs(parent)
            cover_mgr.delete_cover(book_id)
            db.session.delete(book)
            deleted += 1
        db.session.commit()
        return jsonify({"deleted": deleted})

    @app.route("/api/books/bulk-tag", methods=["POST"])
    @login_required
    def bulk_add_tag():
        data = request.get_json(silent=True) or {}
        # Only tag books that exist, so no orphan rows inflate tag counts
        ids = [r[0] for r in Book.query.with_entities(Book.id).filter(Book.id.in_(_id_list(data))).all()]
        tag_name = str(data.get("tag") or "").strip()
        if not tag_name:
            return jsonify({"error": "tag required"}), 400
        tag = Tag.query.filter_by(name=tag_name).first()
        if not tag:
            tag = Tag(name=tag_name)
            db.session.add(tag)
            db.session.flush()
        added = 0
        for book_id in ids:
            exists = BookTag.query.filter_by(book_id=book_id, tag_id=tag.id).first()
            if not exists:
                db.session.add(BookTag(book_id=book_id, tag_id=tag.id))
                added += 1
        db.session.commit()
        return jsonify({"added": added, "tag": tag.to_dict()})

    @app.route("/api/books/bulk-untag", methods=["POST"])
    @login_required
    def bulk_remove_tag():
        data = request.get_json(silent=True) or {}
        ids = _id_list(data)
        tag_name = str(data.get("tag") or "").strip()
        if not tag_name:
            return jsonify({"error": "tag required"}), 400
        tag = Tag.query.filter_by(name=tag_name).first()
        if not tag:
            return jsonify({"removed": 0})
        removed = (
            BookTag.query
            .filter(BookTag.tag_id == tag.id, BookTag.book_id.in_(ids))
            .delete(synchronize_session=False)
        )
        db.session.commit()
        return jsonify({"removed": removed})

    @app.route("/api/books/<int:book_id>/download", methods=["GET"])
    @login_required
    def download_book(book_id):
        book = Book.query.get_or_404(book_id)
        filepath = _book_path(book)
        if not filepath.exists():
            abort(404)
        # The copy may be sideloaded onto a KOReader device; let sync recognise it
        record_fingerprints(book, filepath)
        return send_file(str(filepath), as_attachment=True, download_name=Path(book.filename).name)

    @app.route("/api/books/<int:book_id>/rename", methods=["POST"])
    @login_required
    def rename_book(book_id):
        """Rename a specific book's file using a given scheme or custom template."""
        book = _editable_book(book_id)
        data = request.get_json(silent=True) or {}
        scheme = data.get("scheme", "author_title")
        custom_tpl = data.get("custom_template", "")
        meta = {
            "title": book.title,
            "author": book.author,
            "published_date": book.published_date,
            "publisher": book.publisher,
            "isbn": book.isbn,
            "isbn13": book.isbn13,
            "language": book.language,
        }
        src = _book_path(book)
        if not src.exists():
            return jsonify({"error": "File not found on disk"}), 404
        new_path, new_name = renamer.rename_book_file(src, BOOKS_DIR, scheme, meta, custom_tpl)
        if new_path != src:
            _cleanup_empty_dirs(src.parent)
        book.filename = new_name
        db.session.commit()
        return jsonify({"success": True, "new_filename": new_name})

    @app.route("/api/rename/preview", methods=["POST"])
    @login_required
    def rename_preview():
        """Preview how a naming scheme would rename a list of books."""
        data = request.get_json(silent=True) or {}
        scheme = data.get("scheme", "author_title")
        custom_tpl = data.get("custom_template", "")
        book_ids = _id_list(data, "book_ids")
        template = renamer.get_scheme_template(scheme, custom_tpl)
        previews = []
        for bid in book_ids:
            book = db.session.get(Book, bid)
            if not book:
                continue
            meta = {
                "title": book.title, "author": book.author,
                "published_date": book.published_date, "publisher": book.publisher,
                "isbn": book.isbn, "isbn13": book.isbn13, "language": book.language,
            }
            previews.append({
                "id": book.id,
                "original": book.filename,
                "preview": renamer.apply_scheme(template, book.filename, meta),
            })
        return jsonify(previews)

    @app.route("/api/rename/schemes", methods=["GET"])
    @login_required
    def list_schemes():
        return jsonify({
            "schemes": [
                {"key": k, "label": v, "template": renamer.SCHEMES.get(k)}
                for k, v in renamer.SCHEME_LABELS.items()
            ],
            "placeholders": [{"placeholder": p, "description": d} for p, d in renamer.PLACEHOLDERS],
        })

    @app.route("/api/rename/bulk", methods=["POST"])
    @login_required
    def bulk_rename():
        """Rename all books using the current naming scheme and folder structure. apply=true to commit."""
        data = request.get_json(silent=True) or {}
        apply = data.get("apply", False)
        scheme = Settings.get("rename_scheme", "original")
        custom_tpl = Settings.get("rename_custom_template", "")
        folder_mode = Settings.get("folder_organization", "flat")
        books = Book.query.all()
        results = []
        errors = []
        for book in books:
            src = BOOKS_DIR / book.filename
            if book.is_cleaning():
                errors.append({"id": book.id, "original": book.filename, "error": "Being cleaned up, try again shortly"})
                continue
            if not src.exists():
                errors.append({"id": book.id, "original": book.filename, "error": "File not found"})
                continue
            meta = {
                "title": book.title, "author": book.author,
                "published_date": book.published_date, "publisher": book.publisher,
                "isbn": book.isbn, "isbn13": book.isbn13, "language": book.language,
                "series": getattr(book, "series", None),
                "series_index": getattr(book, "series_order", None),
            }
            template = renamer.get_scheme_template(scheme, custom_tpl)
            # Compute expected final name (after rename + folder)
            new_filename = renamer.apply_scheme(template, Path(book.filename).name, meta)
            if folder_mode != "flat" and book.author:
                author_safe = renamer._safe(book.author)
                series = getattr(book, "series", None)
                if folder_mode == "by_author_series" and series:
                    new_filename_with_folder = f"{author_safe}/{renamer._safe(series)}/{new_filename}"
                else:
                    new_filename_with_folder = f"{author_safe}/{new_filename}"
            else:
                new_filename_with_folder = new_filename
            changed = new_filename_with_folder != book.filename
            if not changed:
                results.append({"id": book.id, "original": book.filename, "new": new_filename_with_folder, "changed": False})
                continue
            if apply:
                try:
                    original_filename = book.filename
                    old_parent = src.parent
                    current = src
                    if scheme != "original":
                        current, new_rel = renamer.rename_book_file(current, BOOKS_DIR, scheme, meta, custom_tpl)
                        book.filename = new_rel
                    if folder_mode != "flat":
                        current, new_rel = renamer.organize_into_folders(
                            current, BOOKS_DIR, book.author,
                            getattr(book, "series", None), folder_mode
                        )
                        book.filename = new_rel
                    _cleanup_empty_dirs(old_parent)
                    results.append({"id": book.id, "original": original_filename, "new": book.filename, "changed": True})
                except Exception as e:
                    errors.append({"id": book.id, "original": book.filename, "error": str(e)})
            else:
                results.append({"id": book.id, "original": book.filename, "new": new_filename_with_folder, "changed": True})
        if apply:
            db.session.commit()
        return jsonify({"results": results, "errors": errors, "applied": apply})

    # -----------------------------------------------------------------------
    # Metadata
    # -----------------------------------------------------------------------

    @app.route("/api/books/<int:book_id>/fetch-metadata", methods=["POST"])
    @login_required
    def fetch_metadata(book_id):
        book = Book.query.get_or_404(book_id)
        data = request.get_json(silent=True) or {}
        source = data.get("source", "open_library")
        query = data.get("query") or book.isbn or book.isbn13 or book.title or ""
        apply_to_book = data.get("apply", False)

        results = scraper.search_all_sources(query)

        if apply_to_book and results:
            if book.is_cleaning():
                return jsonify({"error": "This book is being cleaned up. Try again in a moment."}), 409
            _apply_metadata(book, results[0])
            _write_metadata_to_file(book)

        return jsonify(results)

    @app.route("/api/books/<int:book_id>/apply-metadata", methods=["POST"])
    @login_required
    def apply_metadata(book_id):
        book = _editable_book(book_id)
        meta = request.get_json(silent=True) or {}
        # Explicit user selection always replaces all fields
        _apply_metadata(book, meta, replace_missing_only=False)
        # Re-apply rename/organize after metadata import
        file_path = BOOKS_DIR / book.filename
        if file_path.exists():
            try:
                _rename_and_organize(book, file_path)
            except Exception as exc:
                logger.warning("Rename after metadata apply failed for book %s: %s", book_id, exc)
        _write_metadata_to_file(book)
        return jsonify(book.to_dict())

    @app.route("/api/metadata/search", methods=["GET"])
    @login_required
    def metadata_search():
        query = request.args.get("q", "").strip()
        if not query:
            return jsonify({"error": "Query required"}), 400

        # Determine which sources to search
        sources_param = request.args.get("sources", "")
        if sources_param:
            requested = [s.strip() for s in sources_param.split(",") if s.strip()]
        else:
            priority = Settings.get("source_priority", "")
            requested = [s.strip() for s in priority.split(",") if s.strip()] if priority else list(scraper.DEFAULT_SOURCE_ORDER)

        # Filter out disabled sources
        disabled_raw = Settings.get("sources_disabled", "")
        disabled = {s.strip() for s in disabled_raw.split(",") if s.strip()}
        sources = [s for s in requested if s not in disabled]

        return jsonify(scraper.search_all_sources(query, sources=sources))

    @app.route("/api/metadata/sources", methods=["GET"])
    @login_required
    def get_meta_sources():
        priority = Settings.get("source_priority", ",".join(scraper.DEFAULT_SOURCE_ORDER))
        disabled_raw = Settings.get("sources_disabled", "")
        disabled = {s.strip() for s in disabled_raw.split(",") if s.strip()}
        return jsonify({
            "all": scraper.DEFAULT_SOURCE_ORDER,
            "labels": scraper.SOURCE_LABELS,
            "priority": [s for s in priority.split(",") if s.strip()],
            "disabled": list(disabled),
        })

    @app.route("/api/metadata/sources", methods=["PUT"])
    @login_required
    def set_meta_sources():
        data = request.get_json(silent=True) or {}
        for field, key in (("priority", "source_priority"), ("disabled", "sources_disabled")):
            if field not in data:
                continue
            value = data[field]
            if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
                return jsonify({"error": f"{field} must be a list of source names"}), 400
            Settings.set(key, ",".join(v for v in value if v in scraper.SOURCE_FNS))
        return jsonify({"ok": True})

    # -----------------------------------------------------------------------
    # Covers
    # -----------------------------------------------------------------------

    @app.route("/api/books/<int:book_id>/cover", methods=["GET"])
    @login_required
    def get_cover(book_id):
        thumb = request.args.get("thumb", "false").lower() == "true"
        path = cover_mgr.get_cover_path(book_id, thumb=thumb)
        if path:
            return send_file(str(path), mimetype="image/jpeg")
        abort(404)

    @app.route("/api/books/<int:book_id>/cover", methods=["POST"])
    @login_required
    def upload_cover(book_id):
        book = _editable_book(book_id)
        file_obj = request.files.get("file") or request.files.get("cover")
        if file_obj:
            data = file_obj.read()
        else:
            body = request.get_json(silent=True) or {}
            url = body.get("url")
            if not url:
                return jsonify({"error": "No file or URL provided"}), 400
            data = scraper.fetch_cover_image(url)
            if not data:
                return jsonify({"error": "Could not download cover"}), 502

        cf = cover_mgr.save_cover(book_id, data)
        if not cf:
            return jsonify({"error": "Failed to process image"}), 500
        book.cover_filename = cf
        db.session.commit()

        # Auto-embed cover in EPUB
        epub_path = _book_path(book)
        if book.file_format == "epub" and epub_path.exists():
            cover_path = cover_mgr.get_cover_path(book_id)
            if cover_path:
                with open(str(cover_path), "rb") as fh:
                    cover_bytes = fh.read()
                if cover_mgr.embed_cover_in_epub(str(epub_path), cover_bytes):
                    book.file_size = epub_path.stat().st_size
                    db.session.commit()

        return jsonify({"success": True, "cover_filename": cf})

    @app.route("/api/books/<int:book_id>/cover/embed", methods=["POST"])
    @login_required
    def embed_cover(book_id):
        book = _editable_book(book_id)
        if book.file_format != "epub":
            return jsonify({"error": "Cover embedding only supported for EPUB files"}), 400
        path = cover_mgr.get_cover_path(book_id)
        if not path:
            return jsonify({"error": "No cover image found"}), 404
        epub_path = _book_path(book)
        if not epub_path.exists():
            return jsonify({"error": "File not found on disk"}), 404
        with open(str(path), "rb") as f:
            data = f.read()
        success = cover_mgr.embed_cover_in_epub(str(epub_path), data)
        if success:
            book.file_size = epub_path.stat().st_size
            db.session.commit()
            return jsonify({"success": True})
        return jsonify({"error": "Failed to embed cover"}), 500

    @app.route("/api/books/<int:book_id>/cover", methods=["DELETE"])
    @login_required
    def delete_cover_route(book_id):
        book = _editable_book(book_id)
        cover_mgr.delete_cover(book_id)
        book.cover_filename = None
        db.session.commit()
        return jsonify({"success": True})

    # -----------------------------------------------------------------------
    # Tags
    # -----------------------------------------------------------------------

    @app.route("/api/series", methods=["GET"])
    @login_required
    def list_series():
        rows = (
            db.session.query(Book.series)
            .filter(Book.series.isnot(None))
            .filter(Book.series != "")
            .distinct()
            .order_by(Book.series.asc())
            .all()
        )
        return jsonify([r[0] for r in rows])

    @app.route("/api/tags", methods=["GET"])
    @login_required
    def list_tags():
        # subqueryload fetches all book_tags in one extra query instead of N
        tags = Tag.query.options(subqueryload(Tag.book_tags)).order_by(Tag.name).all()
        return jsonify([t.to_dict() for t in tags])

    @app.route("/api/tags", methods=["POST"])
    @login_required
    def create_tag():
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Name is required"}), 400
        existing = Tag.query.filter_by(name=name).first()
        if existing:
            return jsonify(existing.to_dict()), 200
        tag = Tag(name=name)
        db.session.add(tag)
        db.session.commit()
        return jsonify(tag.to_dict()), 201

    @app.route("/api/tags/<int:tag_id>", methods=["DELETE"])
    @login_required
    def delete_tag(tag_id):
        tag = Tag.query.get_or_404(tag_id)
        db.session.delete(tag)
        db.session.commit()
        return jsonify({"success": True})

    @app.route("/api/books/<int:book_id>/tags", methods=["GET"])
    @login_required
    def list_book_tags(book_id):
        Book.query.get_or_404(book_id)
        bts = BookTag.query.filter_by(book_id=book_id).all()
        return jsonify([bt.tag.to_dict() for bt in bts])

    @app.route("/api/books/<int:book_id>/tags", methods=["POST"])
    @login_required
    def add_book_tag(book_id):
        Book.query.get_or_404(book_id)
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Tag name required"}), 400
        tag = Tag.query.filter_by(name=name).first()
        if not tag:
            tag = Tag(name=name)
            db.session.add(tag)
            db.session.flush()
        if not BookTag.query.filter_by(book_id=book_id, tag_id=tag.id).first():
            db.session.add(BookTag(book_id=book_id, tag_id=tag.id))
        db.session.commit()
        return jsonify(tag.to_dict()), 201

    @app.route("/api/books/<int:book_id>/tags/<int:tag_id>", methods=["DELETE"])
    @login_required
    def remove_book_tag(book_id, tag_id):
        bt = BookTag.query.filter_by(book_id=book_id, tag_id=tag_id).first_or_404()
        db.session.delete(bt)
        db.session.commit()
        return jsonify({"success": True})

    # -----------------------------------------------------------------------
    # Email Addresses
    # -----------------------------------------------------------------------

    @app.route("/api/email-addresses", methods=["GET"])
    @login_required
    def list_email_addresses():
        addresses = EmailAddress.query.order_by(EmailAddress.is_default.desc(), EmailAddress.label).all()
        return jsonify([a.to_dict() for a in addresses])

    @app.route("/api/email-addresses", methods=["POST"])
    @login_required
    def create_email_address():
        data = request.get_json(silent=True) or {}
        email = (data.get("email") or "").strip().lower()
        label = (data.get("label") or "").strip()
        if not email:
            return jsonify({"error": "Email is required"}), 400
        if not _valid_email(email):
            return jsonify({"error": "Invalid email address"}), 400
        if not label:
            label = email
        make_default = data.get("is_default", False)
        if make_default:
            EmailAddress.query.filter_by(is_default=True).update({"is_default": False})
        addr = EmailAddress(label=label, email=email, is_default=bool(make_default))
        db.session.add(addr)
        db.session.commit()
        return jsonify(addr.to_dict()), 201

    @app.route("/api/email-addresses/<int:addr_id>", methods=["PUT"])
    @login_required
    def update_email_address(addr_id):
        addr = EmailAddress.query.get_or_404(addr_id)
        data = request.get_json(silent=True) or {}
        if "label" in data:
            addr.label = (data["label"] or "").strip() or addr.email
        if "email" in data:
            addr.email = (data["email"] or "").strip().lower()
            if not _valid_email(addr.email):
                return jsonify({"error": "Invalid email address"}), 400
        if data.get("is_default"):
            EmailAddress.query.filter(EmailAddress.id != addr_id).update({"is_default": False})
            addr.is_default = True
        db.session.commit()
        return jsonify(addr.to_dict())

    @app.route("/api/email-addresses/<int:addr_id>", methods=["DELETE"])
    @login_required
    def delete_email_address(addr_id):
        addr = EmailAddress.query.get_or_404(addr_id)
        was_default = addr.is_default
        db.session.delete(addr)
        db.session.commit()
        # Promote oldest remaining address to default if we deleted the default
        if was_default:
            first = EmailAddress.query.order_by(EmailAddress.date_added).first()
            if first:
                first.is_default = True
                db.session.commit()
        return jsonify({"success": True})

    @app.route("/api/email-addresses/<int:addr_id>/set-default", methods=["POST"])
    @login_required
    def set_default_email(addr_id):
        EmailAddress.query.filter_by(is_default=True).update({"is_default": False})
        addr = EmailAddress.query.get_or_404(addr_id)
        addr.is_default = True
        db.session.commit()
        return jsonify(addr.to_dict())

    # -----------------------------------------------------------------------
    # Send via SMTP / Kindle
    # -----------------------------------------------------------------------

    @app.route("/api/books/<int:book_id>/send", methods=["POST"])
    @login_required
    def send_book(book_id):
        book = Book.query.get_or_404(book_id)
        data = request.get_json(silent=True) or {}

        # Resolve recipient: explicit > EmailAddress table default > legacy Settings key
        recipient = str(data.get("recipient") or "").strip()
        if not recipient:
            default_addr = EmailAddress.query.filter_by(is_default=True).first()
            recipient = default_addr.email if default_addr else Settings.get("kindle_email")
        if not recipient:
            return jsonify({"error": "No recipient email set. Add one in Settings → Account."}), 400
        if not _valid_email(recipient):
            return jsonify({"error": "Invalid recipient email address"}), 400

        smtp_host = Settings.get("smtp_host")
        smtp_port = _safe_int(Settings.get("smtp_port"), 587)
        smtp_user = Settings.get("smtp_user")
        smtp_password = crypto.decrypt_value(Settings.get("smtp_password") or "", DATA_DIR)
        use_tls = Settings.get("smtp_tls", "true").lower() == "true"
        sender_email = Settings.get("smtp_sender") or smtp_user

        if not smtp_host or not smtp_user or not smtp_password:
            return jsonify({"error": "SMTP settings incomplete. Configure in Settings first."}), 400

        filepath = str(_book_path(book))
        ok, msg = mailer.send_book(
            filepath=filepath,
            recipient=recipient,
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_user=smtp_user,
            smtp_password=smtp_password,
            use_tls=use_tls,
            sender_email=sender_email,
            subject=f"Book: {book.title or book.filename}",
        )
        if ok:
            return jsonify({"success": True, "message": msg})
        return jsonify({"error": msg}), 500

    # -----------------------------------------------------------------------
    # Settings
    # -----------------------------------------------------------------------

    SETTINGS_KEYS = [
        "smtp_host", "smtp_port", "smtp_user", "smtp_password",
        "smtp_tls", "smtp_sender",
        "auto_metadata", "meta_replace_missing", "apply_meta_cover",
        "source_priority", "sources_disabled", "folder_organization",
        "rename_scheme", "rename_custom_template",
        "display_name",
        "log_level",
        "opds_enabled",
        "kosync_enabled",
        "epub_cleanup_on_upload", "epub_cleanup_steps",
    ]

    _MASKED = "••••••••"
    _MASKED_KEYS = {"smtp_password"}

    @app.route("/api/settings", methods=["GET"])
    @login_required
    def get_settings():
        result = {}
        for key in SETTINGS_KEYS:
            val = Settings.get(key)
            if key in _MASKED_KEYS:
                # Return bool-indicator instead of raw value
                result[key] = _MASKED if val else ""
            else:
                result[key] = val
        # KOReader sync can only check passwords set or used since it was added
        result["kosync_key_set"] = has_sync_key(Settings)
        return jsonify(result)

    @app.route("/api/settings", methods=["PUT"])
    @login_required
    def update_settings():
        data = request.get_json(silent=True) or {}
        for key in SETTINGS_KEYS:
            if key not in data:
                continue
            val = data[key]
            # Skip masked placeholder writes
            if key in _MASKED_KEYS and val == _MASKED:
                continue
            if key == "log_level":
                val = str(val or "INFO").upper()
                if val not in _VALID_LOG_LEVELS:
                    return jsonify({"error": "Invalid log level"}), 400
                logging.getLogger().setLevel(getattr(logging, val))
            if key in _MASKED_KEYS and val:
                val = crypto.encrypt_value(str(val), DATA_DIR)
            Settings.set(key, str(val) if val is not None else None)
        return jsonify({"success": True})

    def _smtp_test_params(data: dict):
        """Resolve SMTP test settings from the request, falling back to saved values.

        The saved password is only reused when the host and user match the saved
        ones, so it can't be sent to a different server just by changing the host.
        """
        saved_host = Settings.get("smtp_host")
        saved_user = Settings.get("smtp_user")
        host = data.get("smtp_host") or saved_host
        port = _safe_int(data.get("smtp_port") or Settings.get("smtp_port"), 587)
        user = data.get("smtp_user") or saved_user
        pwd = data.get("smtp_password")
        if not pwd or pwd == _MASKED:
            if host == saved_host and user == saved_user:
                pwd = crypto.decrypt_value(Settings.get("smtp_password") or "", DATA_DIR)
            else:
                pwd = ""
        tls = str(data.get("use_tls", Settings.get("smtp_tls", "true"))).lower() == "true"
        return host, port, user, pwd, tls

    @app.route("/api/settings/test-smtp", methods=["POST"])
    @login_required
    def test_smtp():
        data = request.get_json(silent=True) or {}
        host, port, user, pwd, tls = _smtp_test_params(data)
        if not host or not user or not pwd:
            return jsonify({"error": "Incomplete SMTP settings"}), 400
        ok, msg = mailer.test_smtp_connection(host, port, user, pwd, tls)
        if ok:
            return jsonify({"success": True, "message": msg})
        return jsonify({"success": False, "error": msg})

    @app.route("/api/settings/test-smtp-send", methods=["POST"])
    @login_required
    def test_smtp_send():
        data = request.get_json(silent=True) or {}
        host, port, user, pwd, tls = _smtp_test_params(data)
        recipient = str(data.get("recipient") or "").strip()
        sender = data.get("sender_email") or Settings.get("smtp_sender") or user
        if not host or not user or not pwd:
            return jsonify({"error": "Incomplete SMTP settings"}), 400
        if not recipient:
            return jsonify({"error": "Recipient email is required"}), 400
        if not _valid_email(recipient):
            return jsonify({"error": "Invalid recipient email address"}), 400
        ok, msg = mailer.send_test_email(host, port, user, pwd, tls, recipient, sender)
        if ok:
            return jsonify({"success": True, "message": msg})
        return jsonify({"success": False, "error": msg})

    @app.route("/api/books/<int:book_id>/organize", methods=["POST"])
    @login_required
    def organize_book(book_id):
        """Move a book file into Author/ or Author/Series/ subfolder."""
        book = _editable_book(book_id)
        src = BOOKS_DIR / book.filename
        if not src.exists():
            return jsonify({"error": "File not found on disk"}), 404
        folder_mode = Settings.get("folder_organization", "flat")
        new_path, new_rel = renamer.organize_into_folders(
            src, BOOKS_DIR, book.author, book.series, folder_mode
        )
        book.filename = new_rel
        db.session.commit()
        return jsonify({"success": True, "filename": new_rel})

    # -----------------------------------------------------------------------
    # Stats
    # -----------------------------------------------------------------------

    @app.route("/api/stats", methods=["GET"])
    @login_required
    def stats():
        total_books = Book.query.count()
        formats = db.session.query(Book.file_format, db.func.count()).group_by(Book.file_format).all()
        languages = (
            db.session.query(Book.language, db.func.count())
            .filter(Book.language.isnot(None))
            .group_by(Book.language)
            .all()
        )
        total_size = db.session.query(db.func.sum(Book.file_size)).scalar() or 0
        return jsonify({
            "total_books": total_books,
            "formats": {fmt: cnt for fmt, cnt in formats if fmt},
            "languages": {lang: cnt for lang, cnt in languages},
            "total_size_bytes": total_size,
        })

    @app.route("/api/logs", methods=["GET"])
    @login_required
    def get_logs():
        level = request.args.get("level", "").upper()
        lines = _log_buffer.get_lines()
        if level in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
            level_names = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
            min_num = getattr(logging, level, logging.DEBUG)
            def _meets_level(line: str) -> bool:
                for lname in level_names:
                    if lname in line and getattr(logging, lname, 0) >= min_num:
                        return True
                return False
            lines = [l for l in lines if _meets_level(l)]
        return jsonify({"logs": lines})

    @app.route("/api/logs/level", methods=["PUT"])
    @login_required
    def set_log_level():
        data = request.get_json(silent=True) or {}
        level = str(data.get("level") or "INFO").upper()
        if level not in _VALID_LOG_LEVELS:
            return jsonify({"error": f"Invalid level; must be one of {sorted(_VALID_LOG_LEVELS)}"}), 400
        numeric = getattr(logging, level, logging.INFO)
        logging.getLogger().setLevel(numeric)
        Settings.set("log_level", level)
        return jsonify({"level": level})

    @app.route("/api/update-check", methods=["GET"])
    @login_required
    def update_check():
        return jsonify(_check_for_update())

    return app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rename_and_organize(book, file_path: Path):
    """Apply rename scheme and folder organization to a newly added book file."""
    scheme = Settings.get("rename_scheme", "original")
    custom_tpl = Settings.get("rename_custom_template", "")
    folder_mode = Settings.get("folder_organization", "flat")

    meta = {
        "title": book.title, "author": book.author,
        "published_date": book.published_date, "publisher": book.publisher,
        "isbn": book.isbn, "isbn13": book.isbn13, "language": book.language,
        "series": getattr(book, "series", None),
        "series_index": getattr(book, "series_order", None),
    }

    old_parent = file_path.parent
    current = file_path
    if scheme != "original":
        current, new_rel = renamer.rename_book_file(current, BOOKS_DIR, scheme, meta, custom_tpl)
        book.filename = new_rel

    if folder_mode != "flat":
        current, new_rel = renamer.organize_into_folders(
            current, BOOKS_DIR, book.author, getattr(book, "series", None), folder_mode
        )
        book.filename = new_rel

    # Clean up empty old parent directories (but never BOOKS_DIR itself)
    if current != file_path:
        try:
            for folder in [old_parent, old_parent.parent]:
                if folder != BOOKS_DIR and folder.exists() and not any(folder.iterdir()):
                    folder.rmdir()
        except Exception:
            pass

    from models import db as _db
    _db.session.commit()


def _write_metadata_to_file(book: Book):
    """After the user edits a book's details, save them into the EPUB too, when
    the "Write metadata into the file" cleanup step is on. Never fails the edit."""
    if book.file_format != "epub" or "metadata" not in epub_cleanup.parse_steps(Settings.get("epub_cleanup_steps")):
        return
    try:
        _cleanup_book(book, steps={"metadata"})
    except Exception as exc:
        logger.warning("Writing metadata into %s failed: %s", book.filename, exc)


def _cleanup_book(book: Book, locked: bool = False, steps: set[str] | None = None) -> list[str]:
    """Run the enabled epub cleanup steps on *book*'s file. Returns what changed.

    The book is marked as cleaning while this runs, so the UI shows progress and
    edits are refused; *locked* means the caller already marked it."""
    path = _book_path(book)
    if not path.exists():
        raise FileNotFoundError(path)
    if not locked:
        book.cleanup_started = datetime.now(timezone.utc)
        db.session.commit()
    try:
        if steps is None:
            steps = epub_cleanup.parse_steps(Settings.get("epub_cleanup_steps"))
        actions = epub_cleanup.clean_epub(str(path), {
            "title": book.title, "author": book.author, "publisher": book.publisher,
            "language": book.language, "description": book.description,
            "published_date": book.published_date, "isbn": book.isbn, "isbn13": book.isbn13,
            "series": book.series, "series_order": book.series_order,
        }, steps)
        if actions:
            book.file_size = path.stat().st_size
            logger.info("Cleaned %s: %s", book.filename, "; ".join(actions))
    finally:
        if not locked:
            book.cleanup_started = None
        db.session.commit()
    return actions


def _migrate_db(app):
    """Add columns introduced in newer schema versions to existing databases."""
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE books ADD COLUMN series TEXT",
        "ALTER TABLE books ADD COLUMN series_order REAL",
        "ALTER TABLE books ADD COLUMN cleanup_started DATETIME",
        "CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)",
        "CREATE TABLE IF NOT EXISTS book_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER REFERENCES books(id), tag_id INTEGER REFERENCES tags(id), UNIQUE(book_id, tag_id))",
        "CREATE INDEX IF NOT EXISTS ix_books_language ON books (language)",
        "CREATE INDEX IF NOT EXISTS ix_books_series ON books (series)",
    ]
    with app.app_context():
        with db.engine.connect() as conn:
            for stmt in migrations:
                try:
                    conn.execute(text(stmt))
                    conn.commit()
                except Exception as exc:
                    logger.debug("Migration skipped (already applied): %s — %s", stmt[:60], exc)


def _apply_metadata(book: Book, meta: dict, replace_missing_only: bool = None):
    if replace_missing_only is None:
        replace_missing_only = Settings.get("meta_replace_missing", "true") == "true"
    if not isinstance(meta, dict):
        return
    field_map = {
        "title": "title", "author": "author",
        "published_date": "published_date",
        "page_count": "page_count",
        # Stored so later lookups can search by ISBN and the language filter works
        "isbn": "isbn", "isbn13": "isbn13",
        "language": "language",
    }
    for src_key, model_key in field_map.items():
        val = meta.get(src_key)
        if src_key == "page_count" and not isinstance(val, int):
            val = None
        elif val is not None and src_key != "page_count":
            val = str(val).strip()
        if val:
            if src_key == "published_date":
                val = val[:4]  # store year only
            if src_key == "language":
                # Sources may return several languages ("eng, fre"); keep the first
                val = val.split(",")[0].strip()[:16]
            if replace_missing_only and getattr(book, model_key, None):
                continue
            setattr(book, model_key, val)
    cover_url = meta.get("cover_url")
    if isinstance(cover_url, str) and cover_url:
        if not replace_missing_only or not book.cover_filename:
            data = scraper.fetch_cover_image(cover_url)
            if data:
                cf = cover_mgr.save_cover(book.id, data)
                if cf:
                    book.cover_filename = cf
    db.session.commit()


def _auto_fetch_metadata(book: Book):
    """Search online metadata sources to fill gaps in book record."""
    # Build the best possible query: prefer ISBN, then clean title + author
    if book.isbn13:
        query = book.isbn13
    elif book.isbn:
        query = book.isbn
    else:
        title = book.title or ""
        # Strip underscores/dashes that look like filenames, drop trailing year
        title = re.sub(r"[_]+", " ", title)
        title = re.sub(r"\s*[-–]\s*\d{4}\s*$", "", title)
        title = re.sub(r"\s+", " ", title).strip()
        query = " ".join(filter(None, [title, book.author]))

    if not query.strip():
        return

    # Get enabled sources from settings (same order + disabled list)
    disabled_raw = Settings.get("sources_disabled", "")
    disabled = {s.strip() for s in disabled_raw.split(",") if s.strip()}
    priority_raw = Settings.get("source_priority", "")
    sources = [
        s.strip()
        for s in (priority_raw.split(",") if priority_raw else scraper.DEFAULT_SOURCE_ORDER)
        if s.strip() and s.strip() not in disabled
    ]

    results = scraper.search_all_sources(query, sources=sources)
    if results:
        _apply_metadata(book, results[0])


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=False)
