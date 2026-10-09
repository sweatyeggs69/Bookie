"""Book cover extraction and management."""
import io
import os
import logging
import zipfile
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image

logger = logging.getLogger(__name__)

COVERS_DIR = Path(os.environ.get("DATA_DIR", "data")) / "covers"
THUMB_SIZE = (300, 450)
COVER_SIZE = (667, 1000)
# Refuse to decompress oversized archive members (guards against zip bombs)
MAX_COVER_ENTRY_BYTES = 20 * 1024 * 1024
MAX_EPUB_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024


def _read_entry(zf: zipfile.ZipFile, name: str) -> bytes | None:
    if zf.getinfo(name).file_size > MAX_COVER_ENTRY_BYTES:
        logger.warning("Skipping oversized cover entry %s", name)
        return None
    return zf.read(name)


def ensure_dirs():
    COVERS_DIR.mkdir(parents=True, exist_ok=True)


def extract_cover_from_epub(filepath: str) -> bytes | None:
    """Extract cover image from EPUB file."""
    try:
        with zipfile.ZipFile(filepath, "r") as zf:
            # Try OPF-defined cover
            opf_path = _find_opf(zf)
            if opf_path:
                cover_item = _find_cover_in_opf(zf, opf_path)
                if cover_item:
                    return _read_entry(zf, cover_item)

            # Fallback: look for common cover filenames
            for name in zf.namelist():
                lower = name.lower()
                if any(kw in lower for kw in ("cover", "front")) and lower.endswith(
                    (".jpg", ".jpeg", ".png", ".gif", ".webp")
                ):
                    return _read_entry(zf, name)
    except Exception as exc:
        logger.warning("EPUB cover extraction failed for %s: %s", filepath, exc)
    return None


def _find_opf(zf: zipfile.ZipFile) -> str | None:
    """Find the OPF file path from container.xml."""
    try:
        container = zf.read("META-INF/container.xml").decode("utf-8", errors="replace")
        m = re.search(r'full-path="([^"]+\.opf)"', container)
        return m.group(1) if m else None
    except Exception:
        return None


def _find_cover_in_opf(zf: zipfile.ZipFile, opf_path: str) -> str | None:
    """Find cover image href from OPF manifest using XML parsing (no regex)."""
    try:
        root = ET.fromstring(zf.read(opf_path))
    except Exception:
        return None

    # Determine the OPF namespace prefix (e.g. "{http://www.idpf.org/2007/opf}")
    tag = root.tag
    ns_prefix = tag[: tag.index("}") + 1] if tag.startswith("{") else ""

    manifest = root.find(f"{ns_prefix}manifest")
    metadata = root.find(f"{ns_prefix}metadata")
    if manifest is None:
        return None

    # Build id -> href map from all manifest <item> elements
    id_to_href: dict[str, str] = {
        item.get("id", ""): item.get("href", "")
        for item in manifest
        if item.get("id") and item.get("href")
    }

    def _resolve(href: str) -> str | None:
        base = str(Path(opf_path).parent)
        full = str(Path(base) / href) if base != "." else href
        return full if full in zf.namelist() else None

    # EPUB3: <item properties="cover-image" .../>
    for item in manifest:
        if "cover-image" in item.get("properties", ""):
            resolved = _resolve(item.get("href", ""))
            if resolved:
                return resolved

    # EPUB2: <meta name="cover" content="item-id"/>
    if metadata is not None:
        for meta in metadata:
            local = meta.tag.split("}")[-1] if "}" in meta.tag else meta.tag
            if local == "meta" and meta.get("name", "").lower() == "cover":
                item_id = meta.get("content", "")
                href = id_to_href.get(item_id, "")
                if href:
                    resolved = _resolve(href)
                    if resolved:
                        return resolved

    # Fallback: any manifest item whose id contains "cover"
    for item_id, href in id_to_href.items():
        if "cover" in item_id.lower():
            resolved = _resolve(href)
            if resolved:
                return resolved

    return None


def extract_cover_from_pdf(filepath: str) -> bytes | None:
    """Extract first page as cover image from PDF."""
    try:
        import pypdf

        reader = pypdf.PdfReader(filepath)
        if reader.pages:
            page = reader.pages[0]
            for img in page.images:
                return img.data
    except Exception as exc:
        logger.warning("PDF cover extraction failed for %s: %s", filepath, exc)
    return None


def save_cover(book_id: int, image_data: bytes, fmt: str = "JPEG") -> str | None:
    """Process and save a cover image, returning the filename."""
    ensure_dirs()
    try:
        img = Image.open(io.BytesIO(image_data))
        img = img.convert("RGB")

        # Save full size
        full_path = COVERS_DIR / f"{book_id}.jpg"
        img_resized = img.copy()
        img_resized.thumbnail(COVER_SIZE, Image.LANCZOS)
        img_resized.save(str(full_path), "JPEG", quality=90)

        # Save thumbnail
        thumb_path = COVERS_DIR / f"{book_id}_thumb.jpg"
        img_thumb = img.copy()
        img_thumb.thumbnail(THUMB_SIZE, Image.LANCZOS)
        img_thumb.save(str(thumb_path), "JPEG", quality=85)

        return f"{book_id}.jpg"
    except Exception as exc:
        logger.warning("Cover save failed for book %s: %s", book_id, exc)
        return None


def embed_cover_in_epub(epub_path: str, cover_data: bytes) -> bool:
    """Replace/embed cover image in EPUB file, updating OPF manifest if needed."""
    import shutil
    import tempfile
    import xml.etree.ElementTree as ET

    try:
        img = Image.open(io.BytesIO(cover_data)).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=90)
        cover_jpeg = buf.getvalue()

        with zipfile.ZipFile(epub_path, "r") as zin:
            if sum(i.file_size for i in zin.infolist()) > MAX_EPUB_UNCOMPRESSED_BYTES:
                logger.warning("EPUB too large to rewrite: %s", epub_path)
                return False
            names = zin.namelist()
            infos = {n: zin.getinfo(n) for n in names}
            contents = {n: zin.read(n) for n in names}

        # Find OPF
        opf_path = None
        try:
            container = contents.get("META-INF/container.xml", b"").decode("utf-8", errors="replace")
            m = re.search(r'full-path="([^"]+\.opf)"', container)
            if m:
                opf_path = m.group(1)
        except Exception:
            pass

        # Try to find existing cover item via OPF
        cover_item = None
        if opf_path and opf_path in contents:
            opf_text = contents[opf_path].decode("utf-8", errors="replace")
            # Try OPF2 <meta name="cover" content="..."/> (attribute order independent)
            meta_m = re.search(
                r'<meta\b[^>]*\bname=["\']cover["\'][^>]*\bcontent=["\']([^"\']+)["\']'
                r'|<meta\b[^>]*\bcontent=["\']([^"\']+)["\'][^>]*\bname=["\']cover["\']',
                opf_text, re.IGNORECASE,
            )
            if meta_m:
                item_id = meta_m.group(1) or meta_m.group(2)
                item_m = re.search(
                    r'<item\b[^>]*\bid=["\']' + re.escape(item_id) + r'["\'][^>]*\bhref=["\']([^"\']+)["\']'
                    r'|<item\b[^>]*\bhref=["\']([^"\']+)["\'][^>]*\bid=["\']' + re.escape(item_id) + r'["\']',
                    opf_text,
                )
                if item_m:
                    href = item_m.group(1) or item_m.group(2)
                    base = str(Path(opf_path).parent)
                    cover_item = (str(Path(base) / href) if base != "." else href)
            if not cover_item:
                # Try EPUB3 properties="cover-image" (attribute order independent)
                prop_m = re.search(
                    r'<item\b[^>]*\bproperties=["\']cover-image["\'][^>]*\bhref=["\']([^"\']+)["\']'
                    r'|<item\b[^>]*\bhref=["\']([^"\']+)["\'][^>]*\bproperties=["\']cover-image["\']',
                    opf_text, re.IGNORECASE,
                )
                if prop_m:
                    href = prop_m.group(1) or prop_m.group(2)
                    base = str(Path(opf_path).parent)
                    cover_item = (str(Path(base) / href) if base != "." else href)

        # Fallback: look for cover-named images in the zip
        if not cover_item:
            for name in names:
                low = name.lower()
                if any(k in low for k in ("cover", "front")) and low.endswith((".jpg", ".jpeg", ".png")):
                    cover_item = name
                    break

        if cover_item and cover_item in contents:
            # Replace existing cover bytes
            contents[cover_item] = cover_jpeg
        elif opf_path and opf_path in contents:
            # Add new cover.jpg to zip, update OPF
            opf_dir = str(Path(opf_path).parent)
            new_cover_zip_path = (str(Path(opf_dir) / "cover.jpg") if opf_dir != "." else "cover.jpg")
            contents[new_cover_zip_path] = cover_jpeg

            # Update OPF XML
            opf_text = contents[opf_path].decode("utf-8", errors="replace")
            # Add <meta name="cover" content="bookie-cover"/> to <metadata> if not present
            if 'name="cover"' not in opf_text and "name='cover'" not in opf_text:
                opf_text = re.sub(
                    r'(</metadata>)',
                    '  <meta name="cover" content="bookie-cover"/>\n\\1',
                    opf_text,
                    count=1,
                )
            # Add <item> to <manifest> if id not present
            if 'id="bookie-cover"' not in opf_text:
                opf_text = re.sub(
                    r'(</manifest>)',
                    '  <item id="bookie-cover" href="cover.jpg" media-type="image/jpeg"/>\n\\1',
                    opf_text,
                    count=1,
                )
            contents[opf_path] = opf_text.encode("utf-8")
        else:
            # Last resort: just add cover.jpg at root
            contents["cover.jpg"] = cover_jpeg

        # Write the updated zip to a temp file next to the original, then swap it
        # in atomically so a failure part-way through never corrupts the book.
        tmp_fd, tmp = tempfile.mkstemp(suffix=".epub", dir=str(Path(epub_path).parent))
        os.close(tmp_fd)
        try:
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
                for name in names:
                    zout.writestr(infos[name], contents[name])
                # Write any new files added (not in original names)
                for name, data in contents.items():
                    if name not in names:
                        zout.writestr(name, data)
            shutil.copymode(epub_path, tmp)
            os.replace(tmp, epub_path)
        except Exception:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
        return True
    except Exception as exc:
        logger.warning("EPUB cover embed failed: %s", exc)
        return False


def delete_cover(book_id: int):
    for suffix in ("", "_thumb"):
        p = COVERS_DIR / f"{book_id}{suffix}.jpg"
        if p.exists():
            p.unlink()


def get_cover_path(book_id: int, thumb: bool = False) -> Path | None:
    suffix = "_thumb" if thumb else ""
    p = COVERS_DIR / f"{book_id}{suffix}.jpg"
    return p if p.exists() else None
