const express = require("express");
const { body } = require("express-validator");
const validate = require("../middleware/validate");
const rateLimit = require("../middleware/rateLimit");
const { verifyToken } = require("../middleware/auth");
const { register, login, me } = require("../controllers/authController");

const router = express.Router();

// Guessing passwords is the attack this endpoint exists to resist, and it is
// the one thing bcrypt's cost alone does not stop — it only sets the price per
// guess, not the number of them.
const loginLimiter = rateLimit({ max: 10, windowMs: 15 * 60 * 1000 });

// Registration is limited too, more mildly: each call costs a bcrypt hash and
// can fill the users table.
const registerLimiter = rateLimit({ max: 20, windowMs: 60 * 60 * 1000 });

router.post(
  "/register",
  registerLimiter,
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
  validate,
  register
);

router.post(
  "/login",
  loginLimiter,
  body("email").isEmail().withMessage("Valid email required"),
  body("password").notEmpty().withMessage("Password is required"),
  validate,
  login
);

router.get("/me", verifyToken, me);

module.exports = router;
