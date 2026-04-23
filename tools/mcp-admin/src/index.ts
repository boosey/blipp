#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.BLIPP_API_KEY;
const BASE_URL = (process.env.BLIPP_BASE_URL ?? "https://blipp.app").replace(
  /\/$/,
  ""
);

if (!API_KEY) {
  console.error("BLIPP_API_KEY env var is required");
  process.exit(1);
}

const ADMIN_ROUTE_GROUPS = [
  "/api/admin/dashboard",
  "/api/admin/pipeline",
  "/api/admin/podcasts",
  "/api/admin/episodes",
  "/api/admin/briefings",
  "/api/admin/users",
  "/api/admin/analytics",
  "/api/admin/config",
  "/api/admin/requests",
  "/api/admin/stt-benchmark",
  "/api/admin/ai-models",
  "/api/admin/plans",
  "/api/admin/ai-errors",
  "/api/admin/audit-log",
  "/api/admin/api-keys",
  "/api/admin/catalog-seed",
  "/api/admin/recommendations",
  "/api/admin/cron-jobs",
  "/api/admin/claims-benchmark",
  "/api/admin/prompts",
  "/api/admin/voice-presets",
  "/api/admin/storage",
  "/api/admin/episode-refresh",
  "/api/admin/worker-logs",
  "/api/admin/feedback",
  "/api/admin/blipp-feedback",
  "/api/admin/support",
  "/api/admin/publisher-reports",
  "/api/admin/catalog-pregen",
  "/api/admin/geo-tagging",
  "/api/admin/service-keys",
];

const MAX_RESPONSE_CHARS = 100_000;

async function adminGet(
  path: string,
  query?: Record<string, string | number | boolean>
): Promise<string> {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `GET ${url.pathname}${url.search} → ${res.status} ${res.statusText}: ${text.slice(0, 500)}`
    );
  }
  let pretty = text;
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // non-JSON response; return as-is
  }
  if (pretty.length > MAX_RESPONSE_CHARS) {
    return (
      pretty.slice(0, MAX_RESPONSE_CHARS) +
      `\n\n… [truncated ${pretty.length - MAX_RESPONSE_CHARS} chars; narrow the query or paginate]`
    );
  }
  return pretty;
}

const server = new Server(
  { name: "blipp-admin", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "admin_get",
      description:
        "Issue a GET request to the Blipp admin API (read-only). Path must start with '/api/admin/'. Supports query parameters like ?page=1&pageSize=50&search=foo. Returns the JSON response.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Admin API path, e.g. '/api/admin/users' or '/api/admin/users/abc123'. Must start with '/api/admin/'.",
          },
          query: {
            type: "object",
            description:
              "Optional query-string parameters. Common: page, pageSize, search, sort.",
            additionalProperties: true,
          },
        },
        required: ["path"],
      },
    },
    {
      name: "list_admin_routes",
      description:
        "List the top-level admin route groups available on the Blipp admin API. Use this to discover what surfaces exist before calling admin_get.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_users_by_join_date",
      description:
        "List users who signed up (User.createdAt) within a UTC calendar day. Returns the same shape as /api/admin/users, paginated.",
      inputSchema: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "UTC calendar date in YYYY-MM-DD. Matches users with createdAt on that day (UTC).",
          },
          page: {
            type: "number",
            description: "Page number (1-indexed). Default 1.",
          },
          pageSize: {
            type: "number",
            description: "Results per page. Default 50.",
          },
        },
        required: ["date"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "list_admin_routes") {
    return {
      content: [
        {
          type: "text",
          text: ADMIN_ROUTE_GROUPS.join("\n"),
        },
      ],
    };
  }

  if (name === "admin_get") {
    const path = (args as { path?: unknown })?.path;
    if (typeof path !== "string" || !path.startsWith("/api/admin/")) {
      throw new Error("path must be a string starting with '/api/admin/'");
    }
    const rawQuery = (args as { query?: unknown })?.query;
    let query: Record<string, string | number | boolean> | undefined;
    if (rawQuery && typeof rawQuery === "object") {
      query = rawQuery as Record<string, string | number | boolean>;
    }
    const body = await adminGet(path, query);
    return {
      content: [{ type: "text", text: body }],
    };
  }

  if (name === "list_users_by_join_date") {
    const date = (args as { date?: unknown })?.date;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("date must be a string in YYYY-MM-DD format");
    }
    const start = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) {
      throw new Error(`invalid date: ${date}`);
    }
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const page = (args as { page?: number })?.page ?? 1;
    const pageSize = (args as { pageSize?: number })?.pageSize ?? 50;

    const body = await adminGet("/api/admin/users", {
      createdFrom: start.toISOString(),
      createdTo: end.toISOString(),
      page,
      pageSize,
    });
    return {
      content: [{ type: "text", text: body }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
