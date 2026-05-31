# CDN setup: Cloudflare + R2 (or MinIO behind CDN)

Gachify serves HLS segments via presigned URLs. Point `GACHIFY_CDN_BASE_URL` at your CDN origin so segment URLs are rewritten to the edge.

## Cloudflare + R2

1. Create an **R2 bucket** (or use existing MinIO sync to R2 via `mc mirror`).
2. In Cloudflare dashboard → R2 → bucket → **Settings** → enable public access or use signed URLs via Workers (Gachify uses presigned URLs from S3-compatible API).
3. Add a **Custom Domain** for the bucket, e.g. `cdn.yourdomain.com`.
4. Set in production `.env`:

```env
GACHIFY_CDN_BASE_URL=https://cdn.yourdomain.com
GACHIFY_S3_PUBLIC_ENDPOINT=https://cdn.yourdomain.com
GACHIFY_HLS_SEGMENT_PRESIGN_TTL=24h
```

5. Ensure CORS on the bucket allows your web origin (`GACHIFY_CORS_ORIGINS`).

## MinIO only (dev / self-hosted)

Leave `GACHIFY_CDN_BASE_URL` empty. Segments use `GACHIFY_S3_PUBLIC_ENDPOINT` (default `http://localhost:9000`).

## Worker scaling

Docker Compose prod uses `GACHIFY_WORKER_REPLICAS` (default `2`). For Kubernetes, run a separate Deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gachify-worker
spec:
  replicas: 3
  selector:
    matchLabels: { app: gachify-worker }
  template:
    metadata:
      labels: { app: gachify-worker }
    spec:
      containers:
        - name: worker
          image: gachify-worker:latest
          envFrom:
            - secretRef: { name: gachify-env }
```

Scale on queue depth (`gachify_queue_depth{queue="pending"}`) via HPA or manual ops.
