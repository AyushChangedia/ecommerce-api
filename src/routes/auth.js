const express = require("express");
const { body } = require("express-validator");
const validate = require("../middleware/validate");
const { verifyToken } = require("../middleware/auth");
const { register, login, me } = require("../controllers/authController");

const router = express.Router();

router.post(
  "/register",
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
  body("email").isEmail().withMessage("Valid email required"),
  body("password").notEmpty().withMessage("Password is required"),
  validate,
  login
);

router.get("/me", verifyToken, me);

module.exports = router;
