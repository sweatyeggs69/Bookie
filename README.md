# Bookie

Bookie is a stupidly simple eBook management, designed for those who only need to organize books and send files to their eReader.

> [!NOTE]
> Yes, I did build this with Claude. <img width="16px" alt="bookie-ui" src="https://github.com/user-attachments/assets/65e5a331-3668-420f-8339-64c666e9af72" />


<img width="100%" alt="bookie-ui" src="https://github.com/user-attachments/assets/e0755ecb-c6f7-4ed3-b57e-337dd64876e7" />

## Features

- Multi-format support (EPUB, PDF, MOBI, AZW3, CBZ, etc.)
- Automatic metadata fetching
- Cover image extraction, search, and embedding
- Send to eReader via SMTP
- Configurable file rename schemes and folder organization
- PWA support
- Dark & Light mode for the UI
- Tagging (acts like shelves, but less complicated)
- Series support

## Metadata Basics
Everything you need for eReader-relevant metadata

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
      - SESSION_COOKIE_SECURE=false #Required if accessing via HTTP
    restart: unless-stopped

```

## License

MIT
