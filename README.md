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

**Delivery**
- Send to any eReader via SMTP — Kindle, Kobo, or otherwise
- Configurable sender address and recipient management

**Experience**
- Progressive Web App (PWA) — installable on mobile
- Light and dark mode
- Fully responsive layout

---

## Quick Start

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

On first run, navigate to the UI and complete the one-time account setup.

---

## Volumes

| Path | Purpose |
|---|---|
| `/app/data` | Database, credentials, and app configuration |

Books are served from the path configured inside the app after setup.

---

## License

MIT
