import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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

// 4. Get feed (paginated)
app.get('/feed', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const { data, error, count } = await supabase
      .from('videos')
      .select('*, users:user_id(id, username, display_name, avatar_url)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      videos: data,
      total: count,
      limit,
      offset,
    });
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
    const { displayName, bio, avatarUrl } = req.body;

    const { data, error } = await supabase
      .from('users')
      .update({
        display_name: displayName,
        bio,
        avatar_url: avatarUrl,
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
