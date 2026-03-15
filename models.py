from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Book(db.Model):
    __tablename__ = "books"

    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(512), nullable=False)
    file_format = db.Column(db.String(16))  # epub, pdf, mobi, etc.
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
    categories = db.Column(db.String(512))  # comma-separated
    rating = db.Column(db.Float)
    google_books_id = db.Column(db.String(64))
    goodreads_id = db.Column(db.String(64))

    # Cover
    cover_filename = db.Column(db.String(256))

    # Timestamps
    date_added = db.Column(db.DateTime, default=datetime.utcnow)
    date_modified = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    shelf_books = db.relationship("ShelfBook", back_populates="book", cascade="all, delete-orphan")

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
            "description": self.description,
            "page_count": self.page_count,
            "categories": self.categories,
            "rating": self.rating,
            "google_books_id": self.google_books_id,
            "goodreads_id": self.goodreads_id,
            "cover_filename": self.cover_filename,
            "date_added": self.date_added.isoformat() if self.date_added else None,
            "date_modified": self.date_modified.isoformat() if self.date_modified else None,
            "shelves": [sb.shelf.name for sb in self.shelf_books],
        }


class Shelf(db.Model):
    __tablename__ = "shelves"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), nullable=False, unique=True)
    description = db.Column(db.String(512))
    color = db.Column(db.String(16), default="#D0BCFF")
    icon = db.Column(db.String(64), default="shelf")
    date_created = db.Column(db.DateTime, default=datetime.utcnow)

    # Smart shelf fields
    is_smart = db.Column(db.Boolean, default=False)
    rules = db.Column(db.Text, default="[]")          # JSON array of rule objects
    combination = db.Column(db.String(8), default="all")  # "all" (AND) or "any" (OR)

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
    date_added = db.Column(db.DateTime, default=datetime.utcnow)

    shelf = db.relationship("Shelf", back_populates="shelf_books")
    book = db.relationship("Book", back_populates="shelf_books")

    __table_args__ = (db.UniqueConstraint("shelf_id", "book_id"),)


class EmailAddress(db.Model):
    __tablename__ = "email_addresses"

    id = db.Column(db.Integer, primary_key=True)
    label = db.Column(db.String(128), nullable=False)   # e.g. "Kindle", "Work Kindle"
    email = db.Column(db.String(256), nullable=False)
    is_default = db.Column(db.Boolean, default=False, nullable=False)
    date_added = db.Column(db.DateTime, default=datetime.utcnow)

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
