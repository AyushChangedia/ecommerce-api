const pool = require("../config/db");

/**
 * Create an order.
 *
 * This is the transaction. Four writes must all succeed or all be undone:
 *   1. lock + check stock
 *   2. insert the order
 *   3. insert one row per line item
 *   4. decrement stock
 *
 * If the server dies halfway, ROLLBACK means it is as if nothing happened.
 * Without this you can end up with an order whose stock was never reduced.
 */
async function createOrder(req, res, next) {
  // A transaction must run on ONE connection, so we check a client out of the
  // pool by hand instead of using pool.query().
  const client = await pool.connect();

  try {
    const { items } = req.body; // [{ productId, quantity }]
    const productIds = items.map((i) => i.productId);

    await client.query("BEGIN");

    // FOR UPDATE locks these rows until COMMIT. Without it, two customers
    // buying the last unit simultaneously could both pass the stock check.
    const productsResult = await client.query(
      `SELECT id, price, stock FROM products WHERE id = ANY($1::int[]) FOR UPDATE`,
      [productIds]
    );

    const products = new Map(productsResult.rows.map((p) => [p.id, p]));

    let total = 0;
    for (const item of items) {
      const product = products.get(item.productId);
      if (!product) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: `Product ${item.productId} not found` });
      }
      if (product.stock < item.quantity) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: `Insufficient stock for product ${item.productId}`,
          available: product.stock
        });
      }
      total += Number(product.price) * item.quantity;
    }

    const orderResult = await client.query(
      `INSERT INTO orders (user_id, total_amount, status)
       VALUES ($1, $2, 'pending')
       RETURNING id, user_id, total_amount, status, created_at`,
      [req.user.userId, total.toFixed(2)]
    );
    const order = orderResult.rows[0];

    for (const item of items) {
      const product = products.get(item.productId);

      // price_at_purchase is COPIED, not looked up later. If the price changes
      // tomorrow, this historical order must not silently change with it.
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
         VALUES ($1, $2, $3, $4)`,
        [order.id, item.productId, item.quantity, product.price]
      );

      await client.query(
        `UPDATE products SET stock = stock - $1 WHERE id = $2`,
        [item.quantity, item.productId]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ order });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    // Always hand the connection back, success or failure, or the pool leaks.
    client.release();
  }
}

/**
 * List the logged-in user's orders WITH their line items.
 *
 * The naive version fetches orders, then loops and queries items for each one:
 * 1 + N queries. This does it in ONE query by joining and aggregating the
 * items into JSON server-side.
 */
async function listMyOrders(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT
         o.id,
         o.total_amount,
         o.status,
         o.created_at,
         COALESCE(
           json_agg(
             json_build_object(
               'productId', p.id,
               'name', p.name,
               'quantity', oi.quantity,
               'price', oi.price_at_purchase
             )
           ) FILTER (WHERE oi.id IS NOT NULL),
           '[]'
         ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products    p  ON p.id = oi.product_id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [req.user.userId]
    );

    res.json({ count: result.rowCount, orders: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Fetch one order. Ownership check is the 401 vs 403 distinction in practice:
 * the token is valid (we know who you are) but the order is not yours.
 */
async function getOrder(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT id, user_id, total_amount, status, created_at
       FROM orders WHERE id = $1`,
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = result.rows[0];
    if (order.user_id !== req.user.userId && req.user.role !== "admin") {
      return res.status(403).json({ error: "This order does not belong to you" });
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
}

/**
 * Cancelling must also restore the stock we took — again, all or nothing.
 */
async function cancelOrder(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      "SELECT id, user_id, status FROM orders WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );
    if (orderResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult.rows[0];
    if (order.user_id !== req.user.userId && req.user.role !== "admin") {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "This order does not belong to you" });
    }
    if (order.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: `Cannot cancel a ${order.status} order` });
    }

    const items = await client.query(
      "SELECT product_id, quantity FROM order_items WHERE order_id = $1",
      [order.id]
    );
    for (const item of items.rows) {
      await client.query("UPDATE products SET stock = stock + $1 WHERE id = $2", [
        item.quantity,
        item.product_id
      ]);
    }

    await client.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [order.id]);
    await client.query("COMMIT");

    res.json({ message: "Order cancelled and stock restored" });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { createOrder, listMyOrders, getOrder, cancelOrder };
