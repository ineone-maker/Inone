-- Daily rollup script for Inone analytics
-- Run daily at 2 AM UTC via GitHub Action

-- Create materialized view for video scores
CREATE MATERIALIZED VIEW IF NOT EXISTS public.video_scores AS
SELECT
  v.id,
  v.caption,
  COUNT(DISTINCT CASE WHEN i.event = 'imp' THEN i.user_id END) as impression_count,
  COUNT(DISTINCT CASE WHEN i.event = 'w50' THEN i.user_id END) as watched_50_count,
  COUNT(DISTINCT CASE WHEN i.event = 'skip' THEN i.user_id END) as skip_count,
  COUNT(DISTINCT CASE WHEN i.event = 'like' THEN i.user_id END) as like_count,
  COUNT(DISTINCT CASE WHEN i.event IN ('imp', 'w50', 'like') THEN i.user_id END) as engagement_count,
  ROUND(
    COUNT(DISTINCT CASE WHEN i.event IN ('imp', 'w50', 'like') THEN i.user_id END)::FLOAT / 
    NULLIF(COUNT(DISTINCT CASE WHEN i.event = 'imp' THEN i.user_id END), 0) * 100,
    2
  ) as engagement_rate,
  MAX(i.created_at) as last_interaction,
  v.created_at
FROM public.videos v
LEFT JOIN public.interactions i ON v.id = i.video_id
GROUP BY v.id, v.caption, v.created_at;

-- Create index on materialized view for faster queries
CREATE INDEX IF NOT EXISTS idx_video_scores_engagement_rate 
  ON public.video_scores(engagement_rate DESC);

-- Refresh materialized view (can be done incrementally in production)
REFRESH MATERIALIZED VIEW CONCURRENTLY public.video_scores;

-- Update video counts from interactions
UPDATE public.videos v SET
  like_count = COALESCE((
    SELECT COUNT(*) FROM public.interactions 
    WHERE video_id = v.id AND event = 'like'
  ), 0)
WHERE EXISTS (
  SELECT 1 FROM public.interactions WHERE video_id = v.id
);
