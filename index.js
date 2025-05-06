import { GlobalDurableObjectsFetchUrls } from "./global-durable-objects-fetch-urls";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle requests to the root path
    if (url.pathname === "/") {
      return new Response("Welcome to Global Durable Objects Fetch URLs!", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    // Handle all other paths
    const result = await handle(env, ctx);
    return new Response(result, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },

  async scheduled(event, env, ctx) {
    const result = await handle(env, ctx);
    console.log(result);
  },
};

export { GlobalDurableObjectsFetchUrls };

// The handle function remains unchanged
async function handle(env, ctx) {
  const MAX_URLS_PER_RUN = 50;
  const SELF_URL = 'https://global-fetch-urls.3coty.workers.dev/';

  const startTime = Date.now();

  // Fetch Durable Object stub
  const id = env.GlobalDurableObjectsFetchUrls.idFromName("control");
  const stub = env.GlobalDurableObjectsFetchUrls.get(id);

  // Get control information from Durable Object
  const control = await stub.fetch('https://dummy-url/control').then(res => res.json());

  if (!control || control.remaining <= 0) {
    return `✅ All URLs processed. Nothing left.`;
  }

  const { results: urls } = await env.DB.prepare(`
    SELECT id, url FROM global_sitemaps_urls
    WHERE status = 'pending'
    ORDER BY id ASC
    LIMIT ?
  `).bind(MAX_URLS_PER_RUN).all();

  let hit = 0, miss = 0, failed = 0;

  for (const { id, url } of urls) {
    let status = 'ERROR';

    try {
      const res = await fetch(url, { method: 'GET', cf: { cacheEverything: true } });
      const cfStatus = res.headers.get('cf-cache-status') || 'NONE';

      if (cfStatus === 'HIT') {
        status = 'HIT'; hit++;
      } else if (['MISS', 'EXPIRED', 'REVALIDATED'].includes(cfStatus)) {
        status = 'MISS'; miss++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    await env.DB.prepare(`
      UPDATE global_sitemaps_urls
      SET status = ?, last_run_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(status, id).run();
  }

  // Update control information in Durable Object
  await stub.fetch('https://dummy-url/update', {
    method: 'POST',
    body: JSON.stringify({ processed: urls.length }),
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  let output = `🧭 Processed ${urls.length} URLs in ${duration}s\n`;
  output += `✅ HIT: ${hit}\n📥 MISS: ${miss}\n❌ Failed: ${failed}`;

  const stillRemaining = control.remaining - urls.length;

  if (stillRemaining > 0) {
    ctx.waitUntil(fetch(SELF_URL));
    output += `\n🔁 More URLs remain (${stillRemaining}) — continuing...`;
  } else {
    output += `\n✅ All done.`;
  }

  return output;
}