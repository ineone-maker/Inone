-- Feed scoring and personalization
-- Creates materialized view for personalized feed ranking

CREATE MATERIALIZED VIEW IF NOT EXISTS public.feed_scores AS
SELECT
  v.id,
  v.user_id,
  v.caption,
  v.video_url,
  v.video_url_480p,
  v.thumb_url,
  v.duration,
  v.created_at,
  -- Engagement metrics
  COUNT(DISTINCT CASE WHEN i.event = 'imp' THEN i.user_id END)::INT as impression_count,
  COUNT(DISTINCT CASE WHEN i.event = 'w50' THEN i.user_id END)::INT as watched_50_count,
  COUNT(DISTINCT CASE WHEN i.event = 'skip' THEN i.user_id END)::INT as skip_count,
  COUNT(DISTINCT CASE WHEN i.event = 'like' THEN i.user_id END)::INT as like_count,
  -- Scoring formula: (likes * 3) + (w50 * 1) - (skips * 0.5) + recency bonus
  ROUND(
    (COUNT(DISTINCT CASE WHEN i.event = 'like' THEN i.user_id END) * 3.0) +
    (COUNT(DISTINCT CASE WHEN i.event = 'w50' THEN i.user_id END) * 1.0) -
    (COUNT(DISTINCT CASE WHEN i.event = 'skip' THEN i.user_id END) * 0.5) +
    -- Recency bonus: newer videos get higher scores
    (EXTRACT(EPOCH FROM (NOW() - v.created_at)) / 86400.0 / -10.0)::FLOAT,
    2
  )::FLOAT as score
FROM public.videos v
LEFT JOIN public.interactions i ON v.id = i.video_id
GROUP BY v.id, v.user_id, v.caption, v.video_url, v.video_url_480p, v.thumb_url, v.duration, v.created_at
ORDER BY score DESC;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_feed_scores_score ON public.feed_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_feed_scores_created_at ON public.feed_scores(created_at DESC);

-- Refresh materialized view
REFRESH MATERIALIZED VIEW CONCURRENTLY public.feed_scores;
