const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const SALT_ROUNDS = 10;

// A real hash to compare against when the email is not registered. Returning
// early in that case skipped bcrypt entirely, and the ~10x gap in response
// time told an attacker which emails exist however identical the body was.
// Computed once at load so every login pays the same cost.
const ABSENT_USER_HASH = bcrypt.hashSync("no-user-with-this-email", SALT_ROUNDS);

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    // We never store the password. bcrypt is deliberately slow, which is
    // exactly what makes a leaked database hard to brute-force.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Registration always creates a customer. `role` used to be taken from the
    // request body, so anyone could POST {"role":"admin"} to this unauthenticated
    // endpoint and mint themselves an admin — and the login token then carried
    // that role straight through requireAdmin. A privilege boundary cannot be
    // set by the party it exists to constrain, so promotion has to happen
    // out-of-band: an authenticated admin path, or the database.
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'customer')
       RETURNING id, name, email, role, created_at`,
      [name, email.toLowerCase(), passwordHash]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT id, name, email, password_hash, role FROM users WHERE email = $1",
      [email.toLowerCase()]
    );
    const user = result.rows[0];

    // Same message AND the same amount of work whether the email doesn't exist
    // or the password is wrong. Matching the message alone is not enough: an
    // unknown email used to skip bcrypt and answer in a fraction of the time,
    // which enumerates accounts just as effectively as a different message.
    const ok = await bcrypt.compare(password, user ? user.password_hash : ABSENT_USER_HASH);
    if (!user || !ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const result = await pool.query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
      [req.user.userId]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me };
