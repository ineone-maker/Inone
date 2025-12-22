# Inone - TikTok-like Video Sharing App

## Overview
Inone is a complete full-stack video sharing application with:
- **Flutter mobile app** - Record, compress, and share short videos (15 sec max, 720×1280)
- **Node.js/Express backend** - API for video management, feeds, interactions
- **Supabase database** - PostgreSQL with RLS and auth integration
- **Cloudflare R2** - Global object storage for videos and thumbnails
- **Cloudflare Worker CDN** - Serve clips with optimal caching and global distribution
- **GitHub Actions CI/CD** - Auto-build APK on every commit to main

## Current State
✓ Backend API running on port 3000
✓ Supabase database schema configured with 480p fallback support
✓ Flutter mobile app with pagination, preloading, and offline support
✓ Cloudflare Worker CDN ready for deployment
✓ GitHub Actions workflow configured for APK builds
✓ All environment variables securely stored

## Project Architecture

### Backend (Node.js/Express)
**File:** `api/index.js` (Port: 3000)

**Key Endpoints:**
- `POST /upload/presign` - Get presigned URL for R2 video upload
- `POST /upload/thumbnail` - Upload video thumbnail
- `POST /videos` - Create video metadata (with 480p fallback URL)
- `GET /feed?limit=20&offset=0` - Paginated video feed (20 videos per page)
- `GET /videos/:id` - Get video details with comments/likes
- `POST /videos/:id/like` - Like/unlike video
- `GET /videos/:id/comments` - Get video comments
- `POST /videos/:id/comments` - Post comment
- `POST /videos/:id/view` - Track video view
- `GET /users/:id` - Get user profile with video count
- `PUT /users/:id` - Update user profile

**Dependencies:**
- express, cors, dotenv
- @supabase/supabase-js (database)
- @aws-sdk/client-s3, @aws-sdk/s3-request-presigner (R2)

### Database (Supabase PostgreSQL)
**Schema:** `sql/01_schema.sql`

**Tables:**
- `users` - User profiles (username, display_name, avatar_url, bio)
- `videos` - Video metadata (video_url, video_url_480p fallback, thumb_url, duration, caption)
- `likes` - Video likes with unique constraint (user_id, video_id)
- `comments` - Video comments with timestamps
- `views` - Video view tracking with unique constraint

**Features:**
- Row Level Security (RLS) enabled on all tables
- Foreign key relationships with cascade delete
- Performance indexes on frequently queried columns
- Auth.users integration for user management

### Mobile App (Flutter)
**Directory:** `mobile/`

**Key Components:**
- `lib/main.dart` - Auth with Google OAuth, main feed UI
- `lib/services/feed_bloc.dart` - Feed state management with pagination
- `lib/services/video_service.dart` - API client with retry logic
- `lib/widgets/video_feed.dart` - PageView feed with preloading

**Advanced Features:**

1. **Pagination** - ScrollListener detects when user reaches end of feed, auto-loads next 20 videos
2. **Video Preloading** - Keeps 3 VideoPlayerController instances in memory
3. **Memory Management** - Auto-disposes oldest controller when scrolling away
4. **Offline Support** - CachedNetworkImage for thumbnails with fallback
5. **Bandwidth Guard** - Mobile logs CF-Cache-Status header to track CDN hits
6. **Fallback Quality** - On slow connections, mobile switches to 480p version (video_url_480p)
7. **Retry Logic** - Exponential backoff for failed uploads (max 3 attempts)

**UI Features:**
- Vertical PageView for smooth scrolling
- Video action buttons (like, comment, share)
- User info overlay (username, caption)
- Play button overlay
- Like/comment count display

### Cloudflare Worker CDN
**File:** `worker/src/index.js` & `worker/wrangler.toml`

**Features:**
- Serves videos and thumbnails from R2 via global CDN
- Cache headers: `public, max-age=3600, immutable`
- Returns `CF-Cache-Status` header (HIT/MISS/EXPIRED)
- CORS enabled for mobile app requests
- Automatic cache invalidation after 1 hour

**Deployment:**
```bash
cd worker
npm install -g wrangler
wrangler login
wrangler deploy
```

### CI/CD Pipeline
**File:** `.github/workflows/build-apk.yml`

**Triggers:** Push to main branch or pull requests

**Process:**
1. Checkout code
2. Setup Java & Flutter SDK (3.16.0)
3. Get dependencies (`flutter pub get`)
4. Build APK (`flutter build apk --release`)
5. Upload artifact (30-day retention)

**Output:** `inone-apk` artifact containing `app-release.apk`

## Environment Variables
All credentials are securely stored in Replit:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Public anon key for mobile app
- `SUPABASE_SERVICE_ROLE` - Backend-only service role
- `R2_ACCOUNT_ID` - Cloudflare R2 account ID
- `R2_ACCESS_KEY` - R2 API access key
- `R2_SECRET_KEY` - R2 API secret key
- `R2_BUCKET` - Bucket name: "inone"
- `RENDER_GIT_REPO` - GitHub repo URL

## Development Setup

### Backend
```bash
npm install
node api/index.js
```
Backend runs on `http://localhost:3000`

### Mobile
```bash
cd mobile
flutter pub get
flutter run
```

### Database
Run the schema SQL in Supabase SQL editor:
1. Go to Supabase Dashboard
2. SQL Editor
3. Copy contents of `sql/01_schema.sql`
4. Execute

### Worker
```bash
cd worker
npm install -g wrangler
wrangler login
wrangler deploy
```

## Workflow Configuration
- **Name:** Inone Backend
- **Command:** `node api/index.js`
- **Port:** 3000
- **Status:** Running ✓

## How It Works

### Video Upload Flow
1. **User records** video in Flutter app (15 sec, 720×1280)
2. **App requests presigned URL** from backend
3. **Mobile compresses** video with FFmpeg and creates thumbnail
4. **Direct upload to R2** using presigned URL
5. **Thumbnail upload** to R2 (`/thumbs/UUID.jpg`)
6. **Metadata submission** - App sends `POST /videos` with video/thumb URLs
7. **Backend stores** metadata in Supabase

### Feed Display Flow
1. **User opens app** → `GET /feed` loads 20 videos
2. **Videos display** via PageView (vertical scroll)
3. **Auto-play** when video enters viewport
4. **View tracked** → `POST /videos/:id/view`
5. **Pagination** - When user scrolls to end, load next 20
6. **Preloading** - Keep 3 controllers in memory for smooth playback
7. **Cache headers** - Worker logs CF-Cache-Status for bandwidth monitoring

### Bandwidth Optimization
- **CDN Serving**: Videos served through Cloudflare Worker
- **Cache Headers**: 1 hour immutable cache for already-watched clips
- **Fallback Quality**: Mobile switches to 480p on slow connections
- **Bandwidth Guard**: CF-Cache-Status header logged to track cache effectiveness
- **Expected CDN Hit Rate**: >90% on typical usage patterns

## Next Steps

1. **Deploy Supabase Schema**
   - Copy `sql/01_schema.sql` to Supabase SQL editor and execute

2. **Deploy Cloudflare Worker**
   - `cd worker && wrangler deploy`
   - Add custom domain (optional): Point `cdn.yourdomain.com` to Worker

3. **Build & Deploy Mobile App**
   - Local: `cd mobile && flutter pub get && flutter build apk --release`
   - Auto-build: Push to GitHub → GitHub Actions builds APK automatically

4. **Deploy Backend**
   - Click "Publish" button in Replit to get public URL
   - Update backend URL in mobile app config

5. **Test End-to-End**
   - Record video on Android device
   - Verify upload to R2
   - Check video appears in feed
   - Monitor CF-Cache-Status header

## Recent Changes
- December 22, 2025: Complete full-stack implementation with CDN, pagination, preloading, offline support, and GitHub Actions CI/CD
