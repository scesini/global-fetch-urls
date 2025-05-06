// Durable Object implementation
export class GlobalDurableObjectsFetchUrls {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/control') {
      // Return the current control state
      const control = await this.state.storage.get('control') || { processed: 0, remaining: 1000 };
      return new Response(JSON.stringify(control), { headers: { 'content-type': 'application/json' } });
    }

    if (url.pathname === '/update') {
      const { processed } = await request.json();
      const control = await this.state.storage.get('control') || { processed: 0, remaining: 1000 };

      // Update the control state
      control.processed += processed;
      control.remaining -= processed;

      await this.state.storage.put('control', control);
      return new Response('Updated');
    }

    return new Response('Not Found', { status: 404 });
  }
}