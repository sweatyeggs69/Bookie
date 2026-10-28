"""EPUB cleanup: tidy an epub in place without touching the story text.

Each step is independent and can be switched off in settings:

  metadata     write Bookie's title, author, series, etc. into the OPF
  distributor  drop short scanner/distributor pages (ePubLibre, Anna's Archive, ex libris)
  junk         strip Calibre/Sigil leftovers: empty filepos anchors, mbp_pagebreak
               divs, word joiners, Adobe Adept and generator meta
  headings     turn a chapter's styled first paragraph ("Chapter 3", "IV") into a real h1
  titles       fill empty <title> tags from the page's heading
  toc          rebuild a missing or one-entry table of contents from the headings
  toc_case     change all-caps table of contents entries to title case

Files that don't parse as XML are left untouched, and nothing is written
unless a step actually changed something.
"""
import io
import logging
import os
import posixpath
import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import quote, unquote

from lxml import etree

logger = logging.getLogger(__name__)

STEPS = ["metadata", "distributor", "junk", "headings", "titles", "toc", "toc_case"]

MAX_EPUB_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024

OPF_NS = "http://www.idpf.org/2007/opf"
DC_NS = "http://purl.org/dc/elements/1.1/"
NCX_NS = "http://www.daisy.org/z3986/2005/ncx/"
XHTML_NS = "http://www.w3.org/1999/xhtml"
EPUB_NS = "http://www.idpf.org/2007/ops"
CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container"

_XHTML_TYPES = {"application/xhtml+xml", "text/html"}
_BLOCKS = {"p", "div", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "li", "table", "section"}
_HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}

# Text found on pages that a distributor or scanner added, not the author
_DISTRIBUTOR_MARKERS = (
    "epublibre", "epub libre", "ex libris", "annas-archive", "anna's archive",
    "anna’s archive", "z-library", "z-lib.org",
)
_DISTRIBUTOR_IMAGE_MARKERS = ("epublibre", "exlibris", "ex_libris", "ex-libris")
_DISTRIBUTOR_MAX_TEXT = 1500
_DISTRIBUTOR_MAX_PAGES = 3  # more matches than this means the heuristic is misfiring

_NUMBER_WORDS = (
    "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|"
    "fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|"
    "fifty|sixty|seventy|eighty|ninety|hundred"
)
_CHAPTER_RE = re.compile(
    r"^(?:"
    r"(?:chapter|chap\.|cap[ií]tulo|chapitre|kapitel|part|book|prologue|pr[oó]logo|"
    r"epilogue|ep[ií]logo|interlude|introduction|foreword|preface|afterword)\b.*"
    r"|\d{1,3}\.?"
    r"|[ivxlcdm]{1,7}\.?"
    rf"|(?:(?:{_NUMBER_WORDS})[\s-]*)+"
    r")$",
    re.IGNORECASE,
)
_HEADING_MAX_CHARS = 60

_JUNK_CHARS = re.compile("[⁠﻿]")
_FILEPOS_ID = re.compile(r"^filepos\d+$")
_GENERATOR_META = {"generator", "sigil version", "calibre:title_sort"}


class CleanupError(Exception):
    pass


def _parser():
    return etree.XMLParser(resolve_entities=False, no_network=True, remove_blank_text=False)


def _ln(el) -> str:
    """Local tag name, or '' for comments and processing instructions."""
    return etree.QName(el).localname if isinstance(el.tag, str) else ""


def _text(el) -> str:
    return re.sub(r"\s+", " ", "".join(el.itertext())).strip()


def _resolve(base_file: str, href: str) -> str:
    """Zip path of *href* as written inside *base_file*, without any fragment."""
    href = unquote(href.split("#", 1)[0])
    return posixpath.normpath(posixpath.join(posixpath.dirname(base_file), href))


def _relative(from_file: str, to_file: str) -> str:
    return quote(posixpath.relpath(to_file, posixpath.dirname(from_file) or "."))


class _Epub:
    """In-memory view of an epub: raw entries plus parsed XML for those we touch."""

    def __init__(self, path: str):
        with zipfile.ZipFile(path, "r") as zf:
            if sum(i.file_size for i in zf.infolist()) > MAX_EPUB_UNCOMPRESSED_BYTES:
                raise CleanupError("EPUB too large to rewrite")
            self.infos = zf.infolist()
            self.contents = {i.filename: zf.read(i.filename) for i in self.infos}
        self.trees: dict[str, etree._ElementTree] = {}
        self.dirty: set[str] = set()
        self.removed: set[str] = set()
        self.added: list[str] = []

        container = self.parse("META-INF/container.xml")
        if container is None:
            raise CleanupError("Missing or unreadable META-INF/container.xml")
        rootfile = container.getroot().find(f".//{{{CONTAINER_NS}}}rootfile")
        if rootfile is None or not rootfile.get("full-path"):
            raise CleanupError("container.xml names no package file")
        self.opf_path = rootfile.get("full-path")
        opf = self.parse(self.opf_path)
        if opf is None:
            raise CleanupError("Package file does not parse")
        self.opf = opf.getroot()
        self.version = (self.opf.get("version") or "2.0").strip()
        self.metadata = self.opf.find(f"{{{OPF_NS}}}metadata")
        self.manifest = self.opf.find(f"{{{OPF_NS}}}manifest")
        self.spine = self.opf.find(f"{{{OPF_NS}}}spine")
        if self.metadata is None or self.manifest is None or self.spine is None:
            raise CleanupError("Package file is missing metadata, manifest or spine")

    # ── XML access ─────────────────────────────────────────────────────────

    def parse(self, name: str):
        if name in self.trees:
            return self.trees[name]
        data = self.contents.get(name)
        if data is None:
            return None
        try:
            tree = etree.parse(io.BytesIO(data), _parser())
        except etree.XMLSyntaxError as exc:
            logger.debug("Leaving %s untouched, it does not parse: %s", name, exc)
            return None
        self.trees[name] = tree
        return tree

    def touch(self, name: str):
        self.dirty.add(name)

    # ── Package helpers ────────────────────────────────────────────────────

    def items(self):
        """Manifest items as (element, id, zip path, media type)."""
        for item in self.manifest.findall(f"{{{OPF_NS}}}item"):
            href = item.get("href")
            if href:
                yield item, item.get("id"), _resolve(self.opf_path, href), item.get("media-type", "")

    def item_by_id(self, item_id: str):
        for item, iid, path, mtype in self.items():
            if iid == item_id:
                return item, path, mtype
        return None

    def spine_docs(self) -> list[str]:
        docs = []
        for ref in self.spine.findall(f"{{{OPF_NS}}}itemref"):
            found = self.item_by_id(ref.get("idref", ""))
            if found and found[2] in _XHTML_TYPES and found[1] in self.contents:
                docs.append(found[1])
        return docs

    def ncx_path(self) -> str | None:
        toc_id = self.spine.get("toc")
        if toc_id:
            found = self.item_by_id(toc_id)
            if found:
                return found[1]
        for _, _, path, mtype in self.items():
            if mtype == "application/x-dtbncx+xml":
                return path
        return None

    def nav_path(self) -> str | None:
        for item, _, path, _ in self.items():
            if "nav" in (item.get("properties") or "").split():
                return path
        return None

    def cover_paths(self) -> set[str]:
        paths = set()
        cover_ids = {m.get("content") for m in self.metadata.findall(f"{{{OPF_NS}}}meta")
                     if (m.get("name") or "").lower() == "cover"}
        for item, iid, path, _ in self.items():
            if iid in cover_ids or "cover-image" in (item.get("properties") or "").split():
                paths.add(path)
        return paths

    def unique_id(self) -> str:
        uid_name = self.opf.get("unique-identifier")
        for el in self.metadata.findall(f"{{{DC_NS}}}identifier"):
            if el.get("id") == uid_name and el.text:
                return el.text.strip()
        el = self.metadata.find(f"{{{DC_NS}}}identifier")
        return (el.text or "").strip() if el is not None else ""

    # ── Output ─────────────────────────────────────────────────────────────

    def serialize(self, name: str) -> bytes:
        tree = self.trees[name]
        return etree.tostring(tree, xml_declaration=True, encoding="utf-8")

    def write(self, path: str):
        for name in self.dirty:
            if name not in self.removed:
                self.contents[name] = self.serialize(name)
        tmp_fd, tmp = tempfile.mkstemp(suffix=".epub", dir=str(Path(path).parent))
        os.close(tmp_fd)
        try:
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
                # mimetype must be the first entry and stored uncompressed
                if "mimetype" in self.contents:
                    zout.writestr(zipfile.ZipInfo("mimetype"), self.contents["mimetype"],
                                  compress_type=zipfile.ZIP_STORED)
                for info in self.infos:
                    if info.filename == "mimetype" or info.filename in self.removed:
                        continue
                    zout.writestr(info, self.contents[info.filename])
                for name in self.added:
                    zout.writestr(name, self.contents[name])
            shutil.copymode(path, tmp)
            os.replace(tmp, path)
        except Exception:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise


# ── Steps ─────────────────────────────────────────────────────────────────────

def _opf_meta(epub: _Epub, **attrs):
    """Append an OPF <meta>. Declaring the namespace on the element keeps it
    unprefixed, since some readers match the bare tag name "meta"."""
    el = etree.SubElement(epub.metadata, f"{{{OPF_NS}}}meta", nsmap={None: OPF_NS})
    for key, val in attrs.items():
        el.set(key, val)
    return el


def _set_dc(epub: _Epub, tag: str, value: str) -> bool:
    el = epub.metadata.find(f"{{{DC_NS}}}{tag}")
    if el is not None and (el.text or "").strip() == value:
        return False
    if el is None:
        el = etree.SubElement(epub.metadata, f"{{{DC_NS}}}{tag}")
    el.text = value
    return True


def _set_named_meta(epub: _Epub, name: str, value: str) -> bool:
    for m in epub.metadata.findall(f"{{{OPF_NS}}}meta"):
        if m.get("name") == name:
            if m.get("content") == value:
                return False
            m.set("content", value)
            return True
    _opf_meta(epub, name=name, content=value)
    return True


def _format_index(value) -> str:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return ""
    return str(int(num)) if num.is_integer() else f"{num:g}"


def _step_metadata(epub: _Epub, meta: dict) -> list[str]:
    changed = []
    title = (meta.get("title") or "").strip()
    if title and _set_dc(epub, "title", title):
        changed.append("title")

    author = (meta.get("author") or "").strip()
    if author:
        creator = epub.metadata.find(f"{{{DC_NS}}}creator")
        if creator is None or (creator.text or "").strip() != author:
            if creator is None:
                creator = etree.SubElement(epub.metadata, f"{{{DC_NS}}}creator")
            creator.text = author
            # A stale sort name would make readers file the book under the old author
            creator.attrib.pop(f"{{{OPF_NS}}}file-as", None)
            cid = creator.get("id")
            if cid:
                for m in epub.metadata.findall(f"{{{OPF_NS}}}meta"):
                    if m.get("refines") == f"#{cid}" and m.get("property") == "file-as":
                        epub.metadata.remove(m)
            changed.append("author")

    for key, tag in (("publisher", "publisher"), ("language", "language"), ("description", "description")):
        val = (meta.get(key) or "").strip()
        if val and _set_dc(epub, tag, val):
            changed.append(key)

    year = (meta.get("published_date") or "").strip()[:4]
    if year.isdigit():
        date_el = epub.metadata.find(f"{{{DC_NS}}}date")
        if date_el is None or not (date_el.text or "").strip().startswith(year):
            _set_dc(epub, "date", year)
            changed.append("date")

    isbn = (meta.get("isbn13") or meta.get("isbn") or "").strip()
    if isbn:
        known = {re.sub(r"[^0-9Xx]", "", el.text or "") for el in epub.metadata.findall(f"{{{DC_NS}}}identifier")}
        if isbn not in known:
            el = etree.SubElement(epub.metadata, f"{{{DC_NS}}}identifier")
            if epub.version.startswith("3"):
                el.text = f"urn:isbn:{isbn}"
            else:
                el.set(f"{{{OPF_NS}}}scheme", "ISBN")
                el.text = isbn
            changed.append("ISBN")

    series = (meta.get("series") or "").strip()
    if series:
        index = _format_index(meta.get("series_order"))
        # calibre:series is what KOReader and most readers look for
        hit = _set_named_meta(epub, "calibre:series", series)
        if index:
            hit = _set_named_meta(epub, "calibre:series_index", index) or hit
        if epub.version.startswith("3"):
            hit = _set_epub3_series(epub, series, index) or hit
        if hit:
            changed.append("series")

    if changed:
        epub.touch(epub.opf_path)
        return [f"Wrote {', '.join(changed)} into the book's metadata"]
    return []


def _set_epub3_series(epub: _Epub, series: str, index: str) -> bool:
    metas = epub.metadata.findall(f"{{{OPF_NS}}}meta")
    coll = next((m for m in metas if m.get("property") == "belongs-to-collection"), None)
    changed = False
    if coll is None:
        coll = _opf_meta(epub, property="belongs-to-collection", id="bookie-series")
        coll.text = series
        _opf_meta(epub, refines="#bookie-series", property="collection-type").text = "series"
        changed = True
    elif (coll.text or "").strip() != series:
        coll.text = series
        changed = True
    if not index:
        return changed
    cid = coll.get("id")
    if not cid:
        cid = "bookie-series"
        coll.set("id", cid)
    pos = next((m for m in epub.metadata.findall(f"{{{OPF_NS}}}meta")
                if m.get("refines") == f"#{cid}" and m.get("property") == "group-position"), None)
    if pos is None:
        _opf_meta(epub, refines=f"#{cid}", property="group-position").text = index
        return True
    if (pos.text or "").strip() != index:
        pos.text = index
        return True
    return changed


def _hrefs_in(tree) -> list[str]:
    out = []
    for el in tree.iter():
        if not isinstance(el.tag, str):
            continue
        for attr in ("href", "src", "{http://www.w3.org/1999/xlink}href"):
            if el.get(attr):
                out.append(el.get(attr))
    return out


def _step_distributor(epub: _Epub) -> list[str]:
    candidates = []
    docs = epub.spine_docs()
    for name in docs:
        tree = epub.parse(name)
        if tree is None:
            continue
        text = _text(tree.getroot()).lower()
        if len(text) > _DISTRIBUTOR_MAX_TEXT:
            continue
        srcs = " ".join(_hrefs_in(tree)).lower()
        if any(m in text for m in _DISTRIBUTOR_MARKERS) or any(m in srcs for m in _DISTRIBUTOR_IMAGE_MARKERS):
            candidates.append(name)
    if not candidates or len(candidates) > _DISTRIBUTOR_MAX_PAGES or len(candidates) >= len(docs):
        return []

    removed = set(candidates)
    # Images used only by the removed pages go too
    covers = epub.cover_paths()
    used_elsewhere = set()
    for name in epub.contents:
        # The OPF and NCX are skipped: they list every file, and get pruned below
        if name in removed or not name.endswith((".xhtml", ".html", ".htm", ".css")):
            continue
        tree = epub.parse(name)
        if tree is None:
            continue
        used_elsewhere.update(_resolve(name, h) for h in _hrefs_in(tree))
    for name in candidates:
        for h in _hrefs_in(epub.trees[name]):
            target = _resolve(name, h)
            if (target in epub.contents and target not in used_elsewhere and target not in covers
                    and not target.endswith((".css", ".xhtml", ".html"))):
                removed.add(target)

    _drop_from_package(epub, removed)
    return [f"Removed {len(candidates)} distributor page{'s' if len(candidates) != 1 else ''}"]


def _drop_from_package(epub: _Epub, removed: set[str]):
    removed_ids = set()
    for item, iid, path, _ in list(epub.items()):
        if path in removed:
            epub.manifest.remove(item)
            removed_ids.add(iid)
    for ref in epub.spine.findall(f"{{{OPF_NS}}}itemref"):
        if ref.get("idref") in removed_ids:
            epub.spine.remove(ref)
    guide = epub.opf.find(f"{{{OPF_NS}}}guide")
    if guide is not None:
        for ref in guide.findall(f"{{{OPF_NS}}}reference"):
            if _resolve(epub.opf_path, ref.get("href", "")) in removed:
                guide.remove(ref)
    epub.touch(epub.opf_path)

    ncx = epub.ncx_path()
    if ncx and epub.parse(ncx) is not None:
        root = epub.trees[ncx].getroot()
        for point in list(root.iter(f"{{{NCX_NS}}}navPoint")):
            content = point.find(f"{{{NCX_NS}}}content")
            if content is not None and _resolve(ncx, content.get("src", "")) in removed:
                # Keep any children by lifting them into the parent
                parent = point.getparent()
                idx = parent.index(point)
                for child in point.findall(f"{{{NCX_NS}}}navPoint"):
                    idx += 1
                    parent.insert(idx, child)
                parent.remove(point)
        _renumber_ncx(root)
        epub.touch(ncx)

    nav = epub.nav_path()
    if nav and epub.parse(nav) is not None:
        for a in list(epub.trees[nav].getroot().iter(f"{{{XHTML_NS}}}a")):
            if a.get("href") and _resolve(nav, a.get("href")) in removed:
                li = a.getparent()
                if _ln(li) == "li" and li.find(f"{{{XHTML_NS}}}ol") is None:
                    li.getparent().remove(li)
        epub.touch(nav)

    epub.removed.update(removed)


def _renumber_ncx(root):
    for i, point in enumerate(root.iter(f"{{{NCX_NS}}}navPoint"), start=1):
        point.set("playOrder", str(i))


def _referenced_fragments(epub: _Epub) -> set[str]:
    frags = set()
    for name in epub.contents:
        if not name.endswith((".xhtml", ".html", ".htm", ".ncx", ".opf")):
            continue
        tree = epub.parse(name)
        if tree is None:
            continue
        for h in _hrefs_in(tree):
            if "#" in h:
                frags.add(unquote(h.split("#", 1)[1]))
    return frags


def _step_junk(epub: _Epub) -> list[str]:
    count = 0
    referenced = _referenced_fragments(epub)
    for name in epub.spine_docs():
        tree = epub.parse(name)
        if tree is None:
            continue
        doc_changed = False
        for el in list(tree.getroot().iter()):
            if not isinstance(el.tag, str):
                continue
            ln = _ln(el)
            # Invisible word joiners and stray BOMs
            for attr in ("text", "tail"):
                val = getattr(el, attr)
                if val and _JUNK_CHARS.search(val):
                    setattr(el, attr, _JUNK_CHARS.sub("", val))
                    doc_changed = True
            if ln == "meta" and (el.get("name") or "").lower().startswith("adept."):
                _remove_keep_tail(el)
                count += 1
                doc_changed = True
            elif ln == "a" and _is_empty(el) and not el.get("href"):
                el_id = el.get("id") or el.get("name") or ""
                if (not el_id or _FILEPOS_ID.match(el_id)) and el_id not in referenced:
                    _remove_keep_tail(el)
                    count += 1
                    doc_changed = True
            elif ln == "div" and "mbp_pagebreak" in (el.get("class") or "") and _is_empty(el):
                _remove_keep_tail(el)
                count += 1
                doc_changed = True
            elif el.get("id") and _FILEPOS_ID.match(el.get("id")) and el.get("id") not in referenced:
                del el.attrib["id"]
                doc_changed = True
        if doc_changed:
            epub.touch(name)

    opf_changed = False
    for m in epub.metadata.findall(f"{{{OPF_NS}}}meta"):
        if (m.get("name") or "").lower() in _GENERATOR_META:
            epub.metadata.remove(m)
            count += 1
            opf_changed = True
    for c in epub.metadata.findall(f"{{{DC_NS}}}contributor"):
        if "calibre" in (c.text or "").lower():
            epub.metadata.remove(c)
            count += 1
            opf_changed = True
    if opf_changed:
        epub.touch(epub.opf_path)
    return [f"Removed {count} leftover conversion tag{'s' if count != 1 else ''}"] if count else []


def _is_empty(el) -> bool:
    return len(el) == 0 and not (el.text or "").strip()


def _remove_keep_tail(el):
    parent = el.getparent()
    if parent is None:
        return
    if el.tail:
        prev = el.getprevious()
        if prev is not None:
            prev.tail = (prev.tail or "") + el.tail
        else:
            parent.text = (parent.text or "") + el.tail
    parent.remove(el)


def _body(tree):
    return next((el for el in tree.getroot() if _ln(el) == "body"), None)


def _first_text_block(body):
    """The innermost block element holding the page's first visible text."""
    for el in body.iter():
        if _ln(el) not in _BLOCKS or not _text(el):
            continue
        if any(_ln(d) in _BLOCKS for d in el.iterdescendants()):
            continue
        return el
    return None


def _step_headings(epub: _Epub) -> list[str]:
    count = 0
    for name in epub.spine_docs():
        tree = epub.parse(name)
        if tree is None:
            continue
        body = _body(tree)
        if body is None or any(_ln(el) in _HEADINGS for el in body.iter()):
            continue
        block = _first_text_block(body)
        if block is None or _ln(block) not in {"p", "div", "blockquote"}:
            continue
        text = _text(block)
        if len(text) > _HEADING_MAX_CHARS or not _CHAPTER_RE.match(text):
            continue
        ns = etree.QName(block).namespace
        block.tag = f"{{{ns}}}h1" if ns else "h1"
        count += 1
        epub.touch(name)
    return [f"Marked {count} chapter heading{'s' if count != 1 else ''}"] if count else []


def _page_heading(tree) -> str:
    body = _body(tree)
    if body is None:
        return ""
    for level in ("h1", "h2"):
        for el in body.iter():
            if _ln(el) == level and _text(el):
                return _text(el)
    return ""


def _step_titles(epub: _Epub, book_title: str) -> list[str]:
    count = 0
    for name in epub.spine_docs():
        tree = epub.parse(name)
        if tree is None:
            continue
        head = next((el for el in tree.getroot() if _ln(el) == "head"), None)
        if head is None:
            continue
        title = next((el for el in head if _ln(el) == "title"), None)
        if title is not None and _text(title):
            continue
        wanted = _page_heading(tree) or book_title
        if not wanted:
            continue
        if title is None:
            ns = etree.QName(head).namespace
            title = etree.Element(f"{{{ns}}}title" if ns else "title")
            head.insert(0, title)
        for child in list(title):
            title.remove(child)
        title.text = wanted
        count += 1
        epub.touch(name)
    return [f"Filled {count} empty page title{'s' if count != 1 else ''}"] if count else []


def _toc_entries(epub: _Epub) -> list[tuple[str, str]]:
    entries = []
    for name in epub.spine_docs():
        tree = epub.parse(name)
        if tree is None:
            continue
        label = _page_heading(tree)
        if label:
            entries.append((label[:120], name))
    return entries


def _step_toc(epub: _Epub, book_title: str) -> list[str]:
    ncx = epub.ncx_path()
    nav = epub.nav_path()
    ncx_tree = epub.parse(ncx) if ncx else None
    nav_tree = epub.parse(nav) if nav else None
    nav_toc = None
    if nav_tree is not None:
        nav_toc = next((el for el in nav_tree.getroot().iter(f"{{{XHTML_NS}}}nav")
                        if el.get(f"{{{EPUB_NS}}}type") == "toc"), None)

    ncx_count = len(list(ncx_tree.getroot().iter(f"{{{NCX_NS}}}navPoint"))) if ncx_tree is not None else 0
    nav_count = len(list(nav_toc.iter(f"{{{XHTML_NS}}}li"))) if nav_toc is not None else 0
    if max(ncx_count, nav_count) >= 2:
        return []
    # A file that exists but doesn't parse is left alone rather than replaced
    if (ncx and ncx_tree is None) or (nav and nav_tree is None):
        return []

    entries = _toc_entries(epub)
    if len(entries) < 2:
        return []

    if ncx_tree is None and nav_toc is None:
        ncx = posixpath.join(posixpath.dirname(epub.opf_path), "toc.ncx")
        if ncx in epub.contents:
            return []
        ncx_tree = _new_ncx(epub, book_title)
        epub.trees[ncx] = ncx_tree
        epub.contents[ncx] = b""
        epub.added.append(ncx)
        ids = {iid for _, iid, _, _ in epub.items()}
        ncx_id = "ncx" if "ncx" not in ids else "bookie-ncx"
        etree.SubElement(epub.manifest, f"{{{OPF_NS}}}item", id=ncx_id,
                         href=_relative(epub.opf_path, ncx), **{"media-type": "application/x-dtbncx+xml"})
        epub.spine.set("toc", ncx_id)
        epub.touch(epub.opf_path)

    if ncx_tree is not None:
        root = ncx_tree.getroot()
        nav_map = root.find(f"{{{NCX_NS}}}navMap")
        if nav_map is None:
            nav_map = etree.SubElement(root, f"{{{NCX_NS}}}navMap")
        for child in list(nav_map):
            nav_map.remove(child)
        for i, (label, target) in enumerate(entries, start=1):
            point = etree.SubElement(nav_map, f"{{{NCX_NS}}}navPoint", id=f"navpoint-{i}", playOrder=str(i))
            nl = etree.SubElement(point, f"{{{NCX_NS}}}navLabel")
            etree.SubElement(nl, f"{{{NCX_NS}}}text").text = label
            etree.SubElement(point, f"{{{NCX_NS}}}content", src=_relative(ncx, target))
        head = root.find(f"{{{NCX_NS}}}head")
        if head is not None:
            for m in head.findall(f"{{{NCX_NS}}}meta"):
                if m.get("name") == "dtb:depth":
                    m.set("content", "1")
        epub.touch(ncx)

    if nav_toc is not None:
        ol = nav_toc.find(f"{{{XHTML_NS}}}ol")
        if ol is None:
            ol = etree.SubElement(nav_toc, f"{{{XHTML_NS}}}ol")
        for child in list(ol):
            ol.remove(child)
        for label, target in entries:
            li = etree.SubElement(ol, f"{{{XHTML_NS}}}li")
            etree.SubElement(li, f"{{{XHTML_NS}}}a", href=_relative(nav, target)).text = label
        epub.touch(nav)

    return [f"Rebuilt the table of contents ({len(entries)} entries)"]


_SMALL_WORDS = {"a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into",
                "nor", "of", "on", "or", "the", "to", "with"}
_ROMAN_RE = re.compile(r"^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$")
_NUMBERED = {"chapter", "part", "book", "volume", "vol.", "act", "section"}
# A label is split on these so "Chapter 4: THE WRONG DOOR" fixes just the caps part
_SEGMENT_SPLIT = re.compile(r"(\s*[:\u2013\u2014|]\s*|\s+-\s+)")


def _cap_word(word: str) -> str:
    """Upper-case the first letter of each hyphenated part, lower-case the rest."""
    def part(p):
        m = re.search(r"[^\W\d_]", p)
        return p[:m.start()] + p[m.start()].upper() + p[m.start() + 1:].lower() if m else p.lower()
    return "-".join(part(p) for p in word.split("-"))


def _title_case_segment(segment: str) -> str:
    words = segment.split(" ")
    out = []
    for i, word in enumerate(words):
        bare = word.strip(".,;!?()[]\"'\u2018\u2019\u201c\u201d")
        prev = re.sub(r"[^\w.]", "", words[i - 1]).lower() if i else ""
        if bare and _ROMAN_RE.match(bare) and (len([w for w in words if w]) == 1 or prev in _NUMBERED or bare == "I"):
            out.append(word)  # a chapter number like "IV", or the pronoun "I"
        elif i and bare.lower() in _SMALL_WORDS:
            out.append(word.lower())
        else:
            out.append(_cap_word(word))
    return " ".join(out)


def title_case_label(label: str) -> str:
    """Title-case each all-caps segment of a table of contents label."""
    parts = _SEGMENT_SPLIT.split(label)
    for i in range(0, len(parts), 2):  # odd indexes are the separators
        letters = [c for c in parts[i] if c.isalpha()]
        if len(letters) >= 2 and all(c.isupper() for c in letters):
            parts[i] = _title_case_segment(parts[i])
    return "".join(parts)


def _step_toc_case(epub: _Epub) -> list[str]:
    count = 0
    labels = []
    ncx = epub.ncx_path()
    if ncx and epub.parse(ncx) is not None:
        labels += [(ncx, el) for el in epub.trees[ncx].getroot().iter(f"{{{NCX_NS}}}text")
                   if _ln(el.getparent()) == "navLabel"]
    nav = epub.nav_path()
    if nav and epub.parse(nav) is not None:
        for nav_el in epub.trees[nav].getroot().iter(f"{{{XHTML_NS}}}nav"):
            if nav_el.get(f"{{{EPUB_NS}}}type") == "toc":
                labels += [(nav, a) for a in nav_el.iter(f"{{{XHTML_NS}}}a")]
    for name, el in labels:
        # Only plain-text labels; markup inside a link is left alone
        if len(el) or not el.text:
            continue
        fixed = title_case_label(el.text)
        if fixed != el.text:
            el.text = fixed
            epub.touch(name)
            count += 1
    return [f"Fixed {count} all-caps table of contents entr{'ies' if count != 1 else 'y'}"] if count else []


def _new_ncx(epub: _Epub, book_title: str):
    root = etree.Element(f"{{{NCX_NS}}}ncx", nsmap={None: NCX_NS}, version="2005-1")
    head = etree.SubElement(root, f"{{{NCX_NS}}}head")
    for name, content in (("dtb:uid", epub.unique_id()), ("dtb:depth", "1"),
                          ("dtb:totalPageCount", "0"), ("dtb:maxPageNumber", "0")):
        etree.SubElement(head, f"{{{NCX_NS}}}meta", name=name, content=content)
    title = etree.SubElement(root, f"{{{NCX_NS}}}docTitle")
    etree.SubElement(title, f"{{{NCX_NS}}}text").text = book_title or ""
    etree.SubElement(root, f"{{{NCX_NS}}}navMap")
    return etree.ElementTree(root)


# ── Entry point ───────────────────────────────────────────────────────────────

def parse_steps(raw: str | None) -> set[str]:
    """Steps enabled by the comma-separated setting; every step when unset."""
    if raw is None:
        return set(STEPS)
    return {s.strip() for s in raw.split(",") if s.strip() in STEPS}


def clean_epub(path: str, meta: dict, steps: set[str]) -> list[str]:
    """Clean the epub at *path* in place. Returns what was changed, or [] if nothing was.

    *meta* holds Bookie's own fields for the book (title, author, series, ...).
    Raises CleanupError when the file isn't a usable epub.
    """
    try:
        epub = _Epub(path)
    except (zipfile.BadZipFile, KeyError) as exc:
        raise CleanupError(f"Not a readable epub: {exc}") from exc

    title = (meta.get("title") or "").strip()
    actions: list[str] = []
    if "metadata" in steps:
        actions += _step_metadata(epub, meta)
    if "distributor" in steps:
        actions += _step_distributor(epub)
    if "junk" in steps:
        actions += _step_junk(epub)
    if "headings" in steps:
        actions += _step_headings(epub)
    if "titles" in steps:
        actions += _step_titles(epub, title)
    if "toc" in steps:
        actions += _step_toc(epub, title)
    if "toc_case" in steps:
        actions += _step_toc_case(epub)

    if epub.dirty or epub.removed:
        epub.write(path)
    return actions
