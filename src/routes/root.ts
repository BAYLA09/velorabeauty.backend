import { Router } from "express";

export const rootRouter = Router();

const SERVICE = {
  name: "velorabeauty-backend",
  description: "Velora Beauty API — store, admin, and Grok agent endpoints",
  health: "/health",
  agentBase: "/api/agent",
  docs: "https://github.com/BAYLA09/velorabeauty.backend",
};

rootRouter.get("/", (req, res) => {
  const acceptsHtml = req.headers.accept?.includes("text/html");

  if (acceptsHtml) {
    res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Velora Beauty API</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; color: #1a1a1a; }
    h1 { font-size: 1.5rem; }
    code { background: #f4f4f5; padding: 0.15rem 0.4rem; border-radius: 4px; }
    a { color: #6d28d9; }
    ul { padding-left: 1.2rem; }
  </style>
</head>
<body>
  <h1>Velora Beauty API</h1>
  <p>This is the backend service. It is running if you see this page.</p>
  <ul>
    <li><a href="/health">/health</a> — service &amp; database check</li>
    <li><code>/api/agent</code> — Grok agent API (Bearer token required)</li>
    <li><code>/api/customers</code> — store API (Bearer token required)</li>
  </ul>
  <p><small>Configure Grok with base URL: <code>${req.protocol}://${req.get("host")}/api/agent</code></small></p>
</body>
</html>`);
    return;
  }

  res.json({
    ok: true,
    service: SERVICE.name,
    message: "Velora Beauty API is online. Use /health and /api/* routes.",
    links: {
      health: "/health",
      agentApi: "/api/agent",
    },
  });
});
