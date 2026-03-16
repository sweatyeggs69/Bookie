from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Tag(db.Model):
    __tablename__ = "tags"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), nullable=False, unique=True)

    book_tags = db.relationship("BookTag", back_populates="tag", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "book_count": db.session.query(BookTag).filter_by(tag_id=self.id).count(),
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
    google_books_id = db.Column(db.String(64))
    goodreads_id = db.Column(db.String(64))
    series = db.Column(db.String(256))
    series_order = db.Column(db.Float)

    # Cover
    cover_filename = db.Column(db.String(256))

    # Timestamps
    date_added = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    date_modified = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relations
    shelf_books = db.relationship("ShelfBook", back_populates="book", cascade="all, delete-orphan")
    book_tags = db.relationship("BookTag", back_populates="book", cascade="all, delete-orphan", lazy="joined")

    __table_args__ = (
        db.Index("ix_books_title", "title"),
        db.Index("ix_books_author", "author"),
        db.Index("ix_books_file_format", "file_format"),
        db.Index("ix_books_date_added", "date_added"),
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
            "google_books_id": self.google_books_id,
            "goodreads_id": self.goodreads_id,
            "cover_filename": self.cover_filename,
            "series": self.series,
            "series_order": self.series_order,
            "date_added": self.date_added.isoformat() if self.date_added else None,
            "date_modified": self.date_modified.isoformat() if self.date_modified else None,
            "tags": [bt.tag.name for bt in self.book_tags],
        }


class Shelf(db.Model):
    __tablename__ = "shelves"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), nullable=False, unique=True)
    description = db.Column(db.String(512))
    color = db.Column(db.String(16), default="#D0BCFF")
    icon = db.Column(db.String(64), default="shelf")
    date_created = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    is_smart = db.Column(db.Boolean, default=False)
    rules = db.Column(db.Text, default="[]")
    combination = db.Column(db.String(8), default="all")

    shelf_books = db.relationship("ShelfBook", back_populates="shelf", cascade="all, delete-orphan")

    def to_dict(self, book_count=None):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "color": self.color,
            "icon": self.icon,
            "is_smart": self.is_smart,
            "rules": self.rules or "[]",
            "combination": self.combination or "all",
            "book_count": book_count if book_count is not None else len(self.shelf_books),
            "date_created": self.date_created.isoformat() if self.date_created else None,
        }


class ShelfBook(db.Model):
    __tablename__ = "shelf_books"

    id = db.Column(db.Integer, primary_key=True)
    shelf_id = db.Column(db.Integer, db.ForeignKey("shelves.id"), nullable=False)
    book_id = db.Column(db.Integer, db.ForeignKey("books.id"), nullable=False)
    date_added = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    shelf = db.relationship("Shelf", back_populates="shelf_books")
    book = db.relationship("Book", back_populates="shelf_books")

    __table_args__ = (db.UniqueConstraint("shelf_id", "book_id"),)


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
