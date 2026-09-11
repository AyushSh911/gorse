# VM MySQL for Gorse

On the GCP VM:

```bash
docker network create durlabh-net || true
mkdir -p ~/DurlabhDarshan/MySQL
# copy docker-compose.yml + .env here
chmod 600 .env
docker compose up -d
```

Workbench: `35.200.209.133:3306`, user `gorse`, schema `gorse`.
