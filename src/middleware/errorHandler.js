// Express identifies an error handler by its FOUR arguments.
// Any next(err) anywhere in the app lands here.
function errorHandler(err, req, res, next) {
  console.error(err);

  // 23505 = unique_violation (e.g. duplicate email)
  if (err.code === "23505") {
    return res.status(409).json({ error: "Resource already exists" });
  }
  // 23503 = foreign_key_violation (e.g. order for a product that doesn't exist)
  if (err.code === "23503") {
    return res.status(400).json({ error: "Referenced resource does not exist" });
  }

  res.status(500).json({ error: "Internal server error" });
}

function notFound(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

module.exports = { errorHandler, notFound };
