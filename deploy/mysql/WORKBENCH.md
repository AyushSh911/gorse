# MySQL Workbench → GCP Gorse

## Connection
- Name: `GCP Gorse`
- Hostname: `35.200.209.133`
- Port: `3306`
- Username: `gorse`
- Password: (on VM at `~/DurlabhDarshan/MySQL/.env` → `MYSQL_PASSWORD`)
- Default schema: `gorse`

## GCP firewall (do once)

UFW is already open. Open **VPC** firewall in project `techxr-dev`:

```bash
gcloud compute firewall-rules create allow-mysql-gorse \
  --project=techxr-dev \
  --direction=INGRESS \
  --priority=1000 \
  --network=default \
  --action=ALLOW \
  --rules=tcp:3306 \
  --source-ranges=0.0.0.0/0
```

Until that rule exists, Workbench from your laptop will time out.
