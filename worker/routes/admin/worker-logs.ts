import { Hono } from "hono";
import type { Env } from "../../types";

const workerLogsRoutes = new Hono<{ Bindings: Env }>();

const CF_BASE = "https://api.cloudflare.com/client/v4/accounts";

const DEFAULT_TEMPLATES = [
  {
    id: "briefing-request-logs",
    name: "Briefing Request Logs",
    description: "All pipeline logs for a briefing request",
    query: {
      queryId: "briefing-request-{{requestId}}",
      timeframe: { from: "{{from}}", to: "{{to}}" },
      view: "events",
      limit: 200,
      parameters: {
        filters: [
          { key: "$metadata.requestId", operation: "eq", value: "{{requestId}}", type: "string" },
        ],
      },
    },
    variables: [
      { name: "requestId", label: "Request ID", type: "string" },
      { name: "from", label: "From", type: "timestamp", default: "-1h" },
      { name: "to", label: "To", type: "timestamp", default: "now" },
    ],
  },
];

/** Forward a POST to a CF Workers Observability endpoint */
async function proxyCF(
  c: any,
  path: string
): Promise<Response> {
  const env = c.env as Env;
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
    return c.json(
      { error: "CF_API_TOKEN or CF_ACCOUNT_ID not configured" },
      503
    );
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
  const data = await resp.json();
  return c.json(data, resp.status);
}

// POST /query — proxy to CF telemetry query
workerLogsRoutes.post("/query", (c) => proxyCF(c, "query"));

// POST /keys — proxy to CF telemetry keys
workerLogsRoutes.post("/keys", (c) => proxyCF(c, "keys"));

// GET /templates — load saved query templates
workerLogsRoutes.get("/templates", async (c) => {
  const prisma = c.get("prisma") as any;
  const row = await prisma.platformConfig.findUnique({
    where: { key: "logs.queryTemplates" },
  });
  const templates = row?.value ?? DEFAULT_TEMPLATES;
  return c.json({ templates });
});

// PUT /templates — save query templates
workerLogsRoutes.put("/templates", async (c) => {
  const prisma = c.get("prisma") as any;
  const { templates } = await c.req.json();
  await prisma.platformConfig.upsert({
    where: { key: "logs.queryTemplates" },
    update: { value: templates },
    create: { key: "logs.queryTemplates", value: templates },
  });
  return c.json({ ok: true });
});

export { workerLogsRoutes };
