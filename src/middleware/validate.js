const { validationResult } = require("express-validator");

// Runs after the express-validator rule chain.
// If any rule failed, stop here with 400 and never reach the controller.
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((e) => ({ field: e.path, message: e.msg }))
    });
  }
  next();
}

module.exports = validate;
