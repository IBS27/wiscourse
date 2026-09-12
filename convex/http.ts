import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// GET /ics/<secret>.ics — the private calendar feed. The secret in the
// path is the only credential; see convex/prefs.ts.
http.route({
  pathPrefix: "/ics/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const path = new URL(request.url).pathname;
    const match = /^\/ics\/([A-Za-z0-9]{32,128})\.ics$/.exec(path);
    if (match === null) return new Response("Not found", { status: 404 });
    const secret = match[1];
    const body = await ctx.runQuery(internal.prefs.icsFeed, { secret });
    if (body === null) return new Response("Not found", { status: 404 });
    await ctx.runMutation(internal.prefs.recordIcsFetch, {
      secret,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="wiscourse.ics"',
        "Cache-Control": "private, max-age=300",
      },
    });
  }),
});

export default http;
