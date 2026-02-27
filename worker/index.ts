import { Hono } from "hono";
import { cors } from "hono/cors";

type Env = {
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
