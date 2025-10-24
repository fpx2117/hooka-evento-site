// scripts/timeout-pending-worker.ts
import cron from "node-cron";

const CRON_EXPR = process.env.TIMEOUT_CRON || "*/2 * * * *"; // cada 2 min por defecto
const PORT = process.env.PORT || "3000";
// Si estás corriendo web + worker en el mismo contenedor, usa localhost + PORT:
const BASE_URL = process.env.WEB_BASE_URL || `http://127.0.0.1:${PORT}`;
const CRON_SECRET = process.env.CRON_SECRET || ""; // opcional si lo validas en el endpoint

const TARGET = `${BASE_URL}/api/tasks/timeout-pending`;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Espera a que el servidor web esté listo (por si ambos arrancan a la vez)
async function waitForWebReady(maxAttempts = 30, delayMs = 2000) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) return true;
    } catch {
      // web aún no listo
    }
    console.log(`[worker] web no listo, reintento ${i}/${maxAttempts}…`);
    await sleep(delayMs);
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
  console.log(
    `[worker] Cron programado: "${CRON_EXPR}" → ${TARGET} (PORT=${PORT})`
  );

  await waitForWebReady();

  // Ejecuta una vez al iniciar:
  await runOnce();

  // Programa el cron:
  cron.schedule(CRON_EXPR, async () => {
    await runOnce();
  });
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
