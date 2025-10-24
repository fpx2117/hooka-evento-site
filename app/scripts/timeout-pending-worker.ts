import cron from "node-cron";

const CRON_EXPR = process.env.TIMEOUT_CRON || "*/2 * * * *"; // cada 2 min
const PORT = process.env.PORT || "3000";
const BASE_URL = process.env.WEB_BASE_URL || `http://127.0.0.1:${PORT}`;
const CRON_SECRET = process.env.CRON_SECRET || "";

const TARGET = `${BASE_URL}/api/tasks/timeout-pending`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForWebReady(max = 30, delay = 2000) {
  for (let i = 1; i <= max; i++) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) return true;
    } catch {}
    console.log(`[worker] web no listo, reintento ${i}/${max}…`);
    await sleep(delay);
  }
  console.warn("[worker] web no respondió a tiempo; continuo igual.");
  return false;
}

async function runOnce() {
  try {
    const res = await fetch(TARGET, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CRON_SECRET ? { "x-cron-key": CRON_SECRET } : {}),
      },
    });
    const text = await res.text();
    console.log("[worker] timeout-pending =>", res.status, text);
  } catch (e) {
    console.error("[worker] error llamando timeout-pending:", e);
  }
}

async function main() {
  console.log(`[worker] Cron: "${CRON_EXPR}" → ${TARGET}`);
  await waitForWebReady();
  await runOnce();
  cron.schedule(CRON_EXPR, runOnce);
}
main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
