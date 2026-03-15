"""Metadata scraping from Google Books, Open Library, iTunes, GoodReads, and LibraryThing."""
import re
import time
import logging
import xml.etree.ElementTree as ET
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
# Google Books
# ---------------------------------------------------------------------------

def search_google_books(query: str, max_results: int = 10) -> list[dict]:
    """Search Google Books API with rate-limit retry."""
    url = "https://www.googleapis.com/books/v1/volumes"
    params = {"q": query, "maxResults": max_results, "printType": "books"}
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, timeout=10)
            if r.status_code == 429:
                wait = 2 ** attempt
                logger.warning("Google Books rate limited, retrying in %ds", wait)
                time.sleep(wait)
                continue
            r.raise_for_status()
            data = r.json()
            return [_parse_google_volume(item) for item in data.get("items", [])]
        except Exception as exc:
            logger.warning("Google Books search failed: %s", exc)
            return []
    return []


def fetch_google_books_by_isbn(isbn: str) -> dict | None:
    results = search_google_books(f"isbn:{isbn}", max_results=1)
    return results[0] if results else None


def _parse_google_volume(item: dict) -> dict:
    info = item.get("volumeInfo", {})
    isbns = {i["type"]: i["identifier"] for i in info.get("industryIdentifiers", [])}
    image = info.get("imageLinks", {})
    # Get best available cover; replace zoom param for higher quality
    cover_url = (
        image.get("extraLarge") or image.get("large")
        or image.get("medium") or image.get("thumbnail")
    )
    if cover_url:
        cover_url = cover_url.replace("http://", "https://")
        # Request highest-res image (zoom=0 = full-size, fife override for width)
        cover_url = re.sub(r"zoom=\d+", "zoom=0", cover_url)
        cover_url = cover_url.replace("&edge=curl", "")
        # Add fife param for up to 1600px wide if not already present
        if "fife=" not in cover_url:
            cover_url += "&fife=w1600"
    return {
        "source": "google_books",
        "google_books_id": item.get("id"),
        "title": info.get("title"),
        "author": ", ".join(info.get("authors", [])),
        "publisher": info.get("publisher"),
        "published_date": info.get("publishedDate"),
        "description": info.get("description"),
        "page_count": info.get("pageCount"),
        "categories": ", ".join(info.get("categories", [])),
        "language": info.get("language"),
        "isbn": isbns.get("ISBN_10"),
        "isbn13": isbns.get("ISBN_13"),
        "rating": info.get("averageRating"),
        "cover_url": cover_url,
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
        "description": None,
        "page_count": doc.get("number_of_pages_median"),
        "categories": ", ".join((doc.get("subject") or [])[:5]),
        "language": ", ".join(doc.get("language", [])),
        "isbn": isbn10,
        "isbn13": isbn13,
        "rating": doc.get("ratings_average"),
        "cover_url": cover_url,
    }


# ---------------------------------------------------------------------------
# iTunes / Apple Books  (great high-res covers, no auth required)
# ---------------------------------------------------------------------------

def search_itunes(query: str, max_results: int = 10) -> list[dict]:
    """Search Apple Books (iTunes) — reliable source of high-res covers."""
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
                "published_date": (item.get("releaseDate") or "")[:10],
                "description": item.get("description"),
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
        logger.warning("iTunes search failed: %s", exc)
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
            cover_url = re.sub(r"SX\d+|SY\d+|CR\d+,\d+,\d+,\d+|_", "", cover_url)
        return {
            "source": "goodreads",
            "goodreads_id": gr_id,
            "title": title_el.text.strip() if title_el else None,
            "author": author_el.text.strip() if author_el else None,
            "cover_url": cover_url,
            "publisher": None, "published_date": None, "description": None,
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
    description_el = soup.select_one("div[data-testid='description'] span.Formatted")
    description = description_el.get_text(strip=True) if description_el else None
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
        "description": description,
        "page_count": page_count,
        "categories": categories,
        "language": None,
        "isbn": None,
        "isbn13": isbn13_val,
        "rating": rating,
    }


# ---------------------------------------------------------------------------
# LibraryThing  (requires API key for full metadata; covers are key-based)
# ---------------------------------------------------------------------------

def search_librarything(query: str, api_key: str = "", max_results: int = 8) -> list[dict]:
    """
    Search LibraryThing via thingTitle → getwork chain.
    Requires a LibraryThing developer API key.
    """
    if not api_key:
        return []

    # Step 1: thingTitle → list of ISBNs for the most likely work
    title_url = f"https://www.librarything.com/api/{api_key}/thingTitle/{requests.utils.quote(query)}"
    try:
        r = requests.get(title_url, headers=HEADERS, timeout=12)
        r.raise_for_status()
        root = ET.fromstring(r.text)
        isbns = [el.text.strip() for el in root.findall("isbn") if el.text][:max_results]
    except Exception as exc:
        logger.warning("LibraryThing thingTitle failed: %s", exc)
        return []

    if not isbns:
        return []

    # Step 2: getwork for each unique ISBN (rate-limited: 1 req/s)
    results = []
    seen_ids = set()
    for isbn in isbns:
        work = _fetch_lt_work_by_isbn(isbn, api_key)
        if work:
            wid = work.get("_lt_work_id")
            if wid and wid in seen_ids:
                continue
            if wid:
                seen_ids.add(wid)
            results.append(work)
        time.sleep(1.1)  # LT rate limit: 1 req/s
    return results


def _fetch_lt_work_by_isbn(isbn: str, api_key: str) -> dict | None:
    url = "https://www.librarything.com/services/rest/1.1/"
    params = {
        "method": "librarything.ck.getwork",
        "id": isbn,
        "apikey": api_key,
        "ct": "json",
    }
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=12)
        r.raise_for_status()
        data = r.json()
        if data.get("stat") != "ok":
            return None
        res = data.get("result", {})
        work_id = str(res.get("id", ""))

        # Title
        title_obj = res.get("title")
        title = title_obj.get("displayForm") if isinstance(title_obj, dict) else title_obj

        # Author
        author_obj = res.get("author")
        author = author_obj.get("displayForm") if isinstance(author_obj, dict) else author_obj

        # Rating
        rating_obj = res.get("rating")
        rating = None
        if isinstance(rating_obj, dict):
            try:
                rating = float(rating_obj.get("value", 0)) or None
            except (ValueError, TypeError):
                pass

        # Description from common knowledge
        desc = None
        ck = res.get("commonknowledge", {})
        if isinstance(ck, dict):
            desc_field = ck.get("description", {})
            if isinstance(desc_field, dict):
                fields = desc_field.get("field", [])
                if fields and isinstance(fields, list):
                    desc = fields[0].get("text")

        # ISBNs
        all_isbns = res.get("isbn", []) or []
        if isinstance(all_isbns, str):
            all_isbns = [all_isbns]
        isbn10 = next((i for i in all_isbns if len(i) == 10), isbn if len(isbn) == 10 else None)
        isbn13 = next((i for i in all_isbns if len(i) == 13), isbn if len(isbn) == 13 else None)

        # Cover via LT cover service (uses dev key + isbn)
        cover_isbn = isbn13 or isbn10 or isbn
        cover_url = f"https://covers.librarything.com/devkey/{api_key}/large/isbn/{cover_isbn}"

        return {
            "source": "librarything",
            "_lt_work_id": work_id,
            "title": title,
            "author": author,
            "publisher": None,
            "published_date": None,
            "description": desc,
            "page_count": None,
            "categories": None,
            "language": None,
            "isbn": isbn10,
            "isbn13": isbn13,
            "rating": rating,
            "cover_url": cover_url,
        }
    except Exception as exc:
        logger.warning("LibraryThing getwork failed for isbn %s: %s", isbn, exc)
        return None


# ---------------------------------------------------------------------------
# Cover search by ISBN (dedicated cover lookup)
# ---------------------------------------------------------------------------

def fetch_cover_urls_for_isbn(isbn: str) -> list[str]:
    """Return a prioritized list of cover image URLs for a given ISBN."""
    urls = []
    clean = re.sub(r"[^0-9X]", "", isbn.upper())
    if len(clean) == 13:
        urls.append(f"https://covers.openlibrary.org/b/isbn/{clean}-L.jpg")
        # Google Books by ISBN
        gb = fetch_google_books_by_isbn(clean)
        if gb and gb.get("cover_url"):
            urls.append(gb["cover_url"])
    elif len(clean) == 10:
        urls.append(f"https://covers.openlibrary.org/b/isbn/{clean}-L.jpg")
        gb = fetch_google_books_by_isbn(clean)
        if gb and gb.get("cover_url"):
            urls.append(gb["cover_url"])
    return urls


# ---------------------------------------------------------------------------
# Unified parallel search
# ---------------------------------------------------------------------------

SOURCE_FNS = {
    "google_books":  search_google_books,
    "open_library":  search_open_library,
    "itunes":        search_itunes,
    "goodreads":     search_goodreads,
    # librarything is handled separately (needs api_key, rate-limited)
}

DEFAULT_SOURCE_ORDER = ["google_books", "open_library", "itunes", "goodreads", "librarything"]

SOURCE_LABELS = {
    "google_books":  "Google Books",
    "open_library":  "Open Library",
    "itunes":        "Apple Books",
    "goodreads":     "GoodReads",
    "librarything":  "LibraryThing",
}


def search_all_sources(
    query: str,
    sources: list[str] | None = None,
    api_keys: dict | None = None,
) -> list[dict]:
    """
    Search all requested sources; parallel for fast sources, sequential for rate-limited.
    api_keys: dict with keys like {"librarything": "mykey"}
    """
    if sources is None:
        sources = DEFAULT_SOURCE_ORDER
    if api_keys is None:
        api_keys = {}

    fast_sources = [s for s in sources if s in SOURCE_FNS]
    results_by_source: dict[str, list[dict]] = {}

    # Parallel search for fast sources
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(SOURCE_FNS[s], query): s for s in fast_sources}
        for fut in as_completed(futures):
            src = futures[fut]
            try:
                results_by_source[src] = fut.result()
            except Exception as exc:
                logger.warning("Source %s failed: %s", src, exc)
                results_by_source[src] = []

    # LibraryThing (rate-limited, sequential)
    if "librarything" in sources:
        lt_key = api_keys.get("librarything", "")
        results_by_source["librarything"] = search_librarything(query, lt_key)

    # Return in priority order
    flat: list[dict] = []
    for src in sources:
        flat.extend(results_by_source.get(src, []))
    return flat


def fetch_cover_image(url: str) -> bytes | None:
    """Download a cover image from a URL."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=15, stream=True)
        r.raise_for_status()
        return r.content
    except Exception as exc:
        logger.warning("Cover download failed from %s: %s", url, exc)
        return None
