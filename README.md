<img width="98" lt="icon" src="https://github.com/user-attachments/assets/1c637116-36c9-4f0a-bc05-759c28a56e28" />

# Bookie

A self-hosted ebook manager built for simplicity. Organize your library, fetch metadata, and send books directly to your eReader.

[![Discord](https://img.shields.io/discord/1408095311661891796?label=Discord&logo=discord&style=for-the-badge)](https://discord.gg/CrsSPrBwsC)

> This project is built with Claude.

<img width="100%" alt="Screenshot 2026-06-16 at 20-37-23 Bookie" src="https://github.com/user-attachments/assets/8ed10198-aa45-45a2-992e-39553d482aff" />

---

## Features

**Library Management**
- Multi-format support: EPUB, PDF, MOBI, AZW, AZW3, FB2, DJVU, CBZ, CBR, and TXT
- Automatic metadata fetching from Open Library, Apple Books, and Goodreads
- Cover extraction, search, and direct embedding into EPUB files
- Series tracking and tagging (think shelves, minus the complexity)

**Organization**
- Configurable file rename schemes and folder structures

<img width="862" height="606" alt="Screenshot 2026-06-16 at 8 38 37 PM" src="https://github.com/user-attachments/assets/7fb1a81f-0af5-4d79-ba37-f9853dd37ed8" />

>[!NOTE]
>When migrating from a different solution, it is recommended you import your books into Bookie to ensure proper metadata management.

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

## Companion Apps (Unoffical)
- Bookie Reader https://github.com/OmegaRa/Bookie-Reader

## License

MIT
