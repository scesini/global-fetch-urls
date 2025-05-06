export class GlobalFetchController {
  constructor(env, ctx) {
    this.env = env;
    this.ctx = ctx;
    this.MAX_URLS_PER_RUN = 20;
  }

  async handleRequest(request) {
    return this.run();
  }

  async handleScheduled() {
    return this.run();
  }

  async run() {
    const objId = this.env.GLOBAL_FETCH_URLS.idFromName("execution-lock");
    const stub = this.env.GLOBAL_FETCH_URLS.get(objId);

    const lockRes = await stub.fetch("https://lock");
    if (lockRes.status === 423) {
      return new Response("Another job is already running", { status: 429 });
    }

    try {
      while (true) {
        const { results } = await this.env.DB.prepare(
          'SELECT remaining FROM global_sitemaps_control WHERE id = 1 LIMIT 1'
        ).all();

        const control = results[0];
        if (!control || control.remaining <= 0) break;

        await this.processBatch();
      }

      return new Response("✅ Done: All URLs processed");
    } finally {
      await stub.fetch("https://unlock");
    }
  }

  async processBatch() {
    const urlsQuery = await this.env.DB.prepare(`
      SELECT id, url FROM global_sitemaps_urls
      WHERE fetched IS NULL
      LIMIT ?
    `).bind(this.MAX_URLS_PER_RUN).all();

    const urls = urlsQuery.results;

    for (const { id, url } of urls) {
      try {
        const res = await fetch(url);
        await this.env.DB.prepare(`
          UPDATE global_sitemaps_urls
          SET fetched = CURRENT_TIMESTAMP, status = ?
          WHERE id = ?
        `).bind(res.status, id).run();
      } catch (err) {
        await this.env.DB.prepare(`
          UPDATE global_sitemaps_urls
          SET fetched = CURRENT_TIMESTAMP, status = 0
          WHERE id = ?
        `).bind(id).run();
      }
    }

    await this.env.DB.prepare(`
      UPDATE global_sitemaps_control
      SET processed = processed + ?, remaining = remaining - ?, last_run_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).bind(urls.length, urls.length).run();
  }
}