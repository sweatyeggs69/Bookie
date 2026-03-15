"""Booker – Docker ebook manager with Material Design 3 UI."""
import io
import json
import os
import secrets
import logging
from datetime import timedelta, date
from pathlib import Path


DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))


def _get_or_create_secret_key() -> str:
    key_file = DATA_DIR / "secret_key"
    key_file.parent.mkdir(parents=True, exist_ok=True)
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_hex(32)
    key_file.write_text(key)
    return key

from flask import (
    Flask,
    jsonify,
    request,
    send_file,
    render_template,
    redirect,
    session,
    abort,
)
from werkzeug.utils import secure_filename

from models import db, Book, Shelf, ShelfBook, Settings, EmailAddress
from auth import login_required, register_auth_routes
import scraper
import covers as cover_mgr
import mailer
import renamer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BOOKS_DIR = DATA_DIR / "books"
COVERS_DIR = DATA_DIR / "covers"
ALLOWED_EXTENSIONS = {"epub", "pdf", "mobi", "azw", "azw3", "fb2", "djvu", "cbz", "cbr", "txt"}
MAX_UPLOAD_MB = 35


def create_app():
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
        "DATABASE_URL", f"sqlite:///{(DATA_DIR / 'booker.db').absolute()}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or _get_or_create_secret_key()
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)

    db.init_app(app)

    with app.app_context():
        BOOKS_DIR.mkdir(parents=True, exist_ok=True)
        COVERS_DIR.mkdir(parents=True, exist_ok=True)
        db.create_all()

    # Register auth routes
    register_auth_routes(app, Settings)

    # -----------------------------------------------------------------------
    # Frontend
    # -----------------------------------------------------------------------

    @app.route("/")
    @login_required
    def index():
        return render_template("index.html", username=session.get("username", ""))

    @app.route("/sw.js")
    def service_worker():
        """Serve SW from root scope so it can control all pages."""
        from flask import send_from_directory
        resp = send_from_directory("static", "sw.js")
        resp.headers["Service-Worker-Allowed"] = "/"
        resp.headers["Cache-Control"] = "no-cache"
        return resp

    # -----------------------------------------------------------------------
    # Books – CRUD
    # -----------------------------------------------------------------------

    @app.route("/api/books", methods=["GET"])
    @login_required
    def list_books():
        query = Book.query
        search = request.args.get("q", "").strip()
        if search:
            like = f"%{search}%"
            query = query.filter(
                db.or_(
                    Book.title.ilike(like),
                    Book.author.ilike(like),
                    Book.isbn.ilike(like),
                    Book.isbn13.ilike(like),
                )
            )
        fmt = request.args.get("format")
        if fmt:
            query = query.filter(Book.file_format == fmt.lower())
        shelf_id = request.args.get("shelf_id", type=int)
        if shelf_id:
            shelf = Shelf.query.get(shelf_id)
            if shelf and shelf.is_smart:
                try:
                    rules = json.loads(shelf.rules or "[]")
                except Exception:
                    rules = []
                query = _build_smart_query(query, rules, shelf.combination or "all")
            else:
                query = query.join(ShelfBook).filter(ShelfBook.shelf_id == shelf_id)
        lang = request.args.get("language")
        if lang:
            query = query.filter(Book.language == lang)
        sort = request.args.get("sort", "date_added")
        order = request.args.get("order", "desc")
        col = getattr(Book, sort, None)
        if col is not None:
            query = query.order_by(col.desc() if order == "desc" else col.asc())
        page = request.args.get("page", 1, type=int)
        per_page = request.args.get("per_page", 40, type=int)
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

        filename = secure_filename(file.filename)
        dest = BOOKS_DIR / filename
        counter = 1
        stem = Path(filename).stem
        while dest.exists():
            filename = f"{stem}_{counter}.{ext}"
            dest = BOOKS_DIR / filename
            counter += 1

        file.save(str(dest))
        size = dest.stat().st_size

        book = Book(
            filename=filename,
            file_format=ext,
            file_size=size,
            title=Path(filename).stem,
        )
        db.session.add(book)
        db.session.commit()

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

        # Auto-fetch metadata if enabled
        auto_meta = Settings.get("auto_metadata", "false")
        if auto_meta == "true":
            _auto_fetch_metadata(book)

        # Apply renaming scheme
        scheme = Settings.get("rename_scheme", "original")
        custom_tpl = Settings.get("rename_custom_template", "")
        if scheme != "original":
            meta = {
                "title": book.title,
                "author": book.author,
                "published_date": book.published_date,
                "publisher": book.publisher,
                "isbn": book.isbn,
                "isbn13": book.isbn13,
                "language": book.language,
            }
            new_path, new_name = renamer.rename_book_file(dest, BOOKS_DIR, scheme, meta, custom_tpl)
            book.filename = new_name
            db.session.commit()

        return jsonify(book.to_dict()), 201

    @app.route("/api/books/<int:book_id>", methods=["PUT"])
    @login_required
    def update_book(book_id):
        book = Book.query.get_or_404(book_id)
        data = request.get_json(force=True)
        fields = [
            "title", "author", "isbn", "isbn13", "publisher", "published_date",
            "language", "description", "page_count", "categories", "rating",
            "google_books_id", "goodreads_id",
        ]
        for f in fields:
            if f in data:
                setattr(book, f, data[f])
        db.session.commit()
        return jsonify(book.to_dict())

    @app.route("/api/books/<int:book_id>", methods=["DELETE"])
    @login_required
    def delete_book(book_id):
        book = Book.query.get_or_404(book_id)
        filepath = BOOKS_DIR / book.filename
        if filepath.exists():
            filepath.unlink()
        cover_mgr.delete_cover(book_id)
        db.session.delete(book)
        db.session.commit()
        return jsonify({"success": True})

    @app.route("/api/books/<int:book_id>/download", methods=["GET"])
    @login_required
    def download_book(book_id):
        book = Book.query.get_or_404(book_id)
        filepath = BOOKS_DIR / book.filename
        if not filepath.exists():
            abort(404)
        return send_file(str(filepath), as_attachment=True, download_name=book.filename)

    @app.route("/api/books/<int:book_id>/rename", methods=["POST"])
    @login_required
    def rename_book(book_id):
        """Rename a specific book's file using a given scheme or custom template."""
        book = Book.query.get_or_404(book_id)
        data = request.get_json(force=True) or {}
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
        src = BOOKS_DIR / book.filename
        if not src.exists():
            return jsonify({"error": "File not found on disk"}), 404
        new_path, new_name = renamer.rename_book_file(src, BOOKS_DIR, scheme, meta, custom_tpl)
        book.filename = new_name
        db.session.commit()
        return jsonify({"success": True, "new_filename": new_name})

    @app.route("/api/rename/preview", methods=["POST"])
    @login_required
    def rename_preview():
        """Preview how a naming scheme would rename a list of books."""
        data = request.get_json(force=True) or {}
        scheme = data.get("scheme", "author_title")
        custom_tpl = data.get("custom_template", "")
        book_ids = data.get("book_ids", [])
        template = renamer.get_scheme_template(scheme, custom_tpl)
        previews = []
        for bid in book_ids:
            book = Book.query.get(bid)
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

    # -----------------------------------------------------------------------
    # Metadata
    # -----------------------------------------------------------------------

    @app.route("/api/books/<int:book_id>/fetch-metadata", methods=["POST"])
    @login_required
    def fetch_metadata(book_id):
        book = Book.query.get_or_404(book_id)
        data = request.get_json(force=True) or {}
        source = data.get("source", "google_books")
        query = data.get("query") or book.isbn or book.isbn13 or book.title or ""
        apply_to_book = data.get("apply", False)

        results = []
        if source == "google_books":
            results = scraper.search_google_books(query)
        elif source == "open_library":
            results = scraper.search_open_library(query)
        elif source == "goodreads":
            results = scraper.search_goodreads(query)
        elif source == "amazon":
            results = scraper.search_amazon(query)
        elif source == "all":
            return jsonify(scraper.search_all_sources(query))

        if apply_to_book and results:
            _apply_metadata(book, results[0])

        return jsonify(results)

    @app.route("/api/books/<int:book_id>/apply-metadata", methods=["POST"])
    @login_required
    def apply_metadata(book_id):
        book = Book.query.get_or_404(book_id)
        meta = request.get_json(force=True) or {}
        _apply_metadata(book, meta)
        return jsonify(book.to_dict())

    @app.route("/api/metadata/search", methods=["GET"])
    @login_required
    def metadata_search():
        query = request.args.get("q", "").strip()
        source = request.args.get("source", "google_books")
        if not query:
            return jsonify({"error": "Query required"}), 400
        if source == "google_books":
            return jsonify(scraper.search_google_books(query))
        elif source == "open_library":
            return jsonify(scraper.search_open_library(query))
        elif source == "goodreads":
            return jsonify(scraper.search_goodreads(query))
        elif source == "amazon":
            return jsonify(scraper.search_amazon(query))
        return jsonify(scraper.search_all_sources(query))

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
        book = Book.query.get_or_404(book_id)
        if "file" in request.files:
            data = request.files["file"].read()
        else:
            body = request.get_json(force=True) or {}
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
        if book.file_format == "epub":
            epub_path = str(BOOKS_DIR / book.filename)
            cover_path = cover_mgr.get_cover_path(book_id)
            if cover_path:
                with open(str(cover_path), "rb") as fh:
                    cover_bytes = fh.read()
                cover_mgr.embed_cover_in_epub(epub_path, cover_bytes)

        return jsonify({"success": True, "cover_filename": cf})

    @app.route("/api/books/<int:book_id>/cover/embed", methods=["POST"])
    @login_required
    def embed_cover(book_id):
        book = Book.query.get_or_404(book_id)
        if book.file_format != "epub":
            return jsonify({"error": "Cover embedding only supported for EPUB files"}), 400
        path = cover_mgr.get_cover_path(book_id)
        if not path:
            return jsonify({"error": "No cover image found"}), 404
        with open(str(path), "rb") as f:
            data = f.read()
        success = cover_mgr.embed_cover_in_epub(str(BOOKS_DIR / book.filename), data)
        if success:
            return jsonify({"success": True})
        return jsonify({"error": "Failed to embed cover"}), 500

    @app.route("/api/books/<int:book_id>/cover", methods=["DELETE"])
    @login_required
    def delete_cover_route(book_id):
        book = Book.query.get_or_404(book_id)
        cover_mgr.delete_cover(book_id)
        book.cover_filename = None
        db.session.commit()
        return jsonify({"success": True})

    # -----------------------------------------------------------------------
    # Shelves
    # -----------------------------------------------------------------------

    @app.route("/api/shelves", methods=["GET"])
    @login_required
    def list_shelves():
        shelves = Shelf.query.order_by(Shelf.name).all()
        return jsonify([s.to_dict() for s in shelves])

    @app.route("/api/shelves", methods=["POST"])
    @login_required
    def create_shelf():
        data = request.get_json(force=True)
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Name is required"}), 400
        if Shelf.query.filter_by(name=name).first():
            return jsonify({"error": "Shelf name already exists"}), 409
        shelf = Shelf(
            name=name,
            description=data.get("description", ""),
            color=data.get("color", "#D0BCFF"),
            icon=data.get("icon", "shelf"),
            is_smart=bool(data.get("is_smart", False)),
            rules=data.get("rules", "[]"),
            combination=data.get("combination", "all"),
        )
        db.session.add(shelf)
        db.session.commit()
        return jsonify(shelf.to_dict()), 201

    @app.route("/api/shelves/<int:shelf_id>", methods=["PUT"])
    @login_required
    def update_shelf(shelf_id):
        shelf = Shelf.query.get_or_404(shelf_id)
        data = request.get_json(force=True)
        for f in ("name", "description", "color", "icon", "is_smart", "rules", "combination"):
            if f in data:
                setattr(shelf, f, data[f])
        db.session.commit()
        return jsonify(shelf.to_dict())

    @app.route("/api/shelves/<int:shelf_id>", methods=["DELETE"])
    @login_required
    def delete_shelf(shelf_id):
        shelf = Shelf.query.get_or_404(shelf_id)
        db.session.delete(shelf)
        db.session.commit()
        return jsonify({"success": True})

    @app.route("/api/shelves/<int:shelf_id>/books", methods=["POST"])
    @login_required
    def add_book_to_shelf(shelf_id):
        Shelf.query.get_or_404(shelf_id)
        data = request.get_json(force=True)
        book_ids = data.get("book_ids") or ([data["book_id"]] if "book_id" in data else [])
        added = 0
        for bid in book_ids:
            if not ShelfBook.query.filter_by(shelf_id=shelf_id, book_id=bid).first():
                db.session.add(ShelfBook(shelf_id=shelf_id, book_id=bid))
                added += 1
        db.session.commit()
        return jsonify({"added": added})

    @app.route("/api/shelves/<int:shelf_id>/books/<int:book_id>", methods=["DELETE"])
    @login_required
    def remove_book_from_shelf(shelf_id, book_id):
        sb = ShelfBook.query.filter_by(shelf_id=shelf_id, book_id=book_id).first_or_404()
        db.session.delete(sb)
        db.session.commit()
        return jsonify({"success": True})

    @app.route("/api/shelves/<int:shelf_id>/books", methods=["GET"])
    @login_required
    def list_shelf_books(shelf_id):
        shelf = Shelf.query.get_or_404(shelf_id)
        if shelf.is_smart:
            try:
                rules = json.loads(shelf.rules or "[]")
            except Exception:
                rules = []
            query = _build_smart_query(Book.query, rules, shelf.combination or "all")
            return jsonify([b.to_dict() for b in query.all()])
        sbs = ShelfBook.query.filter_by(shelf_id=shelf_id).all()
        return jsonify([sb.book.to_dict() for sb in sbs])

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
        data = request.get_json(force=True) or {}
        email = (data.get("email") or "").strip().lower()
        label = (data.get("label") or "").strip()
        if not email:
            return jsonify({"error": "Email is required"}), 400
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
        data = request.get_json(force=True) or {}
        if "label" in data:
            addr.label = (data["label"] or "").strip() or addr.email
        if "email" in data:
            addr.email = (data["email"] or "").strip().lower()
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
        data = request.get_json(force=True) or {}

        # Resolve recipient: explicit > EmailAddress table default > legacy Settings key
        recipient = data.get("recipient")
        if not recipient:
            default_addr = EmailAddress.query.filter_by(is_default=True).first()
            recipient = default_addr.email if default_addr else Settings.get("kindle_email")
        if not recipient:
            return jsonify({"error": "No recipient email set. Add one in Settings → Account."}), 400

        smtp_host = data.get("smtp_host") or Settings.get("smtp_host")
        smtp_port = int(data.get("smtp_port") or Settings.get("smtp_port") or 587)
        smtp_user = data.get("smtp_user") or Settings.get("smtp_user")
        smtp_password = data.get("smtp_password") or Settings.get("smtp_password")
        use_tls = str(data.get("use_tls", Settings.get("smtp_tls", "true"))).lower() == "true"
        sender_email = data.get("sender_email") or Settings.get("smtp_sender") or smtp_user

        if not smtp_host or not smtp_user or not smtp_password:
            return jsonify({"error": "SMTP settings incomplete. Configure in Settings first."}), 400

        filepath = str(BOOKS_DIR / book.filename)
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
        "smtp_tls", "smtp_sender", "kindle_email",
        "auto_metadata", "default_metadata_source", "meta_replace_missing",
        "books_per_page", "default_view",
        "rename_scheme", "rename_custom_template",
    ]

    @app.route("/api/settings", methods=["GET"])
    @login_required
    def get_settings():
        result = {}
        for key in SETTINGS_KEYS:
            val = Settings.get(key)
            if key == "smtp_password" and val:
                result[key] = "••••••••"
            else:
                result[key] = val
        return jsonify(result)

    @app.route("/api/settings", methods=["PUT"])
    @login_required
    def update_settings():
        data = request.get_json(force=True) or {}
        for key in SETTINGS_KEYS:
            if key in data:
                if key == "smtp_password" and data[key] == "••••••••":
                    continue
                Settings.set(key, str(data[key]) if data[key] is not None else None)
        return jsonify({"success": True})

    @app.route("/api/settings/test-smtp", methods=["POST"])
    @login_required
    def test_smtp():
        data = request.get_json(force=True) or {}
        host = data.get("smtp_host") or Settings.get("smtp_host")
        port = int(data.get("smtp_port") or Settings.get("smtp_port") or 587)
        user = data.get("smtp_user") or Settings.get("smtp_user")
        pwd = data.get("smtp_password")
        if pwd == "••••••••":
            pwd = Settings.get("smtp_password")
        tls = str(data.get("use_tls", Settings.get("smtp_tls", "true"))).lower() == "true"
        if not host or not user or not pwd:
            return jsonify({"error": "Incomplete SMTP settings"}), 400
        ok, msg = mailer.test_smtp_connection(host, port, user, pwd, tls)
        if ok:
            return jsonify({"success": True, "message": msg})
        return jsonify({"success": False, "error": msg})

    @app.route("/api/settings/test-smtp-send", methods=["POST"])
    @login_required
    def test_smtp_send():
        data = request.get_json(force=True) or {}
        host = data.get("smtp_host") or Settings.get("smtp_host")
        port = int(data.get("smtp_port") or Settings.get("smtp_port") or 587)
        user = data.get("smtp_user") or Settings.get("smtp_user")
        pwd = data.get("smtp_password")
        if pwd == "••••••••":
            pwd = Settings.get("smtp_password")
        tls = str(data.get("use_tls", Settings.get("smtp_tls", "true"))).lower() == "true"
        recipient = data.get("recipient", "").strip()
        sender = data.get("sender_email") or Settings.get("smtp_sender") or user
        if not host or not user or not pwd:
            return jsonify({"error": "Incomplete SMTP settings"}), 400
        if not recipient:
            return jsonify({"error": "Recipient email is required"}), 400
        ok, msg = mailer.send_test_email(host, port, user, pwd, tls, recipient, sender)
        if ok:
            return jsonify({"success": True, "message": msg})
        return jsonify({"success": False, "error": msg})

    # -----------------------------------------------------------------------
    # Stats
    # -----------------------------------------------------------------------

    @app.route("/api/stats", methods=["GET"])
    @login_required
    def stats():
        total_books = Book.query.count()
        total_shelves = Shelf.query.count()
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
            "total_shelves": total_shelves,
            "formats": {fmt: cnt for fmt, cnt in formats if fmt},
            "languages": {lang: cnt for lang, cnt in languages},
            "total_size_bytes": total_size,
        })

    return app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _apply_metadata(book: Book, meta: dict, replace_missing_only: bool = None):
    if replace_missing_only is None:
        replace_missing_only = Settings.get("meta_replace_missing", "true") == "true"
    field_map = {
        "title": "title", "author": "author", "isbn": "isbn", "isbn13": "isbn13",
        "publisher": "publisher", "published_date": "published_date",
        "language": "language", "description": "description",
        "page_count": "page_count", "categories": "categories",
        "rating": "rating", "google_books_id": "google_books_id",
        "goodreads_id": "goodreads_id",
    }
    for src_key, model_key in field_map.items():
        val = meta.get(src_key)
        if val:
            if replace_missing_only and getattr(book, model_key, None):
                continue
            setattr(book, model_key, val)
    cover_url = meta.get("cover_url")
    if cover_url:
        if not replace_missing_only or not book.cover_filename:
            data = scraper.fetch_cover_image(cover_url)
            if data:
                cf = cover_mgr.save_cover(book.id, data)
                if cf:
                    book.cover_filename = cf
    db.session.commit()


def _build_smart_query(query, rules: list, combination: str):
    """Apply smart shelf rules to a Book query."""
    filters = []
    for rule in rules:
        field = rule.get("field", "")
        op = rule.get("op", "")
        value = rule.get("value", "")
        if not field or not op or value == "":
            continue
        col = getattr(Book, field, None)
        if col is None:
            continue
        try:
            if op == "contains":
                filters.append(col.ilike(f"%{value}%"))
            elif op == "equals":
                filters.append(col.ilike(value))
            elif op == "startswith":
                filters.append(col.ilike(f"{value}%"))
            elif op == "before":
                filters.append(col < str(value))
            elif op == "after":
                filters.append(col > str(value))
            elif op == "gte":
                filters.append(col >= float(value))
            elif op == "lte":
                filters.append(col <= float(value))
        except Exception:
            continue
    if not filters:
        return query
    if combination == "any":
        return query.filter(db.or_(*filters))
    return query.filter(db.and_(*filters))


def _auto_fetch_metadata(book: Book):
    source = Settings.get("default_metadata_source", "google_books")
    query = book.isbn or book.isbn13 or book.title or ""
    if not query:
        return
    results = []
    if source == "google_books":
        results = scraper.search_google_books(query, max_results=1)
    elif source == "open_library":
        results = scraper.search_open_library(query, max_results=1)
    if results:
        _apply_metadata(book, results[0])


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5000, debug=False)
