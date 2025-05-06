export class GlobalFetchUrls {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/lock") {
      const locked = await this.state.storage.get("running");
      if (locked) {
        return new Response("Already running", { status: 423 });
      }
      await this.state.storage.put("running", true);
      return new Response("Locked");
    }

    if (url.pathname === "/unlock") {
      await this.state.storage.delete("running");
      return new Response("Unlocked");
    }

    return new Response("Invalid path", { status: 400 });
  }
}