import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import interactionsRouter from './routes/interactions.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/interactions', interactionsRouter);

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

// R2/S3 client
const r2Client = new S3Client({
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
});

// LRU Cache for personalized feeds (5 min TTL, max 100 entries)
class LRUCache {
  constructor(maxSize = 100, ttl = 300000) { // 5 minutes TTL
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const entry = this.cache.get(key);
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { data: value, timestamp: Date.now() });
  }

  clear() {
    this.cache.clear();
  }
}

const feedCache = new LRUCache(100, 300000); // 100 entries, 5 min TTL

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============== UPLOAD ENDPOINTS ==============

// 1. Get presigned URL for video upload
app.post('/upload/presign', async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    const videoId = uuidv4();
    const key = `videos/${videoId}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: fileType,
    });

    const url = await getSignedUrl(r2Client, command, { expiresIn: 3600 });

    res.json({
      videoId,
      url,
      key,
    });
  } catch (error) {
    console.error('Presign error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Upload thumbnail
app.post('/upload/thumbnail', async (req, res) => {
  try {
    const { videoId, base64Data } = req.body;
    const key = `thumbs/${videoId}.jpg`;

    const buffer = Buffer.from(base64Data, 'base64');

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
    });

    await r2Client.send(command);

    const thumbUrl = `https://${process.env.R2_BUCKET}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

    res.json({ thumbUrl });
  } catch (error) {
    console.error('Thumbnail upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============== VIDEO ENDPOINTS ==============

// 3. Create video metadata (with 480p fallback version)
app.post('/videos', async (req, res) => {
  try {
    const { userId, videoId, caption, videoUrl, thumbUrl, duration } = req.body;
    
    // Create 480p fallback URL
    const url480p = videoUrl.replace(/\.mp4$/, '_480p.mp4');

    const { data, error } = await supabase
      .from('videos')
      .insert({
        id: videoId,
        user_id: userId,
        caption,
        video_url: videoUrl,
        video_url_480p: url480p,
        thumb_url: thumbUrl,
        duration,
      })
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (error) {
    console.error('Video creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Get feed (personalized or global)
app.get('/feed', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const userId = req.query.user; // UUID of user requesting feed
    const feedVersion = parseInt(req.query.v) || 1; // A/B test version
    const cacheKey = `feed:${userId}:${feedVersion}:${offset}`;

    // Check cache
    const cached = feedCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // If no userId, return global top feed
    if (!userId) {
      const { data, error, count } = await supabase
        .from('feed_scores')
        .select('*, users:user_id(id, username, display_name, avatar_url)', { count: 'exact' })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const response = {
        videos: data,
        total: count,
        limit,
        offset,
        personalized: false,
      };

      feedCache.set(cacheKey, response);
      return res.json(response);
    }

    // Personalized feed: exclude videos user has already interacted with
    // Cold-start: if user has < 5 interactions, show global top feed
    const { count: interactionCount } = await supabase
      .from('interactions')
      .select('id', { count: 'exact' })
      .eq('user_id', userId);

    if ((interactionCount || 0) < 5) {
      // Cold-start: show global top videos
      const { data, error, count } = await supabase
        .from('feed_scores')
        .select('*, users:user_id(id, username, display_name, avatar_url)', { count: 'exact' })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const response = {
        videos: data,
        total: count,
        limit,
        offset,
        personalized: false,
        coldStart: true,
      };

      feedCache.set(cacheKey, response);
      return res.json(response);
    }

    // Get videos user has already seen
    const { data: seenVideos, error: seenError } = await supabase
      .from('interactions')
      .select('video_id')
      .eq('user_id', userId);

    if (seenError) throw seenError;

    const seenVideoIds = (seenVideos || []).map(v => v.video_id);

    // Get personalized feed excluding seen videos
    let query = supabase
      .from('feed_scores')
      .select('*, users:user_id(id, username, display_name, avatar_url)', { count: 'exact' });

    if (seenVideoIds.length > 0) {
      query = query.not('id', 'in', `(${seenVideoIds.join(',')})`);
    }

    const { data, error, count } = await query
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const response = {
      videos: data,
      total: count,
      limit,
      offset,
      personalized: true,
      feedVersion,
    };

    feedCache.set(cacheKey, response);
    res.json(response);
  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Get video details
app.get('/videos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('videos')
      .select('*, users:user_id(id, username, display_name, avatar_url), likes(id), comments(id)')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Video details error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Like/unlike video
app.post('/videos/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    // Check if already liked
    const { data: existing } = await supabase
      .from('likes')
      .select('id')
      .eq('video_id', id)
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Unlike
      await supabase
        .from('likes')
        .delete()
        .eq('video_id', id)
        .eq('user_id', userId);

      res.json({ liked: false });
    } else {
      // Like
      await supabase
        .from('likes')
        .insert({ video_id: id, user_id: userId });

      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Get comments for video
app.get('/videos/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const { data, error } = await supabase
      .from('comments')
      .select('*, users:user_id(id, username, display_name, avatar_url)')
      .eq('video_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Comments error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Post comment
app.post('/videos/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, text } = req.body;

    const { data, error } = await supabase
      .from('comments')
      .insert({ video_id: id, user_id: userId, text })
      .select('*, users:user_id(id, username, display_name, avatar_url)');

    if (error) throw error;

    res.json(data[0]);
  } catch (error) {
    console.error('Comment creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 9. Track video view
app.post('/videos/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    // Insert view (will ignore duplicate due to unique constraint)
    await supabase
      .from('views')
      .insert({ video_id: id, user_id: userId })
      .select();

    res.json({ success: true });
  } catch (error) {
    console.error('View tracking error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============== USER ENDPOINTS ==============

// 10. Get user profile
app.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    // Get user's videos
    const { data: videos } = await supabase
      .from('videos')
      .select('id, thumb_url, duration')
      .eq('user_id', id)
      .order('created_at', { ascending: false });

    res.json({
      ...data,
      videoCount: videos?.length || 0,
      videos,
    });
  } catch (error) {
    console.error('User profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 11. Update user profile
app.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName, bio, avatarUrl, feedVersion } = req.body;

    const { data, error } = await supabase
      .from('users')
      .update({
        display_name: displayName,
        bio,
        avatar_url: avatarUrl,
        feed_version: feedVersion || 1, // A/B testing
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (error) {
    console.error('User update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ Inone backend running on http://0.0.0.0:${PORT}`);
  console.log('✓ API ready for video uploads, feeds, and interactions');
});
