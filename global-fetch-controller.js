export class GlobalFetchController {
  constructor(env, ctx) {
    this.env = env;
    this.ctx = ctx;
    this.MAX_URLS_PER_RUN = 20;
  }

  async handleRequest() {
    return this.run();
  }

  async handleScheduled() {
    return this.run();
  }

  async run() {
    const lockId = this.env.GLOBAL_FETCH_URLS.idFromName("lock");
    const stub = this.env.GLOBAL_FETCH_URLS.get(lockId);

    const lock = await stub.fetch("https://lock");
    if (lock.status === 423) {
      return new Response("Already running", { status: 429 });
    }

    try {
      while (true) {
        const { results } = await this.env.DB.prepare(
          "SELECT remaining FROM global_sitemaps_control WHERE id = 1"
        ).all();

        if (!results.length || results[0].remaining <= 0) break;

        await this.processBatch();
      }

      return new Response("✅ All URLs processed");
    } finally {
      await stub.fetch("https://unlock");
    }
  }

  async processBatch() {
    const urls = await this.env.DB.prepare(`
      SELECT id, url FROM global_sitemaps_urls
      WHERE fetched IS NULL
      LIMIT ?
    `).bind(this.MAX_URLS_PER_RUN).all();

    for (const row of urls.results) {
      try {
        const res = await fetch(row.url);
        await this.env.DB.prepare(`
          UPDATE global_sitemaps_urls
          SET fetched = CURRENT_TIMESTAMP, status = ?
          WHERE id = ?
        `).bind(res.status, row.id).run();
      } catch {
        await this.env.DB.prepare(`
          UPDATE global_sitemaps_urls
          SET fetched = CURRENT_TIMESTAMP, status = 0
          WHERE id = ?
        `).bind(row.id).run();
      }
    }

    await this.env.DB.prepare(`
      UPDATE global_sitemaps_control
      SET processed = processed + ?, remaining = remaining - ?, last_run_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).bind(urls.results.length, urls.results.length).run();
  }
}
