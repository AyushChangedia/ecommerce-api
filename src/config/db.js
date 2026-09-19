const fs = require("fs");
const { Pool } = require("pg");
require("dotenv").config();

/**
 * How the connection to Postgres is secured.
 *
 * It used to be `{ rejectUnauthorized: false }` for every host that was not
 * literally "localhost", which turns encryption into theatre: the traffic is
 * encrypted, but the server is never asked to prove who it is, so anyone able
 * to sit between the API and the database can present their own certificate
 * and read every query — including the password hashes and every order.
 *
 * The reason that line gets written is real: managed providers often hand out
 * a certificate signed by their own authority, which Node does not trust out
 * of the box, and verification fails on day one. The fix for that is the CA,
 * not switching the check off, so DATABASE_CA_CERT takes either the PEM itself
 * or a path to it.
 *
 * Turning verification off is still possible — some throwaway environment will
 * need it — but it now has to be asked for by name, and it says so at startup
 * rather than being the silent default for production.
 */
function sslConfig(connectionString) {
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString || "");
  if (isLocal && process.env.DATABASE_SSL !== "true") return false;

  const ca = process.env.DATABASE_CA_CERT;
  if (ca) {
    return {
      rejectUnauthorized: true,
      ca: ca.includes("BEGIN CERTIFICATE") ? ca : fs.readFileSync(ca, "utf8")
    };
  }

  if (process.env.DATABASE_SSL_INSECURE === "true") {
    console.warn(
      "WARNING: DATABASE_SSL_INSECURE=true — the database certificate is not " +
        "being verified. The connection is encrypted but not authenticated, so " +
        "anything on the network path can impersonate the database. Set " +
        "DATABASE_CA_CERT instead."
    );
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: true };
}

// A pool keeps a small set of connections open and reuses them.
// Opening a new DB connection per request would be slow and wasteful.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(process.env.DATABASE_URL),
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

module.exports = pool;
module.exports.sslConfig = sslConfig;
