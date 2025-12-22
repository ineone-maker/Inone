import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

/**
 * Bulk insert interactions
 * POST /interactions
 * Body: {
 *   events: [
 *     { eventId, userId, videoId, event, timestamp }
 *   ]
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { events } = req.body;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Invalid events array' });
    }

    // Check user privacy settings before inserting
    const userIds = [...new Set(events.map(e => e.userId))];
    const { data: settings } = await supabase
      .from('settings')
      .select('user_id, do_not_track')
      .in('user_id', userIds);

    const doNotTrackUsers = new Set(
      (settings || []).filter(s => s.do_not_track).map(s => s.user_id)
    );

    // Filter out events from users with do_not_track enabled
    const filteredEvents = events.filter(e => !doNotTrackUsers.has(e.userId));

    if (filteredEvents.length === 0) {
      return res.json({ inserted: 0, skipped: events.length });
    }

    // Prepare data for insertion
    const interactionsData = filteredEvents.map(event => ({
      event_id: event.eventId, // UUID for idempotency
      user_id: event.userId,
      video_id: event.videoId,
      event: event.event, // 'imp', 'w50', 'skip', 'like'
      created_at: event.timestamp || new Date().toISOString(),
    }));

    // Bulk insert with ignore on duplicate event_id
    const { data, error } = await supabase
      .from('interactions')
      .insert(interactionsData)
      .select();

    if (error) {
      // If error is due to unique constraint, silently continue (idempotency)
      if (error.code === '23505') {
        return res.json({ inserted: 0, message: 'Duplicate events ignored' });
      }
      throw error;
    }

    res.json({
      inserted: data?.length || 0,
      skipped: doNotTrackUsers.size,
      total: events.length,
    });
  } catch (error) {
    console.error('Interactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get user privacy settings
 * GET /interactions/settings/:userId
 */
router.get('/settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('settings')
      .select('do_not_track')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

    res.json({
      doNotTrack: data?.do_not_track || false,
    });
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update user privacy settings
 * PUT /interactions/settings/:userId
 */
router.put('/settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { doNotTrack } = req.body;

    const { data, error } = await supabase
      .from('settings')
      .upsert(
        {
          user_id: userId,
          do_not_track: doNotTrack,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
