interface Env {
  ASSETS: { fetch: typeof fetch };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── Archidekt proxy ────────────────────────────────────────────────────
    // Proxies requests to the Archidekt API to avoid CORS issues in the browser.
    if (url.pathname === "/api/archidekt") {
      const deckId = url.searchParams.get("id");

      if (!deckId || !/^\d+$/.test(deckId)) {
        return new Response(JSON.stringify({ error: "Invalid deck ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const upstream = await fetch(
        `https://archidekt.com/api/decks/${deckId}/`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Fetchlist/1.0 (https://fetchlist.app)",
          },
        }
      );

      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ── All other requests → static assets (SPA) ──────────────────────────
    return env.ASSETS.fetch(request);
  },
};
