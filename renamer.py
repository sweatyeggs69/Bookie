"""File renaming on import with configurable naming schemes."""
import logging
import re
import unicodedata
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Built-in naming scheme templates ─────────────────────────────────────────
SCHEMES = {
    "original":         "{original}",
    "title":            "{title}",
    "author_title":     "{author} - {title}",
    "title_author":     "{title} - {author}",
    "author_title_year": "{author} - {title} ({year})",
    "title_year":       "{title} ({year})",
    "series_order":     "{series} {series_index} - {title}",
    "custom":           None,  # user-defined template
}

SCHEME_LABELS = {
    "original":          "Keep original filename",
    "title":             "Title",
    "author_title":      "Author - Title",
    "title_author":      "Title - Author",
    "author_title_year": "Author - Title (Year)",
    "title_year":        "Title (Year)",
    "series_order":      "Series Index - Title",
    "custom":            "Custom template",
}

# Available placeholders for the help text
PLACEHOLDERS = [
    ("{title}",        "Book title"),
    ("{author}",       "Primary author"),
    ("{year}",         "Publication year (4 digits)"),
    ("{publisher}",    "Publisher name"),
    ("{isbn}",         "ISBN-10"),
    ("{isbn13}",       "ISBN-13"),
    ("{language}",     "Language code"),
    ("{series}",       "Series name"),
    ("{series_index}", "Series index/number"),
    ("{original}",     "Original filename without extension"),
    ("{ext}",          "File extension"),
]


def _safe(text: str, max_len: int = 80) -> str:
    """Normalize a string for use in a filename."""
    if not text:
        return "Unknown"
    # Normalize unicode
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    # Remove characters not safe for filenames
    text = re.sub(r'[\\/:*?"<>|]', "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len] if len(text) > max_len else text


def apply_scheme(
    template: str,
    original_filename: str,
    metadata: dict,
) -> str:
    """
    Apply a naming-scheme template to produce a new filename (without extension).

    metadata keys: title, author, published_date, publisher, isbn, isbn13,
                   language, series, series_index
    """
    ext = Path(original_filename).suffix.lower()
    original_stem = Path(original_filename).stem

    # Extract year from published_date
    year = ""
    pub_date = metadata.get("published_date") or ""
    m = re.search(r"\b(\d{4})\b", pub_date)
    if m:
        year = m.group(1)

    ctx = {
        "title":        _safe(metadata.get("title") or original_stem),
        "author":       _safe(metadata.get("author") or "Unknown Author"),
        "year":         year or "Unknown",
        "publisher":    _safe(metadata.get("publisher") or ""),
        "isbn":         metadata.get("isbn") or "",
        "isbn13":       metadata.get("isbn13") or "",
        "language":     (metadata.get("language") or "").lower(),
        "series":       _safe(metadata.get("series") or ""),
        "series_index": str(metadata.get("series_index") or ""),
        "original":     _safe(original_stem),
        "ext":          ext.lstrip("."),
    }

    try:
        name = template.format_map(ctx)
    except (KeyError, ValueError):
        name = original_stem  # fallback to original on bad template

    # Remove trailing spaces/dots/dashes
    name = name.strip(" .-")
    name = re.sub(r"\s+-\s*$", "", name)  # remove trailing " - "
    name = re.sub(r"\(\s*\)", "", name)   # remove empty parens "()"
    name = name.strip()

    # Avoid empty result
    if not name:
        name = original_stem

    return name + ext


def get_scheme_template(scheme_key: str, custom_template: str = "") -> str:
    """Return the template string for a given scheme key."""
    if scheme_key == "custom":
        return custom_template or SCHEMES["author_title"]
    return SCHEMES.get(scheme_key, SCHEMES["author_title"])


def rename_book_file(
    src_path: Path,
    books_dir: Path,
    scheme_key: str,
    metadata: dict,
    custom_template: str = "",
) -> tuple[Path, str]:
    """
    Rename a book file using the configured scheme.

    Returns (new_path, new_filename_relative_to_books_dir).
    """
    if scheme_key == "original":
        return src_path, str(src_path.relative_to(books_dir))

    template = get_scheme_template(scheme_key, custom_template)
    new_name = apply_scheme(template, src_path.name, metadata)
    new_path = books_dir / new_name

    # Avoid collisions
    if new_path.exists() and new_path != src_path:
        stem = Path(new_name).stem
        ext = Path(new_name).suffix
        counter = 1
        while new_path.exists():
            new_name = f"{stem} ({counter}){ext}"
            new_path = books_dir / new_name
            counter += 1

    if src_path != new_path:
        try:
            src_path.rename(new_path)
        except OSError as exc:
            logger.warning("Failed to rename %s → %s: %s", src_path, new_path, exc)
            return src_path, str(src_path.relative_to(books_dir))

    return new_path, str(new_path.relative_to(books_dir))


def organize_into_folders(
    src_path: Path,
    books_dir: Path,
    author: str | None,
    series: str | None,
    folder_mode: str = "flat",
) -> tuple[Path, str]:
    """
    Move a book file into an Author/ or Author/Series/ subfolder.

    folder_mode: "flat" | "by_author" | "by_author_series"
    Returns (new_path, relative_path).
    """
    if folder_mode == "flat" or not author:
        return src_path, str(src_path.relative_to(books_dir))

    author_safe = _safe(author or "Unknown Author")

    if folder_mode == "by_author_series" and series:
        target_dir = books_dir / author_safe / _safe(series)
    else:
        target_dir = books_dir / author_safe

    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / src_path.name

    if target_path.exists() and target_path != src_path:
        stem = src_path.stem
        ext = src_path.suffix
        counter = 1
        while target_path.exists():
            target_path = target_dir / f"{stem} ({counter}){ext}"
            counter += 1

    if src_path != target_path:
        try:
            src_path.rename(target_path)
        except OSError as exc:
            logger.warning("Failed to move %s → %s: %s", src_path, target_path, exc)
            return src_path, str(src_path.relative_to(books_dir))

    return target_path, str(target_path.relative_to(books_dir))
