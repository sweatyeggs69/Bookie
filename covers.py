"""Book cover extraction and management."""
import io
import os
import logging
import zipfile
import re
from pathlib import Path
from PIL import Image

logger = logging.getLogger(__name__)

COVERS_DIR = Path(os.environ.get("DATA_DIR", "data")) / "covers"
THUMB_SIZE = (200, 300)
COVER_SIZE = (400, 600)


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
                    return zf.read(cover_item)

            # Fallback: look for common cover filenames
            for name in zf.namelist():
                lower = name.lower()
                if any(kw in lower for kw in ("cover", "front")) and lower.endswith(
                    (".jpg", ".jpeg", ".png", ".gif", ".webp")
                ):
                    return zf.read(name)
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
    """Find cover image href from OPF manifest."""
    try:
        opf = zf.read(opf_path).decode("utf-8", errors="replace")
        # Look for <item id="cover-image" ...> or properties="cover-image"
        m = re.search(
            r'<item[^>]+(?:id=["\']cover["\']|properties=["\']cover-image["\'])[^>]+href=["\']([^"\']+)["\']',
            opf,
            re.IGNORECASE,
        )
        if not m:
            # Fallback: <meta name="cover" content="cover-image-id"/>
            meta_m = re.search(r'<meta\s+name=["\']cover["\'][^>]+content=["\']([^"\']+)["\']', opf, re.IGNORECASE)
            if meta_m:
                item_id = meta_m.group(1)
                item_m = re.search(
                    rf'<item[^>]+id=["\']' + re.escape(item_id) + r'["\'][^>]+href=["\']([^"\']+)["\']', opf
                )
                if item_m:
                    m = item_m
        if not m:
            return None
        href = m.group(1)
        base = str(Path(opf_path).parent)
        full = str(Path(base) / href) if base != "." else href
        return full if full in zf.namelist() else None
    except Exception:
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

        tmp = tempfile.mktemp(suffix=".epub")
        shutil.copy2(epub_path, tmp)

        with zipfile.ZipFile(tmp, "r") as zin:
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
            # Try OPF2 <meta name="cover" content="..."/>
            meta_m = re.search(r'<meta\s+name=["\']cover["\'][^>]+content=["\']([^"\']+)["\']', opf_text, re.IGNORECASE)
            if meta_m:
                item_id = meta_m.group(1)
                item_m = re.search(
                    r'<item[^>]+id=["\']' + re.escape(item_id) + r'["\'][^>]+href=["\']([^"\']+)["\']',
                    opf_text,
                )
                if item_m:
                    href = item_m.group(1)
                    base = str(Path(opf_path).parent)
                    cover_item = (str(Path(base) / href) if base != "." else href)
            if not cover_item:
                # Try properties="cover-image"
                prop_m = re.search(
                    r'<item[^>]+properties=["\']cover-image["\'][^>]+href=["\']([^"\']+)["\']',
                    opf_text, re.IGNORECASE,
                )
                if prop_m:
                    href = prop_m.group(1)
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
            # Add <meta name="cover" content="booker-cover"/> to <metadata> if not present
            if 'name="cover"' not in opf_text and "name='cover'" not in opf_text:
                opf_text = re.sub(
                    r'(</metadata>)',
                    '  <meta name="cover" content="booker-cover"/>\n\\1',
                    opf_text,
                    count=1,
                )
            # Add <item> to <manifest> if id not present
            if 'id="booker-cover"' not in opf_text:
                opf_text = re.sub(
                    r'(</manifest>)',
                    '  <item id="booker-cover" href="cover.jpg" media-type="image/jpeg"/>\n\\1',
                    opf_text,
                    count=1,
                )
            contents[opf_path] = opf_text.encode("utf-8")
        else:
            # Last resort: just add cover.jpg at root
            contents["cover.jpg"] = cover_jpeg

        # Write updated zip
        with zipfile.ZipFile(epub_path, "w", zipfile.ZIP_DEFLATED) as zout:
            for name in names:
                zout.writestr(infos[name], contents[name])
            # Write any new files added (not in original names)
            for name, data in contents.items():
                if name not in names:
                    zout.writestr(name, data)

        os.unlink(tmp)
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
