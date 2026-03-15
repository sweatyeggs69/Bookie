# Bookie

Self-hosted ebook manager with a Material Design 3 dark UI. Runs as a Docker container.

## Features

- Upload and organize EPUB, PDF, MOBI, AZW3, and CBZ files
- Automatic metadata fetching from Google Books, Open Library, Apple Books, and GoodReads
- Cover image extraction, search, and embedding back into EPUB files
- Send to Kindle via SMTP (supports multiple saved addresses with a default)
- Smart shelves with rule-based filtering (author, title, format, rating, etc.)
- Configurable file rename schemes and folder organization
- Grid and list view, full-text search, and pagination
- PWA support (installable on iOS and Android)
- Single-user authentication with a username and password

## Quick Start

```bash
docker run -d \
  --name bookie \
  -p 5000:5000 \
  -v bookie-data:/app/data \
  -e ADMIN_USER=admin \
  -e ADMIN_PASS=changeme \
  ghcr.io/dumpstarrfire/bookie:latest
```

Then open http://localhost:5000 in your browser.

## Docker Compose

```yaml
services:
  bookie:
    image: ghcr.io/dumpstarrfire/bookie:latest
    ports:
      - "5000:5000"
    volumes:
      - bookie-data:/app/data
    environment:
      - ADMIN_USER=admin
      - ADMIN_PASS=changeme
    restart: unless-stopped

volumes:
  bookie-data:
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_USER` | `admin` | Login username |
| `ADMIN_PASS` | `admin` | Login password |
| `DATA_DIR` | `/app/data` | Path where books, covers, and the database are stored |
| `SECRET_KEY` | auto-generated | Flask session secret (set explicitly to survive container restarts) |

## Data Volume

Everything Bookie needs persists under `/app/data`:

```
data/
  books/        - uploaded book files
  covers/       - extracted and saved cover images
  booker.db     - SQLite database
  secret_key    - session signing key
```

Mount this directory as a Docker volume to keep your library across container updates.

## Building Locally

```bash
git clone https://github.com/DumpstarrFire/Bookie.git
cd Bookie
docker build -t bookie .
docker run -p 5000:5000 -v $(pwd)/data:/app/data bookie
```

## Send to Kindle Setup

1. Go to Settings and add your Kindle email address.
2. Configure SMTP settings (host, port, username, password).
3. Add `your-smtp-sender@domain.com` to your Amazon approved senders list.
4. Click Send on any book to deliver it directly to your Kindle.

## License

MIT
