const express = require("express");
const { body, param, query } = require("express-validator");
const validate = require("../middleware/validate");
const { verifyToken, requireAdmin } = require("../middleware/auth");
const {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct
} = require("../controllers/productController");

const router = express.Router();

// Public reads
router.get(
  "/",
  query("limit").optional().isInt({ min: 1, max: 100 }),
  query("offset").optional().isInt({ min: 0 }),
  query("maxPrice").optional().isFloat({ min: 0 }),
  validate,
  listProducts
);

router.get("/:id", param("id").isInt(), validate, getProduct);

// Admin-only writes: token checked first, then role, then the payload.
router.post(
  "/",
  verifyToken,
  requireAdmin,
  body("name").trim().notEmpty(),
  body("price").isFloat({ min: 0 }),
  body("stock").optional().isInt({ min: 0 }),
  validate,
  createProduct
);

router.patch(
  "/:id",
  verifyToken,
  requireAdmin,
  param("id").isInt(),
  body("price").optional().isFloat({ min: 0 }),
  body("stock").optional().isInt({ min: 0 }),
  validate,
  updateProduct
);

router.delete("/:id", verifyToken, requireAdmin, param("id").isInt(), validate, deleteProduct);

module.exports = router;
