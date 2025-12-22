# Inone - TikTok-like Video Sharing App

## Overview
Inone is a complete full-stack video sharing application with:
- **Flutter mobile app** - Record, compress, and share short videos (15 sec max, 720×1280)
- **Node.js/Express backend** - API for video management, personalized feeds, analytics
- **Supabase database** - PostgreSQL with RLS, auth, and analytics tracking
- **Cloudflare R2** - Global object storage for videos and thumbnails
- **Cloudflare Worker CDN** - Serve clips with optimal caching
- **GitHub Actions CI/CD** - Auto-build APK on every commit to main
- **Personalized Feed Engine** - Collaborative filtering with scoring algorithm
- **Analytics Engine** - Event tracking, batch processing, privacy controls, rollups

## Current State
✓ Backend API running on port 3000
✓ Supabase database schema with personalized feed support
✓ Flutter mobile app with analytics and feed management
✓ LRU cache layer for feed performance (100 entries, 5 min TTL)
✓ Personalized feed ranking with engagement metrics
✓ Cold-start handling for new users
✓ A/B testing support with feed_version parameter
✓ All environment variables securely stored

## Project Architecture

### Backend (Node.js/Express)
**File:** `api/index.js` (Port: 3000)

**Key Endpoints:**
- `POST /upload/presign` - Get presigned URL for R2 video upload
- `POST /upload/thumbnail` - Upload video thumbnail
- `POST /videos` - Create video metadata
- **`GET /feed?user=UUID&v=1`** - Personalized or global feed (with LRU cache)
- `GET /videos/:id` - Get video details
- `POST /videos/:id/like` - Like/unlike video
- `GET /videos/:id/comments` - Get video comments
- `POST /videos/:id/comments` - Post comment
- `POST /videos/:id/view` - Track video view
- `GET /users/:id` - Get user profile
- `PUT /users/:id` - Update user profile (supports feed_version)
- `POST /interactions` - Bulk insert analytics events
- `GET /interactions/settings/:userId` - Get privacy settings
- `PUT /interactions/settings/:userId` - Update privacy settings

**Features:**
- LRU cache for personalized feeds (100 entries max, 5 min TTL)
- A/B testing with feed_version parameter
- Cold-start detection and global top feed for new users
- Seen video filtering for personalized feeds

### Database (Supabase PostgreSQL)
**Schema:** `sql/01_schema.sql` + `sql/02_rollup.sql` + `sql/03_score.sql`

**Tables:**
- `users` - User profiles with feed_version for A/B testing
- `videos` - Video metadata (with ai_caption field for future use)
- `likes`, `comments`, `views` - Social features
- `interactions` - Analytics events with idempotency
- `settings` - Privacy settings (do_not_track)
- **`feed_scores`** - Materialized view with engagement scoring

**Materialized Views:**
- **`feed_scores`** - Ranked videos by engagement score (formula: 3×likes + 1×w50 - 0.5×skips + recency_bonus)
- **`video_scores`** - Daily engagement metrics from rollup

**Scoring Algorithm:**
```
score = (likes * 3) + (watched_50 * 1) - (skips * 0.5) + recency_bonus
- Likes heavily weighted (×3)
- Watched 50% moderately weighted (×1)
- Skips penalized (×-0.5)
- Recent videos get bonus
- Result: Highest quality content ranked first
```

### Mobile App (Flutter)
**Directory:** `mobile/`

**Components:**
- `lib/main.dart` - Auth and feed UI
- `lib/services/feed_bloc.dart` - Feed state with pagination
- `lib/services/video_service.dart` - API client with retry
- `lib/services/analytics_service.dart` - Event tracking with batch sending
- `lib/widgets/video_feed.dart` - PageView with analytics
- `lib/widgets/caption_generator.dart` - AI caption support (optional)

**Features:**
- Pagination with auto-load at end of list
- Video preloading (3 controllers in memory)
- Event tracking (imp, w50, skip, like) with UUID idempotency
- Batch event sending (5s or 10 items)
- Privacy mode support
- Offline thumbnail support
- Fallback to 480p on slow connections

### Feed Ranking System

**Personalized Feed (logged-in users with 5+ interactions):**
1. Query `feed_scores` materialized view
2. Filter out videos user has already seen (from interactions table)
3. Return top 20 ranked by score descending
4. Cached for 5 minutes (LRU cache)

**Global Top Feed (new users < 5 interactions):**
1. Show top 50 videos by score
2. No filtering
3. Continues until user builds history

**Feed Versions (A/B Testing):**
- Users have `feed_version` column (default=1)
- Mobile sends `?v=1` parameter
- Deploy new algorithms without breaking old builds
- Gradual rollout capability

### Cloudflare Worker CDN
**File:** `worker/src/index.js`

**Features:**
- Serves R2 videos/thumbnails with 1hr cache
- Returns CF-Cache-Status header
- CORS enabled for mobile
- Global edge distribution

### Analytics Pipeline
**Event Flow:**
1. Mobile tracks: imp, w50, skip, like
2. Queue in-memory with UUID
3. Batch send every 5s or 10 items
4. Server validates user privacy settings
5. Store in interactions table
6. Daily rollup updates materialized views

**Privacy:**
- Users can enable do_not_track
- Server checks before inserting events
- No tracking if privacy enabled

### CI/CD Pipeline
**Files:**
- `.github/workflows/build-apk.yml` - APK build on push to main
- `.github/workflows/rollup-stats.yml` - Daily 2 AM UTC rollup

## Environment Variables
All securely stored:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`
- `RENDER_GIT_REPO`

## Development Setup

**Backend:**
```bash
npm install
node api/index.js
```

**Mobile:**
```bash
cd mobile
flutter pub get
flutter build apk --release
```

**Database:**
1. Run `sql/01_schema.sql` in Supabase
2. Run `sql/02_rollup.sql` for analytics
3. Run `sql/03_score.sql` for feed scoring

**Worker:**
```bash
cd worker && wrangler deploy
```

## Workflow Configuration
- **Name:** Inone Backend
- **Command:** `node api/index.js`
- **Port:** 3000
- **Status:** Running ✓

## How It Works

### Feed Retrieval Flow
1. **No user** → GET /feed → Global top 50 videos
2. **New user** (< 5 interactions) → GET /feed?user=UUID → Global top 50
3. **Active user** (5+ interactions) → GET /feed?user=UUID → Personalized feed
   - Query feed_scores materialized view
   - Filter out seen videos
   - Return ranked by engagement score
   - Cached for 5 minutes

### Demo: Different Feeds
- User A likes videos about fitness → feed prioritizes fitness content
- User B likes music videos → feed prioritizes music
- Same global top feed until 5 interactions
- Different personalized feeds after that

### Performance Optimizations
- **LRU Cache**: Last 100 personalized feeds cached for 5 min
- **Materialized View**: Pre-calculated scores, fast queries
- **Indexing**: Scores indexed for fast sorting
- **Pagination**: Load 20 at a time, avoid large result sets
- **Seen filtering**: Only exclude videos user interacted with

## Next Steps

1. **Deploy Supabase Schema**
   - Execute `sql/01_schema.sql`, `sql/02_rollup.sql`, `sql/03_score.sql`

2. **Test Feed Ranking**
   - Create 2 test users
   - User A: Like fitness videos
   - User B: Like music videos
   - Verify different feeds returned

3. **Deploy Backend**
   - Click "Publish" in Replit
   - Update mobile app with backend URL

4. **Build APK**
   - `cd mobile && flutter build apk --release`

5. **GitHub Secrets**
   - Add SUPABASE_URL and SUPABASE_SERVICE_ROLE for rollups

## Recent Changes
- December 22, 2025: Complete personalized feed system with:
  - Feed scoring materialized view with engagement algorithm
  - Personalized feed ranking by score
  - LRU cache layer for performance (100 entries, 5 min TTL)
  - A/B testing with feed_version parameter
  - Cold-start handling (global top feed for <5 interactions)
  - Seen video filtering for personalized feeds
  - Caption generation support structure (optional)
