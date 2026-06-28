<img width="98" alt="bookie-icon" src="https://github.com/user-attachments/assets/46af76cc-8014-45b0-a664-97f09afd224a" />

# Bookie

A self-hosted ebook manager built for simplicity. Organize your library, fetch metadata, and send books directly to your eReader.

[![Discord](https://img.shields.io/discord/1408095311661891796?label=Discord&logo=discord&style=for-the-badge)](https://discord.gg/CrsSPrBwsC)

> This project is built with Claude.

<img width="100%" alt="Bookie UI" src="https://github.com/user-attachments/assets/e0755ecb-c6f7-4ed3-b57e-337dd64876e7" />

---

## Features

**Library Management**
- Multi-format support: EPUB, PDF, MOBI, AZW, AZW3, FB2, DJVU, CBZ, CBR, and TXT
- Automatic metadata fetching from Open Library, Apple Books, and Goodreads
- Cover extraction, search, and direct embedding into EPUB files
- Series tracking and tagging (think shelves, minus the complexity)

**Organization**
- Configurable file rename schemes and folder structures

<img width="807" height="555" alt="image" src="https://github.com/user-attachments/assets/0cfdb669-6d8e-405f-8bb6-4edea042438e" />

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
