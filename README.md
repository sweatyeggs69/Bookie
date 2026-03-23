# Bookie

A self-hosted ebook manager built for simplicity. Organize your library, fetch metadata, and send books directly to your eReader — all from a clean, fast web UI.

> Built with Claude. Yes, really.

<img width="100%" alt="Bookie UI" src="https://github.com/user-attachments/assets/e0755ecb-c6f7-4ed3-b57e-337dd64876e7" />

---

## Features

**Library Management**
- Multi-format support: EPUB, PDF, MOBI, AZW3, CBZ, and more
- Automatic metadata fetching from Open Library, Apple Books, and Goodreads
- Cover extraction, search, and direct embedding into EPUB files
- Series tracking and tagging (think shelves, minus the complexity)

**Organization**
- Configurable file rename schemes and folder structures
- Bulk selection and batch operations

<img width="820" height="597" alt="image" src="https://github.com/user-attachments/assets/f6cbe98d-319f-4b6e-92fb-785a3f90ccba" />

## Docker Compose

```yaml
services:
  bookie:
    container_name: bookie
    image: ghcr.io/sweatyeggs69/bookie:latest
    ports:
      - "5000:5000"
    volumes:
      - /path/to/config:/app/data
    environment:
      - SESSION_COOKIE_SECURE=false  # Required when accessing over HTTP
    restart: unless-stopped
```

Access the UI at http://localhost:5000

## License

MIT
