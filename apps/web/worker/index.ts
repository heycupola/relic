import handler from "vinext/server/app-router-entry";

export default {
  async fetch(request: Request): Promise<Response> {
    return handler.fetch(request);
  },
};
