/**
 * Ending a transaction when something has already gone wrong.
 *
 * Every transactional handler did this:
 *
 *   catch (err) {
 *     await client.query("ROLLBACK");
 *     next(err);
 *   }
 *
 * which assumes the ROLLBACK works. The cases that land in a catch block are
 * exactly the ones where it may not — the connection dropped, the server went
 * away mid-statement. The rollback then rejects inside the catch, next(err) is
 * never reached, and two things follow: the original error is lost, and the
 * request is never answered at all. The caller waits until its own timeout,
 * and the process takes an unhandled rejection for the trouble.
 *
 * A failed rollback is also not an emergency. The transaction was never
 * committed, and a connection that cannot take a ROLLBACK is one Postgres has
 * already given up on and will clean up itself. It is worth a log line and
 * nothing more.
 */
async function rollback(client) {
  try {
    await client.query("ROLLBACK");
    return true;
  } catch (err) {
    console.error("ROLLBACK failed (the transaction was never committed):", err.message);
    return false;
  }
}

module.exports = { rollback };
