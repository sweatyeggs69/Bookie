# Codebase Task Proposals

This pass identifies one concrete task in each requested category.

## 1) Typo fix task

**Task:** Standardize `GoodReads` to `Goodreads` in scraper comments/docstrings/log messages.

- **Why:** The code currently mixes `GoodReads` and `Goodreads`, which is a visible naming typo and creates inconsistent user-facing/log text.
- **Evidence:** `scraper.py` module docstring and Goodreads section/comments/log messages use `GoodReads`. (`scraper.py` lines 1, 130, 134, 147, 158)
- **Suggested implementation:** Replace the camel-cased `GoodReads` token with `Goodreads` in docstrings/comments/log strings only (no key/schema rename needed).
- **Acceptance criteria:** `rg -n "GoodReads" scraper.py` returns no matches.

## 2) Bug fix task

**Task:** Rename the default SQLite file from `booker.db` to `bookie.db` (or confirm and document intentional naming).

- **Why:** The project is named Bookie, but default DB filename is `booker.db`; this likely causes confusion and can break backup/migration scripts that assume `bookie.db`.
- **Evidence:** `app.py` config sets fallback DB path to `DATA_DIR / 'booker.db'`.
- **Suggested implementation:** Update fallback to `bookie.db` and add a one-time migration check that copies/renames existing `booker.db` if `bookie.db` is absent.
- **Acceptance criteria:** Fresh start creates `bookie.db`; legacy `booker.db` installs still boot with no data loss.

## 3) Comment / documentation discrepancy task

**Task:** Align README format support list with backend `ALLOWED_EXTENSIONS`.

- **Why:** README claims support for “MOBI, AZW3, ... and more,” but backend also accepts `azw`, `fb2`, `djvu`, `cbr`, and `txt`; docs under-report actual supported formats.
- **Evidence:** README feature list vs. `ALLOWED_EXTENSIONS` in `app.py`.
- **Suggested implementation:** Update README to explicitly list supported extensions from `ALLOWED_EXTENSIONS`, or add language like “including ...” with a pointer to server config.
- **Acceptance criteria:** README supported-format statement matches runtime allow-list.

## 4) Test improvement task

**Task:** Add unit tests for upload file-signature validation (`_magic_ok`) and extension coverage.

- **Why:** `_magic_ok` is security-relevant validation, but there are currently no automated tests in the repository to guard regressions.
- **Evidence:** Search for test suites (`pytest`, `test_*.py`, `vitest`, `jest`) finds none.
- **Suggested implementation:** Add `pytest` tests that simulate `FileStorage` streams for known signatures (valid/invalid `epub`, `pdf`, `cbz`, `cbr`, `djvu`) and ensure unsupported-signature types still pass extension-only policy.
- **Acceptance criteria:** New tests fail on signature regressions and pass on current expected behavior.
