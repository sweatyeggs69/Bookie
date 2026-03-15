# Bookie

Self-hosted ebook manager

## Features

- Upload and organize EPUB, PDF, MOBI, AZW3, and CBZ files
- Automatic metadata fetching from Google Books, Open Library, Apple Books, and GoodReads
- Cover image extraction, search, and embedding back into EPUB files
- Send to eReader via SMTP (supports multiple saved addresses with a default)
- Smart shelves with rule-based filtering (author, title, format, rating, etc.)
- Configurable file rename schemes and folder organization
- PWA support (installable on iOS and Android)

## Quick Start

```bash
docker run -d \
  --name bookie \
  -p 5000:5000 \
  -v bookie-data:/app/data \
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
      - /path/to/config:/app/data
    restart: unless-stopped

volumes:
  bookie-data:
```

## License

MIT
