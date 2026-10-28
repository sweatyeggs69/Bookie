from datetime import datetime, timedelta, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


CLEANUP_STALE = timedelta(minutes=10)


class Tag(db.Model):
    __tablename__ = "tags"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), nullable=False, unique=True)

    book_tags = db.relationship("BookTag", back_populates="tag", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            # book_tags is a relationship — use len() so callers can control loading
            # strategy (e.g. subqueryload) instead of firing an extra COUNT per tag.
            "book_count": len(self.book_tags),
        }


class BookTag(db.Model):
    __tablename__ = "book_tags"

    id = db.Column(db.Integer, primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey("books.id"), nullable=False)
    tag_id = db.Column(db.Integer, db.ForeignKey("tags.id"), nullable=False)

    book = db.relationship("Book", back_populates="book_tags")
    tag = db.relationship("Tag", back_populates="book_tags")

    __table_args__ = (
        db.UniqueConstraint("book_id", "tag_id"),
        db.Index("ix_book_tags_book_id", "book_id"),
        db.Index("ix_book_tags_tag_id", "tag_id"),
    )


class Book(db.Model):
    __tablename__ = "books"

    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(512), nullable=False, unique=True)
    file_format = db.Column(db.String(16))
    file_size = db.Column(db.Integer)

    # Metadata
    title = db.Column(db.String(512))
    author = db.Column(db.String(512))
    isbn = db.Column(db.String(32))
    isbn13 = db.Column(db.String(32))
    publisher = db.Column(db.String(256))
    published_date = db.Column(db.String(32))
    language = db.Column(db.String(16))
    description = db.Column(db.Text)
    page_count = db.Column(db.Integer)
    categories = db.Column(db.String(512))  # kept for backward compat
    rating = db.Column(db.Float)
    goodreads_id = db.Column(db.String(64))
    series = db.Column(db.String(256))
    series_order = db.Column(db.Float)

    # Cover
    cover_filename = db.Column(db.String(256))

    # Set while an EPUB cleanup runs on the file, so the book can't be edited meanwhile
    cleanup_started = db.Column(db.DateTime)

    # Timestamps
    date_added = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    date_modified = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relations
    book_tags = db.relationship("BookTag", back_populates="book", cascade="all, delete-orphan", lazy="joined")
    fingerprints = db.relationship("BookFingerprint", back_populates="book", cascade="all, delete-orphan")
    # selectin: one extra query per page of books instead of one per book
    reading_progress = db.relationship("ReadingProgress", back_populates="book",
                                       cascade="all, delete-orphan", lazy="selectin")

    __table_args__ = (
        db.Index("ix_books_title", "title"),
        db.Index("ix_books_author", "author"),
        db.Index("ix_books_file_format", "file_format"),
        db.Index("ix_books_date_added", "date_added"),
        db.Index("ix_books_language", "language"),
        db.Index("ix_books_series", "series"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "file_format": self.file_format,
            "file_size": self.file_size,
            "title": self.title,
            "author": self.author,
            "isbn": self.isbn,
            "isbn13": self.isbn13,
            "publisher": self.publisher,
            "published_date": self.published_date,
            "language": self.language,
            "page_count": self.page_count,
            "rating": self.rating,
            "goodreads_id": self.goodreads_id,
            "cover_filename": self.cover_filename,
            "series": self.series,
            "series_order": self.series_order,
            "date_added": self.date_added.isoformat() if self.date_added else None,
            "date_modified": self.date_modified.isoformat() if self.date_modified else None,
            "tags": [bt.tag.name for bt in self.book_tags],
            "progress": self.latest_progress(),
            "cleaning": self.is_cleaning(),
        }

    def is_cleaning(self) -> bool:
        """True while a cleanup is running. A start time older than CLEANUP_STALE
        means the worker died mid-run, so the book is unlocked again."""
        if not self.cleanup_started:
            return False
        started = self.cleanup_started.replace(tzinfo=None)
        return datetime.now(timezone.utc).replace(tzinfo=None) - started < CLEANUP_STALE

    def latest_progress(self):
        """The most recently synced reading position across all copies of this book."""
        if not self.reading_progress:
            return None
        return max(self.reading_progress, key=lambda p: p.timestamp or 0).to_dict()


class BookFingerprint(db.Model):
    """A KOReader document ID (partial MD5 of a file, or MD5 of its filename)
    known to belong to a book. Recorded when a book is downloaded, so a copy on
    a device still matches after Bookie later changes the file on disk."""
    __tablename__ = "book_fingerprints"

    document = db.Column(db.String(32), primary_key=True)
    book_id = db.Column(db.Integer, db.ForeignKey("books.id"), nullable=False)

    book = db.relationship("Book", back_populates="fingerprints")

    __table_args__ = (db.Index("ix_book_fingerprints_book_id", "book_id"),)


class ReadingProgress(db.Model):
    """Reading position pushed by KOReader's progress sync, one row per document."""
    __tablename__ = "reading_progress"

    id = db.Column(db.Integer, primary_key=True)
    document = db.Column(db.String(32), nullable=False, unique=True)
    book_id = db.Column(db.Integer, db.ForeignKey("books.id"))
    progress = db.Column(db.Text)  # KOReader position: an XPointer or a page number
    percentage = db.Column(db.Float)
    device = db.Column(db.String(128))
    device_id = db.Column(db.String(128))
    timestamp = db.Column(db.Integer)  # Unix seconds, as the protocol reports it

    book = db.relationship("Book", back_populates="reading_progress")

    __table_args__ = (db.Index("ix_reading_progress_book_id", "book_id"),)

    def to_dict(self):
        return {
            "percentage": self.percentage,
            "device": self.device,
            "timestamp": self.timestamp,
        }


class EmailAddress(db.Model):
    __tablename__ = "email_addresses"

    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(128), nullable=False)
    email = db.Column(db.String(256), nullable=False)
    is_default = db.Column(db.Boolean, default=False, nullable=False)
    date_added = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "label": self.label,
            "email": self.email,
            "is_default": self.is_default,
        }


class Settings(db.Model):
    __tablename__ = "settings"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(128), nullable=False, unique=True)
    value = db.Column(db.Text)

    # No in-process cache: gunicorn runs several workers, and a per-worker cache
    # meant a change saved in one worker (a new password, finished setup, a new
    # rename scheme) was invisible to the others for up to 30 seconds.
    @classmethod
    def get(cls, key, default=None):
        row = cls.query.filter_by(key=key).first()
        return row.value if row else default

    @classmethod
    def set(cls, key, value):
        row = cls.query.filter_by(key=key).first()
        if row:
            row.value = value
        else:
            row = cls(key=key, value=value)
            db.session.add(row)
        db.session.commit()
