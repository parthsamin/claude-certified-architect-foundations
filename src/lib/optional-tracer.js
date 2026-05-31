// ===================================================================
// optional-tracer.js — opt-in live-tracing for any module that uses
// the Agent class. Import this in a demo, pass `tracer` to your Agent
// constructors, and call `await finalizeTracing()` at the end.
//
// Behavior:
//   - `LIVE` env var unset (or LIVE=0): tracer is null, no server.
//     Demos run identically to before.
//   - `LIVE=1`: starts the dashboard on LIVE_PORT (default 3737),
//     pauses 5 seconds so you can open the browser, then proceeds.
//     After main() ends, the server stays alive until Ctrl+C.
//
// Usage in any module:
//
//     import { tracer, finalizeTracing } from "../lib/optional-tracer.js";
//
//     const agent = new Agent({ ...config, tracer });
//     await agent.run(prompt);
//     await finalizeTracing();
//
// To run with the live dashboard:
//     LIVE=1 npm run m3:task
//     LIVE=1 LIVE_PORT=8080 npm run m4:agent
// ===================================================================

import { Tracer } from "../capstone/tracer.js";
import { startLiveServer } from "../capstone/live-server.js";

const LIVE_ENABLED = process.env.LIVE === "1";
const LIVE_PORT = Number(process.env.LIVE_PORT) || 3737;

export const tracer = LIVE_ENABLED ? new Tracer() : null;

let liveServer = null;
if (LIVE_ENABLED) {
  liveServer = startLiveServer(tracer, LIVE_PORT);
  console.log("\n┌──────────────────────────────────────────────────────────────┐");
  console.log(`│  🔭 Live trace dashboard:  http://localhost:${LIVE_PORT}/             │`);
  console.log("│  Open it now — the script starts in 5 seconds.               │");
  console.log("│  (Skip the dashboard: unset LIVE  or  LIVE=0)                │");
  console.log("└──────────────────────────────────────────────────────────────┘\n");
  await new Promise((r) => setTimeout(r, 5000));
}

export async function finalizeTracing() {
  if (!liveServer) return;
  console.log(
    `\n🔭 Dashboard still live at http://localhost:${LIVE_PORT}/ — Ctrl+C to stop.`,
  );
  process.on("SIGINT", () => {
    liveServer.close();
    process.exit(0);
  });
  await new Promise(() => {}); // park until Ctrl+C
}
