import { GlobalFetchController } from './global-fetch-controller.js';
import { GlobalDurableObjectsFetchUrls } from './global-durable-objects-fetch-urls.js'; // Keep this valid import

export default {
  async fetch(request, env, ctx) {
    const controller = new GlobalFetchController(env, ctx);
    return controller.handleRequest(request);
  },

  async scheduled(event, env, ctx) {
    const controller = new GlobalFetchController(env, ctx);
    return controller.handleScheduled();
  },
};

export { GlobalDurableObjectsFetchUrls }; // Ensure this is exported