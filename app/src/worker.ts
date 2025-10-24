// src/worker.ts
import cron from "node-cron";
import { runTimeoutPendingJob } from "./jobs/timeoutPending";

const SCHEDULE = process.env.TIMEOUT_CRON ?? "*/2 * * * *"; // cada 2 minutos

console.log("[worker] starting with schedule:", SCHEDULE);
cron.schedule(SCHEDULE, async () => {
  try {
    const res = await runTimeoutPendingJob();
    console.log("[worker] timeout-pending:", res);
  } catch (err) {
    console.error("[worker] job error:", err);
  }
});

// Mantener el proceso vivo (Railway lo gestiona). Si quieres, puedes correr el job 1 vez al arranque:
(async () => {
  try {
    const res = await runTimeoutPendingJob();
    console.log("[worker] first run:", res);
  } catch (err) {
    console.error("[worker] first run error:", err);
  }
})();
