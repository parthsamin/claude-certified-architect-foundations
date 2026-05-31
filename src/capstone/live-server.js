// ===================================================================
// live-server.js — tiny HTTP + Server-Sent Events bridge for the
// Tracer. Streams events to a browser dashboard in real time as the
// capstone (or any traced demo) runs.
//
// No dependencies — Node's built-in http + fs only. The browser side
// is a single self-contained HTML file (live-dashboard.html) that
// reads from /events via the standard EventSource API.
// ===================================================================

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD = path.join(__dirname, "live-dashboard.html");

/**
 * Start a local HTTP server that serves the dashboard at `/` and
 * streams Tracer events via SSE at `/events`.
 *
 * Returns the http.Server instance — call .close() to stop.
 */
export function startLiveServer(tracer, port = 3737) {
  const sseClients = new Set();

  // Pipe every tracer event to all connected SSE clients.
  tracer.subscribe((event) => {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of sseClients) {
      try { res.write(payload); } catch { /* connection died; cleanup on close */ }
    }
  });

  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      fs.createReadStream(DASHBOARD).pipe(res);
      return;
    }
    if (req.url === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "connection": "keep-alive",
        "x-accel-buffering": "no", // disable proxy buffering if anything's in front
      });
      // Replay everything that's already happened so a late-joining
      // browser doesn't miss the start of the run.
      for (const past of tracer.events) {
        res.write(`data: ${JSON.stringify(past)}\n\n`);
      }
      sseClients.add(res);
      // Heartbeat every 15s so proxies don't reap idle connections.
      const hb = setInterval(() => {
        try { res.write(": heartbeat\n\n"); } catch { /* dead */ }
      }, 15000);
      req.on("close", () => {
        clearInterval(hb);
        sseClients.delete(res);
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port);
  return server;
}
