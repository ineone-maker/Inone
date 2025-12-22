# Inone CDN Worker

Cloudflare Worker for serving Inone video clips and thumbnails with optimal caching.

## Features

- **Presigned URL Generation**: Direct uploads to R2
- **Cache Control**: Immutable cache headers for 1 hour TTL
- **Cache Status Header**: Returns `CF-Cache-Status` to monitor CDN hits
- **CORS Support**: Allows cross-origin requests from mobile apps
- **Bandwidth Optimization**: Serve clips from R2 through Cloudflare's global network

## Setup

### 1. Install Wrangler
```bash
npm install -g wrangler
```

### 2. Authenticate with Cloudflare
```bash
wrangler login
```

### 3. Bind R2 Bucket
Update `wrangler.toml` with your R2 bucket name and ensure it's bound:
```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "inone"
```

### 4. Deploy Worker
```bash
wrangler deploy
```

## Monitoring Cache Performance

The worker returns `CF-Cache-Status` header in responses:
- **HIT**: Served from Cloudflare cache
- **MISS**: Served from R2 origin
- **EXPIRED**: Cache expired, refreshed from origin

Mobile app logs this header to track cache efficiency.

## Routes

- `GET /videos/{videoId}` - Serve video MP4 file
- `GET /thumbs/{videoId}.jpg` - Serve video thumbnail

## Environment Variables

Set in `wrangler.toml`:
- `R2_BUCKET` - Name of your R2 bucket
