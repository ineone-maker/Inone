# Inone - TikTok-like Video Sharing App

## Overview
Inone is a full-stack video sharing application with a Flutter mobile app, Node.js/Express backend API, and Supabase database. Users can record, compress, and share short videos with a social feed featuring likes, comments, and video views.

## Current State
✓ Backend API running on port 3000
✓ Supabase database schema configured
✓ Flutter mobile app structure initialized
✓ Environment variables set with Supabase and Cloudflare R2 credentials

## Project Architecture

### Backend (Node.js/Express)
**File:** `api/index.js` (Port: 3000)

**Key Endpoints:**
- `POST /upload/presign` - Get presigned URL for direct R2 video upload
- `POST /upload/thumbnail` - Upload video thumbnail
- `POST /videos` - Create video metadata
- `GET /feed?limit=20&offset=0` - Paginated video feed
- `GET /videos/:id` - Get video details with comments/likes
- `POST /videos/:id/like` - Like/unlike video
- `GET /videos/:id/comments` - Get video comments
- `POST /videos/:id/comments` - Post comment
- `POST /videos/:id/view` - Track video view
- `GET /users/:id` - Get user profile
- `PUT /users/:id` - Update user profile

**Dependencies:**
- express, cors, dotenv
- @supabase/supabase-js (database)
- @aws-sdk/* (R2/S3 storage)

### Database (Supabase PostgreSQL)
**Schema:** `sql/01_schema.sql`

**Tables:**
- `users` - User profiles with auth integration
- `videos` - Video metadata (URL, thumbnail, duration, captions)
- `likes` - Video likes with user/video references
- `comments` - Video comments
- `views` - Video view tracking

**Features:**
- Row Level Security (RLS) enabled on all tables
- Foreign key relationships with cascade delete
- Performance indexes on frequently queried columns
- Auth.users integration for user management

### Mobile App (Flutter)
**Directory:** `mobile/`

**Key Files:**
- `pubspec.yaml` - Dependencies (camera, video_player, ffmpeg_kit, supabase_flutter)
- `lib/main.dart` - Auth with Google OAuth and basic feed UI

**Planned Features:**
1. Camera recording (15 sec max, 720×1280)
2. FFmpeg compression
3. R2 presigned upload
4. Thumbnail generation
5. Metadata submission
6. PageView feed with video preloading

## Environment Variables
All credentials are securely stored:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE` - Service role key (backend only)
- `R2_ACCOUNT_ID` - Cloudflare R2 account
- `R2_ACCESS_KEY` - R2 access credentials
- `R2_SECRET_KEY` - R2 secret credentials
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
```
Copy contents of sql/01_schema.sql to Supabase → SQL editor → Execute
```

## Workflow Configuration
- **Name:** Inone Backend
- **Command:** `node api/index.js`
- **Port:** 3000
- **Status:** Running ✓

## Next Steps
1. Test backend endpoints with curl/Postman
2. Set up Flutter camera recording service
3. Implement FFmpeg compression pipeline
4. Build video upload flow with presigned URLs
5. Create feed UI with PageView and video preloading
6. Add authentication handling in mobile app

## Recent Changes
- December 22, 2025: Complete project scaffolding with backend API, database schema, and Flutter structure
