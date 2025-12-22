/**
 * Cloudflare Worker
 * Serves R2 videos and thumbnails with optimal caching
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Only cache GET requests
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Route video and thumbnail requests to R2
    if (path.startsWith('/videos/') || path.startsWith('/thumbs/')) {
      return handleR2Request(request, env, path);
    }

    return new Response('Not found', { status: 404 });
  },
};

async function handleR2Request(request, env, path) {
  try {
    // Get the object from R2
    const object = await env.R2_BUCKET.get(path.slice(1)); // Remove leading slash

    if (!object === null) {
      return new Response('Not found', { status: 404 });
    }

    // Determine cache headers based on file type
    let cacheControl = 'public, max-age=3600, immutable';
    let contentType = 'application/octet-stream';

    if (path.endsWith('.mp4')) {
      contentType = 'video/mp4';
    } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    }

    // Return object with cache headers
    const headers = new Headers();
    headers.set('Cache-Control', cacheControl);
    headers.set('Content-Type', contentType);
    headers.set('CF-Cache-Status', 'HIT'); // Cloudflare sets this automatically
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('R2 fetch error:', error);
    return new Response('Server error', { status: 500 });
  }
}
