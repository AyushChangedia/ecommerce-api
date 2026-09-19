const express = require("express");
const { body, param, query } = require("express-validator");
const validate = require("../middleware/validate");
const { verifyToken } = require("../middleware/auth");
const {
  createOrder,
  listMyOrders,
  getOrder,
  cancelOrder
} = require("../controllers/orderController");

const router = express.Router();

// Every order route requires a valid token — applied once, to the whole router.
router.use(verifyToken);

router.post(
  "/",
  body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array"),
  body("items.*.productId").isInt({ min: 1 }).withMessage("productId must be an integer"),
  body("items.*.quantity")
    .isInt({ min: 1 })
    .withMessage("quantity must be at least 1"), // blocks negative quantities
  validate,
  createOrder
);

router.get(
  "/",
  query("limit").optional().isInt({ min: 1, max: 100 }),
  query("offset").optional().isInt({ min: 0 }),
  validate,
  listMyOrders
);
router.get("/:id", param("id").isInt(), validate, getOrder);
router.patch("/:id/cancel", param("id").isInt(), validate, cancelOrder);

module.exports = router;
