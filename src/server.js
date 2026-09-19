const { validateEnv } = require("./config/env");

// Before anything opens a socket: refuse to start if the environment cannot
// support the guarantees the API makes.
validateEnv();

const app = require("./app");
const pool = require("./config/db");

const PORT = process.env.PORT || 3000;

// How long to let in-flight requests finish before the process gives up on
// them. Every platform that sends SIGTERM also has a patience of its own —
// ten seconds on Heroku, thirty on Kubernetes by default — so this has to be
// comfortably under whichever is shortest, or the platform's own SIGKILL
// arrives first and the wait was for nothing.
const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS || 8000);

async function start() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log(`DB connected at ${result.rows[0].now}`);
  } catch (err) {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  }

  const server = app.listen(PORT, () =>
    console.log(`Server listening on http://localhost:${PORT}`)
  );

  /**
   * Stop taking traffic, let what is already running finish, then close the
   * pool.
   *
   * A deploy, a scale-down and a container restart all begin with SIGTERM,
   * and the default response to it is to die immediately. In the middle of
   * createOrder that means a half-written transaction — the stock decremented
   * with no COMMIT — which Postgres does roll back on its own, but only once
   * it notices the connection is gone. Every redeploy was an unnecessary roll
   * of the dice against whatever was in flight.
   *
   * The order matters: stop listening first, so the load balancer stops
   * sending work here, and only then wait. Closing the pool before the
   * handlers have finished would fail the very requests being waited for.
   */
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received — finishing in-flight requests…`);

    const giveUp = setTimeout(() => {
      console.error(
        `Requests still running after ${SHUTDOWN_GRACE_MS}ms — exiting anyway.`
      );
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    // This timer must not be the reason the process stays alive.
    giveUp.unref();

    await new Promise((resolve) => server.close(resolve));

    try {
      await pool.end();
    } catch (err) {
      console.error("Closing the connection pool failed:", err.message);
    }

    clearTimeout(giveUp);
    console.log("Shut down cleanly.");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server;
}

// A rejection nobody handled leaves the process in a state we cannot reason
// about — half a transaction may be open. Say what happened, then go down the
// same way as any other shutdown rather than being killed mid-statement.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  process.emit("SIGTERM");
});

start();
