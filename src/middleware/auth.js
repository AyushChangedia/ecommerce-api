const jwt = require("jsonwebtoken");

// Every token this API issues is signed with HMAC-SHA256, so that is the only
// algorithm it will accept back. Leaving the set open means the algorithm is
// chosen by the token's own header — which is to say, by whoever sent it —
// and a verifier that takes instructions from the thing it is verifying has
// the shape of every JWT vulnerability there has ever been.
const ALGORITHMS = ["HS256"];

// Checkpoint 1: is this a real, unexpired token?
// Attaches the decoded identity to req.user so every handler downstream
// simply knows who is asking.
function verifyToken(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed token" });
  }

  // "Bearer" and the token, and nothing else. Splitting on every space and
  // taking index 1 accepted "Bearer <token> anything at all" and ignored the
  // tail, so a header that is plainly malformed was treated as well-formed.
  const parts = header.split(" ");
  if (parts.length !== 2 || !parts[1]) {
    return res.status(401).json({ error: "Missing or malformed token" });
  }

  let claims;
  try {
    claims = jwt.verify(parts[1], process.env.JWT_SECRET, { algorithms: ALGORITHMS });
  } catch (err) {
    // covers a forged signature, a rejected algorithm and an expired token
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // A signature only says the token was issued by us, not that it says
  // anything useful. userId goes straight into `WHERE user_id = $1`, and an
  // undefined there is not an authorisation failure — it is a Postgres type
  // error surfacing as a 500 on an endpoint that should have said 401.
  if (!Number.isInteger(claims.userId) || claims.userId < 1) {
    return res.status(401).json({ error: "Token does not identify a user" });
  }

  req.user = claims;
  next();
}

// Checkpoint 2: we know who you are — are you allowed?
// 401 = "who are you?"   403 = "I know you, and no."
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

module.exports = { verifyToken, requireAdmin, ALGORITHMS };
