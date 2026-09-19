/**
 * A small fixed-window rate limiter, in process, with no dependencies.
 *
 * /api/auth/login was unthrottled. bcrypt at cost 10 answers in roughly a
 * tenth of a second, so a single connection grinds through ten guesses a
 * second and a handful of parallel ones grind through hundreds — against an
 * eight-character minimum, which is the floor the validator sets. Nothing in
 * front of it would notice, because every one of those requests is a
 * perfectly ordinary POST that returns 401.
 *
 * In-process means it counts per instance: behind four replicas the effective
 * limit is four times what is configured here, and a restart forgets
 * everything. That is worth saying plainly rather than implying otherwise —
 * a shared store is the answer at that size. What this does buy, on one
 * instance and with no new dependency, is turning an unbounded guessing rate
 * into a bounded one.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

// Only ever holds the keys of the current and previous window; sweep() drops
// the rest, so a flood of one-off IPs cannot grow this without bound.
const hits = new Map();

function sweep(now) {
  for (const [key, entry] of hits) {
    if (entry.expiresAt <= now) hits.delete(key);
  }
}

/**
 * @param {object} [options]
 * @param {number} [options.windowMs] length of the window
 * @param {number} [options.max] attempts allowed within it
 * @param {(req) => string} [options.keyOf] what to count by
 */
function rateLimit(options = {}) {
  const windowMs = options.windowMs ?? WINDOW_MS;
  const max = options.max ?? MAX_ATTEMPTS;
  const keyOf = options.keyOf ?? ((req) => req.ip);

  return function limiter(req, res, next) {
    const now = Date.now();
    if (hits.size > 5000) sweep(now);

    const key = `${req.method} ${req.baseUrl}${req.path} ${keyOf(req)}`;
    let entry = hits.get(key);

    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", remaining);
    res.setHeader("RateLimit-Reset", Math.ceil((entry.expiresAt - now) / 1000));

    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.expiresAt - now) / 1000));
      return res.status(429).json({
        error: "Too many attempts. Try again later."
      });
    }

    next();
  };
}

/** Test seam: the window is real time, so a suite needs a way back to zero. */
rateLimit.reset = () => hits.clear();

module.exports = rateLimit;
