"""OPDS 1.2 catalog so e-reader apps (KOReader, Moon+ Reader, etc.) can browse
and download books directly from Bookie.

The feed is off until enabled in Settings. Readers authenticate with HTTP Basic
using the normal Bookie username and password.
"""
import math
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import quote

from flask import Response, abort, request, send_file

import covers as cover_mgr
from auth import basic_auth_required
from models import Book, Settings, db

ATOM_NS = "http://www.w3.org/2005/Atom"
DC_NS = "http://purl.org/dc/terms/"
OPENSEARCH_NS = "http://a9.com/-/spec/opensearch/1.1/"

NAV_TYPE = "application/atom+xml;profile=opds-catalog;kind=navigation"
ACQ_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition"
OPENSEARCH_TYPE = "application/opensearchdescription+xml"

PER_PAGE = 50

MIME_TYPES = {
    "epub": "application/epub+zip",
    "pdf": "application/pdf",
    "mobi": "application/x-mobipocket-ebook",
    "azw": "application/vnd.amazon.ebook",
    "azw3": "application/vnd.amazon.ebook",
    "fb2": "application/x-fictionbook+xml",
    "djvu": "image/vnd.djvu",
    "cbz": "application/vnd.comicbook+zip",
    "cbr": "application/vnd.comicbook-rar",
    "txt": "text/plain",
}

ET.register_namespace("", ATOM_NS)
ET.register_namespace("dc", DC_NS)
ET.register_namespace("opensearch", OPENSEARCH_NS)


def _a(tag: str) -> str:
    return f"{{{ATOM_NS}}}{tag}"


def _iso(dt: datetime | None) -> str:
    if dt is None:
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat(timespec="seconds")


def _sub(parent, tag: str, text: str | None = None, **attrs):
    el = ET.SubElement(parent, tag, {k: v for k, v in attrs.items() if v is not None})
    if text is not None:
        el.text = text
    return el


def _link(parent, rel: str, href: str, type_: str, title: str | None = None):
    return _sub(parent, _a("link"), rel=rel, href=href, type=type_, title=title)


def _feed(feed_id: str, title: str, self_href: str, kind: str):
    feed = ET.Element(_a("feed"))
    _sub(feed, _a("id"), feed_id)
    _sub(feed, _a("title"), title)
    _sub(feed, _a("updated"), _iso(None))
    author = _sub(feed, _a("author"))
    _sub(author, _a("name"), "Bookie")
    _link(feed, "self", self_href, kind)
    _link(feed, "start", "/opds", NAV_TYPE)
    _link(feed, "search", "/opds/search.xml", OPENSEARCH_TYPE, "Search")
    return feed


def _xml_response(root, mimetype: str) -> Response:
    body = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    return Response(body, mimetype=mimetype)


def _book_entry(feed, book: Book):
    entry = _sub(feed, _a("entry"))
    _sub(entry, _a("id"), f"urn:bookie:book:{book.id}")
    _sub(entry, _a("title"), book.title or Path(book.filename).stem)
    _sub(entry, _a("updated"), _iso(book.date_modified or book.date_added))
    if book.author:
        author = _sub(entry, _a("author"))
        _sub(author, _a("name"), book.author)
    if book.language:
        _sub(entry, f"{{{DC_NS}}}language", book.language)
    if book.publisher:
        _sub(entry, f"{{{DC_NS}}}publisher", book.publisher)
    if book.published_date:
        _sub(entry, f"{{{DC_NS}}}issued", book.published_date)
    for ident in (book.isbn13, book.isbn):
        if ident:
            _sub(entry, f"{{{DC_NS}}}identifier", f"urn:isbn:{ident}")
    if book.series:
        order = ""
        if book.series_order is not None:
            order = f" #{book.series_order:g}"
        _sub(entry, _a("summary"), f"{book.series}{order}")
    if book.cover_filename:
        _link(entry, "http://opds-spec.org/image", f"/opds/books/{book.id}/cover", "image/jpeg")
        _link(entry, "http://opds-spec.org/image/thumbnail",
              f"/opds/books/{book.id}/cover?thumb=true", "image/jpeg")
    fmt = (book.file_format or "").lower()
    _link(entry, "http://opds-spec.org/acquisition", f"/opds/books/{book.id}/download",
          MIME_TYPES.get(fmt, "application/octet-stream"), fmt.upper() or None)


def register_opds_routes(app, book_path):
    """Register the /opds routes. *book_path* maps a Book to its file on disk."""

    def opds_enabled(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if Settings.get("opds_enabled", "false") != "true":
                abort(404)
            return f(*args, **kwargs)
        return decorated

    @app.route("/opds", methods=["GET"])
    @opds_enabled
    @basic_auth_required
    def opds_root():
        feed = _feed("urn:bookie:root", "Bookie", "/opds", NAV_TYPE)
        for entry_id, title, href, summary in (
            ("all", "All books", "/opds/books", "Every book, sorted by title"),
            ("recent", "Recently added", "/opds/books?sort=recent", "Newest books first"),
        ):
            entry = _sub(feed, _a("entry"))
            _sub(entry, _a("id"), f"urn:bookie:{entry_id}")
            _sub(entry, _a("title"), title)
            _sub(entry, _a("updated"), _iso(None))
            _sub(entry, _a("content"), summary, type="text")
            _link(entry, "subsection", href, ACQ_TYPE)
        return _xml_response(feed, NAV_TYPE)

    @app.route("/opds/search.xml", methods=["GET"])
    @opds_enabled
    @basic_auth_required
    def opds_search_description():
        osd = ET.Element(f"{{{OPENSEARCH_NS}}}OpenSearchDescription")
        _sub(osd, f"{{{OPENSEARCH_NS}}}ShortName", "Bookie")
        _sub(osd, f"{{{OPENSEARCH_NS}}}Description", "Search your Bookie library")
        _sub(osd, f"{{{OPENSEARCH_NS}}}InputEncoding", "UTF-8")
        _sub(osd, f"{{{OPENSEARCH_NS}}}Url", type=ACQ_TYPE, template="/opds/books?q={searchTerms}")
        return _xml_response(osd, OPENSEARCH_TYPE)

    @app.route("/opds/books", methods=["GET"])
    @opds_enabled
    @basic_auth_required
    def opds_books():
        q = request.args.get("q", "").strip()
        sort = request.args.get("sort", "")
        page = max(1, request.args.get("page", 1, type=int))

        query = Book.query
        if q:
            escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            like = f"%{escaped}%"
            query = query.filter(db.or_(
                Book.title.ilike(like, escape="\\"),
                Book.author.ilike(like, escape="\\"),
                Book.series.ilike(like, escape="\\"),
            ))
        if sort == "recent":
            query = query.order_by(Book.date_added.desc(), Book.id.desc())
            title = "Recently added"
        else:
            sort = ""
            query = query.order_by(Book.title.asc(), Book.id.asc())
            title = f"Search: {q}" if q else "All books"

        total = query.count()
        pages = max(1, math.ceil(total / PER_PAGE))
        books = query.offset((page - 1) * PER_PAGE).limit(PER_PAGE).all()

        def href(p: int) -> str:
            params = [f"page={p}"]
            if q:
                params.append(f"q={quote(q)}")
            if sort:
                params.append(f"sort={sort}")
            return "/opds/books?" + "&".join(params)

        feed = _feed(f"urn:bookie:books:{sort or 'title'}:{q}", title, href(page), ACQ_TYPE)
        _sub(feed, f"{{{OPENSEARCH_NS}}}totalResults", str(total))
        _sub(feed, f"{{{OPENSEARCH_NS}}}itemsPerPage", str(PER_PAGE))
        if page > 1:
            _link(feed, "first", href(1), ACQ_TYPE)
            _link(feed, "previous", href(page - 1), ACQ_TYPE)
        if page < pages:
            _link(feed, "next", href(page + 1), ACQ_TYPE)
            _link(feed, "last", href(pages), ACQ_TYPE)
        for book in books:
            _book_entry(feed, book)
        return _xml_response(feed, ACQ_TYPE)

    @app.route("/opds/books/<int:book_id>/download", methods=["GET"])
    @opds_enabled
    @basic_auth_required
    def opds_download(book_id):
        book = Book.query.get_or_404(book_id)
        path = book_path(book)
        if not path.exists():
            abort(404)
        fmt = (book.file_format or "").lower()
        return send_file(str(path), as_attachment=True, download_name=path.name,
                         mimetype=MIME_TYPES.get(fmt, "application/octet-stream"))

    @app.route("/opds/books/<int:book_id>/cover", methods=["GET"])
    @opds_enabled
    @basic_auth_required
    def opds_cover(book_id):
        thumb = request.args.get("thumb", "false").lower() == "true"
        path = cover_mgr.get_cover_path(book_id, thumb=thumb)
        if not path:
            abort(404)
        return send_file(str(path), mimetype="image/jpeg")
