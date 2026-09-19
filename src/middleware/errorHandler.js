// Express identifies an error handler by its FOUR arguments.
// Any next(err) anywhere in the app lands here.

// Postgres SQLSTATE codes that mean "the client sent something wrong", not
// "the server broke". Anything not listed here is ours to answer for.
const PG_STATUS = {
  "23505": [409, "Resource already exists"], // unique_violation (duplicate email)
  "23503": [400, "Referenced resource does not exist"], // foreign_key_violation
  "23514": [400, "A value in the request is out of range"], // check_violation
  "22P02": [400, "A value in the request is not the right type"] // invalid_text_representation
};

/**
 * What to log, and what not to.
 *
 * This used to print the whole error object. For a body-parser failure that
 * object carries a `body` property holding the raw request payload — so a
 * malformed POST to /api/auth/login wrote the password into the server log in
 * plaintext, and nothing redacts it afterwards.
 */
function logError(err, req) {
  const code = err && err.code ? ` [${err.code}]` : "";
  console.error(`${req.method} ${req.path} failed${code}:`, (err && err.message) || err);
  if (err && err.stack) console.error(err.stack);
}

function errorHandler(err, req, res, next) {
  logError(err, req);

  // Once a response has begun there is no second set of headers to send; hand
  // it to Express, which closes the connection.
  if (res.headersSent) return next(err);

  const pg = err && PG_STATUS[err.code];
  if (pg) {
    return res.status(pg[0]).json({ error: pg[1] });
  }

  // express.json() already rejects a malformed body with a 400 attached, and
  // it was being answered as an Internal server error: the caller is told the
  // server broke when their own request was the problem.
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body is not valid JSON" });
  }
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large" });
  }

  // Anything else carrying a 4xx of its own is a client error and says so.
  // Only a genuine server fault becomes a 500.
  const status = Number(err && (err.status || err.statusCode));
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ error: err.expose ? err.message : "Bad request" });
  }

  res.status(500).json({ error: "Internal server error" });
}

function notFound(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

module.exports = { errorHandler, notFound };
