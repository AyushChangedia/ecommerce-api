const express = require("express");
const { body, param } = require("express-validator");
const validate = require("../middleware/validate");
const { verifyToken } = require("../middleware/auth");
const { createPayment, getPaymentByOrder } = require("../controllers/paymentController");

const router = express.Router();

router.use(verifyToken);

router.post("/", body("orderId").isInt({ min: 1 }), validate, createPayment);
router.get("/order/:orderId", param("orderId").isInt(), validate, getPaymentByOrder);

module.exports = router;
