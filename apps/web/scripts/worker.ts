import { delay, processNextJob } from "../src/lib/async-job-worker";

const POLL_INTERVAL_MS = Number(process.env.ASYNC_JOB_POLL_INTERVAL_MS ?? 2000);

let shuttingDown = false;

async function main() {
  process.on("SIGINT", () => {
    shuttingDown = true;
  });
  process.on("SIGTERM", () => {
    shuttingDown = true;
  });

  console.log(`[worker] async job worker started; polling every ${POLL_INTERVAL_MS}ms`);
  while (!shuttingDown) {
    const processed = await processNextJob();
    if (!processed) {
      await delay(POLL_INTERVAL_MS);
    }
  }
  console.log("[worker] async job worker stopped");
}

void main().catch((error) => {
  console.error("[worker] fatal error:", error);
  process.exit(1);
});
