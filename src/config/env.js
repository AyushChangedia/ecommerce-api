require("dotenv").config();

/**
 * Fail fast on a misconfigured environment.
 *
 * Every guarantee this API makes rests on JWT_SECRET being both present and
 * genuinely secret. Neither was checked anywhere, so two silent failures were
 * possible:
 *
 *   - Unset. jwt.sign throws on every login, so the service starts, answers
 *     /health, and 500s the moment anyone tries to authenticate.
 *   - Left as the .env.example placeholder. Far worse: the signing key is then
 *     a published string, and anyone who has read the repo can mint a token
 *     with role 'admin' that verifyToken accepts as genuine.
 *
 * A process that cannot honour its own auth should refuse to start rather than
 * take traffic and find out later.
 */

// Shipped in .env.example; a deployment still using it has no secret at all.
const PLACEHOLDERS = new Set([
  "replace-with-a-long-random-string",
  "changeme",
  "secret",
  "your-secret-key"
]);

const MIN_SECRET_LENGTH = 32;

function fail(reason) {
  console.error(`Configuration error: ${reason}`);
  console.error("Generate one with:  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"");
  process.exit(1);
}

function validateEnv() {
  if (!process.env.DATABASE_URL) {
    fail("DATABASE_URL is not set.");
  }

  const secret = process.env.JWT_SECRET;

  if (!secret || secret.trim() === "") {
    fail("JWT_SECRET is not set. Tokens cannot be signed without it.");
  }
  if (PLACEHOLDERS.has(secret.trim().toLowerCase())) {
    fail(
      "JWT_SECRET is still the example placeholder. It is public, so anyone " +
      "who has seen this repository could forge an admin token."
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    fail(
      `JWT_SECRET is ${secret.length} characters; at least ${MIN_SECRET_LENGTH} ` +
      "are needed to make offline brute-forcing of the signing key impractical."
    );
  }
}

module.exports = { validateEnv, MIN_SECRET_LENGTH, PLACEHOLDERS };
