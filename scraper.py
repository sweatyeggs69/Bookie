"""Metadata scraping from Open Library, Apple Books, and GoodReads."""
import re
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


# ---------------------------------------------------------------------------
# Open Library
# ---------------------------------------------------------------------------

def search_open_library(query: str, max_results: int = 10) -> list[dict]:
    """Search Open Library."""
    url = "https://openlibrary.org/search.json"
    params = {
        "q": query,
        "limit": max_results,
        "fields": "key,title,author_name,isbn,publisher,first_publish_year,language,number_of_pages_median,subject,cover_i,ratings_average",
    }
    try:
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
        return [_parse_ol_doc(doc) for doc in data.get("docs", [])]
    except Exception as exc:
        logger.warning("Open Library search failed: %s", exc)
        return []


def fetch_open_library_by_isbn(isbn: str) -> dict | None:
    results = search_open_library(f"isbn:{isbn}", max_results=1)
    return results[0] if results else None


def _parse_ol_doc(doc: dict) -> dict:
    cover_id = doc.get("cover_i")
    cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg" if cover_id else None
    isbns = doc.get("isbn", [])
    isbn10 = next((i for i in isbns if len(i) == 10), None)
    isbn13 = next((i for i in isbns if len(i) == 13), None)
    return {
        "source": "open_library",
        "title": doc.get("title"),
        "author": ", ".join(doc.get("author_name", [])),
        "publisher": ", ".join(doc.get("publisher", [])[:2]),
        "published_date": str(doc.get("first_publish_year", "")),
        "page_count": doc.get("number_of_pages_median"),
        "categories": ", ".join((doc.get("subject") or [])[:5]),
        "language": ", ".join(doc.get("language", [])),
        "isbn": isbn10,
        "isbn13": isbn13,
        "rating": doc.get("ratings_average"),
        "cover_url": cover_url,
    }


# ---------------------------------------------------------------------------
# Apple Books  (great high-res covers, no auth required)
# ---------------------------------------------------------------------------

def search_itunes(query: str, max_results: int = 10) -> list[dict]:
    """Search Apple Books — reliable source of high-res covers."""
    url = "https://itunes.apple.com/search"
    params = {"term": query, "media": "ebook", "limit": max_results}
    try:
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        results = []
        for item in data.get("results", []):
            raw_cover = item.get("artworkUrl100", "")
            # Upgrade thumbnail to high-res
            cover_url = raw_cover.replace("100x100bb", "1500x1500bb") if raw_cover else None
            results.append({
                "source": "itunes",
                "title": item.get("trackName"),
                "author": item.get("artistName"),
                "publisher": item.get("sellerName"),
                "published_date": (item.get("releaseDate") or "")[:4],
                "page_count": None,
                "categories": ", ".join(item.get("genres", [])),
                "language": None,
                "isbn": None,
                "isbn13": None,
                "rating": None,
                "cover_url": cover_url,
            })
        return results
    except Exception as exc:
        logger.warning("Apple Books search failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# GoodReads (scrape)
# ---------------------------------------------------------------------------

def search_goodreads(query: str, max_results: int = 10) -> list[dict]:
    """Search GoodReads (web scrape)."""
    url = f"https://www.goodreads.com/search?q={requests.utils.quote(query)}&search_type=books"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "lxml")
        results = []
        for row in soup.select("tr[itemtype='http://schema.org/Book']")[:max_results]:
            item = _parse_gr_row(row)
            if item:
                results.append(item)
        return results
    except Exception as exc:
        logger.warning("GoodReads search failed: %s", exc)
        return []


def fetch_goodreads_book(book_id: str) -> dict | None:
    url = f"https://www.goodreads.com/book/show/{book_id}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        r.raise_for_status()
        return _parse_gr_book_page(r.text, book_id)
    except Exception as exc:
        logger.warning("GoodReads fetch failed: %s", exc)
        return None


def _parse_gr_row(row) -> dict | None:
    try:
        title_el = row.select_one("a.bookTitle span")
        author_el = row.select_one("a.authorName span")
        cover_el = row.select_one("img")
        link_el = row.select_one("a.bookTitle")
        gr_id = None
        if link_el and link_el.get("href"):
            m = re.search(r"/show/(\d+)", link_el["href"])
            gr_id = m.group(1) if m else None
        cover_url = None
        if cover_el:
            src = cover_el.get("src", "")
            # Strip size constraints to get largest available
            cover_url = re.sub(r"\._\w+_\.jpg", ".jpg", src)
            cover_url = re.sub(r"SX\d+|SY\d+|CR\d+,\d+,\d+,\d+", "", cover_url)
        return {
            "source": "goodreads",
            "goodreads_id": gr_id,
            "title": title_el.text.strip() if title_el else None,
            "author": author_el.text.strip() if author_el else None,
            "cover_url": cover_url,
            "publisher": None, "published_date": None,
            "page_count": None, "categories": None, "language": None,
            "isbn": None, "isbn13": None, "rating": None,
        }
    except Exception:
        return None


def _parse_gr_book_page(html: str, book_id: str) -> dict:
    soup = BeautifulSoup(html, "lxml")

    def txt(sel):
        el = soup.select_one(sel)
        return el.get_text(strip=True) if el else None

    title = txt("h1[data-testid='bookTitle']") or txt("h1.Text__title1")
    author = txt("span.ContributorLink__name")
    cover_el = soup.select_one("img.ResponsiveImage")
    cover_url = cover_el["src"] if cover_el and cover_el.get("src") else None
    rating_el = soup.select_one("div.RatingStatistics__rating")
    rating = None
    if rating_el:
        try:
            rating = float(rating_el.text.strip())
        except ValueError:
            pass
    pages_el = soup.select_one("p[data-testid='pagesFormat']")
    page_count = None
    if pages_el:
        m = re.search(r"(\d+)\s+pages", pages_el.text)
        page_count = int(m.group(1)) if m else None
    genre_els = soup.select("span.BookPageMetadataSection__genreButton a")
    categories = ", ".join(el.text.strip() for el in genre_els[:5]) if genre_els else None
    isbn_el = soup.select_one("div[itemprop='isbn']")
    isbn13_val = isbn_el.text.strip() if isbn_el else None

    return {
        "source": "goodreads",
        "goodreads_id": book_id,
        "title": title,
        "author": author,
        "cover_url": cover_url,
        "publisher": None, "published_date": None,
        "page_count": page_count,
        "categories": categories,
        "language": None,
        "isbn": None,
        "isbn13": isbn13_val,
        "rating": rating,
    }



# ---------------------------------------------------------------------------
# Cover search by ISBN (dedicated cover lookup)
# ---------------------------------------------------------------------------

def fetch_cover_urls_for_isbn(isbn: str) -> list[str]:
    """Return a prioritized list of cover image URLs for a given ISBN."""
    clean = re.sub(r"[^0-9X]", "", isbn.upper())
    if len(clean) in (10, 13):
        return [f"https://covers.openlibrary.org/b/isbn/{clean}-L.jpg"]
    return []


# ---------------------------------------------------------------------------
# Unified parallel search
# ---------------------------------------------------------------------------

SOURCE_FNS = {
    "open_library":  search_open_library,
    "itunes":        search_itunes,
    "goodreads":     search_goodreads,
}

DEFAULT_SOURCE_ORDER = ["open_library", "itunes", "goodreads"]

SOURCE_LABELS = {
    "open_library":  "Open Library",
    "itunes":        "Apple Books",
    "goodreads":     "GoodReads",
}


def search_all_sources(
    query: str,
    sources: list[str] | None = None,
    api_keys: dict | None = None,
) -> list[dict]:
    """Search all requested sources in parallel."""
    if sources is None:
        sources = DEFAULT_SOURCE_ORDER
    if api_keys is None:
        api_keys = {}

    active_sources = [s for s in sources if s in SOURCE_FNS]
    results_by_source: dict[str, list[dict]] = {}

    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(SOURCE_FNS[s], query): s for s in active_sources}
        for fut in as_completed(futures):
            src = futures[fut]
            try:
                results_by_source[src] = fut.result()
            except Exception as exc:
                logger.warning("Source %s failed: %s", src, exc)
                results_by_source[src] = []

    # Return in priority order
    flat: list[dict] = []
    for src in sources:
        flat.extend(results_by_source.get(src, []))
    return flat


_COVER_MAX_BYTES = 10 * 1024 * 1024  # 10 MB — guard against huge/malicious cover URLs


def fetch_cover_image(url: str) -> bytes | None:
    """Download a cover image from a URL, refusing responses larger than 10 MB."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=15, stream=True)
        r.raise_for_status()
        chunks: list[bytes] = []
        total = 0
        for chunk in r.iter_content(chunk_size=65536):
            total += len(chunk)
            if total > _COVER_MAX_BYTES:
                logger.warning("Cover download from %s aborted: response exceeded %d bytes", url, _COVER_MAX_BYTES)
                return None
            chunks.append(chunk)
        return b"".join(chunks)
    except Exception as exc:
        logger.warning("Cover download failed from %s: %s", url, exc)
        return None
