# MinIO data

This directory is mounted by the optional Docker Compose `with-minio` profile.

Use it when you want local S3-compatible artifact storage instead of the
filesystem storage provider:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml --profile with-minio up -d
```

Keep bucket data out of Git.
