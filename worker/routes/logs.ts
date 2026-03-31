import { Hono } from "hono";
import type { Env } from "../types";

const logsRoutes = new Hono<{ Bindings: Env }>();

const CF_BASE = "https://api.cloudflare.com/client/v4/accounts";

/** Validate Bearer token against SCRIPT_TOKEN */
logsRoutes.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || token !== c.env.SCRIPT_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

/** Forward a POST to a CF Workers Observability endpoint */
async function proxyCF(c: any, path: string): Promise<Response> {
  const env = c.env as Env;
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
    return c.json({ error: "CF_API_TOKEN or CF_ACCOUNT_ID not configured" }, 503);
  }
  const body = await c.req.json();
  const url = `${CF_BASE}/${env.CF_ACCOUNT_ID}/workers/observability/telemetry/${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return c.json(await resp.json(), resp.status);
}

logsRoutes.post("/query", (c) => proxyCF(c, "query"));
logsRoutes.post("/keys", (c) => proxyCF(c, "keys"));

export { logsRoutes };
