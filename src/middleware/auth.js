const jwt = require("jsonwebtoken");

// Checkpoint 1: is this a real, unexpired token?
// Attaches the decoded identity to req.user so every handler downstream
// simply knows who is asking.
function verifyToken(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed token" });
  }

  try {
    const token = header.split(" ")[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    // covers both a forged signature and an expired token
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Checkpoint 2: we know who you are — are you allowed?
// 401 = "who are you?"   403 = "I know you, and no."
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

module.exports = { verifyToken, requireAdmin };
