export class GlobalFetchController {
  constructor(env, ctx) {
    this.env = env;
    this.ctx = ctx;
  }

  async handleRequest(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/manual-run") {
      return await this.executeJob();
    }

    return new Response("Not Found", { status: 404 });
  }

  async handleScheduled() {
    return await this.executeJob();
  }

  async executeJob() {
    const id = this.env.GLOBAL_FETCH_URLS.idFromName("singleton");
    const stub = this.env.GLOBAL_FETCH_URLS.get(id);

    // Try to acquire lock
    const lockRes = await stub.fetch("https://do/lock");
    if (lockRes.status === 423) {
      return new Response("Job already running", { status: 423 });
    }

    try {
      // TODO: Your actual DB query & logic goes here
      const { results } = await this.env.DB.prepare(`
        SELECT id, url FROM global_sitemaps_urls
        LIMIT 20;
      `).all();

      // Simulate processing
      for (const row of results) {
        console.log("Processing URL:", row.url);
      }

      // Example update
      await this.env.DB.prepare(`
        UPDATE global_sitemaps_control SET remaining = remaining - ?
      `).bind(results.length).run();

    } finally {
      await stub.fetch("https://do/unlock");
    }

    return new Response("Completed");
  }
}
