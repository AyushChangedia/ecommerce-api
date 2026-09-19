const crypto = require("crypto");
const pool = require("../config/db");
const { rollback } = require("../db/transaction");

/**
 * Pay for an order.
 *
 * Two writes that must agree: record the payment AND flip the order to 'paid'.
 * A crash between them would mean money taken with the order still unpaid,
 * so both live inside one transaction.
 *
 * The gateway call itself is mocked — the point of this endpoint is the
 * state handling around it, which is what a real integration also has to do.
 */
async function createPayment(req, res, next) {
  const client = await pool.connect();

  try {
    const { orderId } = req.body;

    await client.query("BEGIN");

    const orderResult = await client.query(
      "SELECT id, user_id, total_amount, status FROM orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );

    if (orderResult.rowCount === 0) {
      await rollback(client);
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult.rows[0];

    if (order.user_id !== req.user.userId) {
      await rollback(client);
      return res.status(403).json({ error: "You cannot pay for someone else's order" });
    }
    if (order.status === "paid") {
      await rollback(client);
      return res.status(409).json({ error: "Order is already paid" });
    }
    if (order.status === "cancelled") {
      await rollback(client);
      return res.status(409).json({ error: "Cannot pay for a cancelled order" });
    }

    // --- mock gateway call ---
    const transactionRef = `txn_${crypto.randomBytes(8).toString("hex")}`;
    const gatewaySucceeded = true;
    // -------------------------

    const paymentResult = await client.query(
      `INSERT INTO payments (order_id, amount, provider, transaction_ref, status)
       VALUES ($1, $2, 'mock', $3, $4)
       RETURNING id, order_id, amount, provider, transaction_ref, status, created_at`,
      [order.id, order.total_amount, transactionRef, gatewaySucceeded ? "success" : "failed"]
    );

    if (!gatewaySucceeded) {
      await client.query("COMMIT"); // keep the failed attempt on record
      return res.status(402).json({ error: "Payment failed", payment: paymentResult.rows[0] });
    }

    await client.query("UPDATE orders SET status = 'paid' WHERE id = $1", [order.id]);
    await client.query("COMMIT");

    res.status(201).json({ payment: paymentResult.rows[0] });
  } catch (err) {
    await rollback(client);
    next(err);
  } finally {
    client.release();
  }
}

async function getPaymentByOrder(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT pay.id, pay.order_id, pay.amount, pay.provider,
              pay.transaction_ref, pay.status, pay.created_at
       FROM payments pay
       JOIN orders o ON o.id = pay.order_id
       WHERE pay.order_id = $1 AND (o.user_id = $2 OR $3 = 'admin')`,
      [req.params.orderId, req.user.userId, req.user.role]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "No payment found for this order" });
    }
    res.json({ payment: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { createPayment, getPaymentByOrder };
