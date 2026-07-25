/**
 * Query optimization benchmark.
 *
 * Generates a realistic amount of data, then measures two classic problems:
 *   1. Missing index      -> sequential scan vs index scan
 *   2. N+1 query pattern  -> many round trips vs one JOIN
 *
 * Run:  npm run benchmark
 * Keep the numbers it prints — they are the evidence behind
 * "optimized SQL queries".
 */
require("dotenv").config();
const pool = require("../src/config/db");

const USERS = 500;
const PRODUCTS = 200;
const ORDERS = 20000;

function ms(start) {
  return (Number(process.hrtime.bigint() - start) / 1e6).toFixed(1);
}

async function generateData() {
  console.log("Generating test data...");

  await pool.query("DROP INDEX IF EXISTS idx_orders_user_id");
  await pool.query("DROP INDEX IF EXISTS idx_order_items_order_id");

  await pool.query(
    `INSERT INTO users (name, email, password_hash)
     SELECT 'User ' || g, 'bench' || g || '@test.com', 'x'
     FROM generate_series(1, $1) g
     ON CONFLICT (email) DO NOTHING`,
    [USERS]
  );

  await pool.query(
    `INSERT INTO products (name, price, stock, category)
     SELECT 'Product ' || g, (random() * 5000)::numeric(10,2), 1000, 'bench'
     FROM generate_series(1, $1) g`,
    [PRODUCTS]
  );

  await pool.query(
    `INSERT INTO orders (user_id, total_amount, status)
     SELECT (SELECT id FROM users ORDER BY random() LIMIT 1),
            (random() * 10000)::numeric(10,2),
            'pending'
     FROM generate_series(1, $1)`,
    [ORDERS]
  );

  await pool.query(
    `INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
     SELECT o.id,
            (SELECT id FROM products ORDER BY random() LIMIT 1),
            1 + (random() * 3)::int,
            (random() * 5000)::numeric(10,2)
     FROM orders o`
  );

  await pool.query("ANALYZE");
  console.log(`Done: ${USERS} users, ${PRODUCTS} products, ${ORDERS} orders.\n`);
}

async function planFor(sql, params) {
  const res = await pool.query(`EXPLAIN ANALYZE ${sql}`, params);
  const plan = res.rows.map((r) => r["QUERY PLAN"]).join("\n");
  const time = plan.match(/Execution Time: ([\d.]+) ms/);
  const scan = plan.includes("Index Scan") ? "Index Scan" : "Seq Scan";
  return { scan, time: time ? time[1] : "?", plan };
}

async function benchmarkIndex() {
  console.log("=".repeat(64));
  console.log("TEST 1  Missing index on orders.user_id");
  console.log("=".repeat(64));

  const sql = "SELECT * FROM orders WHERE user_id = $1";
  const userId = (await pool.query("SELECT id FROM users LIMIT 1")).rows[0].id;

  const before = await planFor(sql, [userId]);
  console.log(`  BEFORE  ${before.scan.padEnd(12)} ${before.time} ms`);

  await pool.query("CREATE INDEX idx_orders_user_id ON orders(user_id)");
  await pool.query("ANALYZE orders");

  const after = await planFor(sql, [userId]);
  console.log(`  AFTER   ${after.scan.padEnd(12)} ${after.time} ms`);

  const speedup = (Number(before.time) / Number(after.time)).toFixed(1);
  console.log(`  -> ${speedup}x faster, and the planner switched strategy.\n`);
}

async function benchmarkNPlusOne() {
  console.log("=".repeat(64));
  console.log("TEST 2  N+1 queries vs a single JOIN");
  console.log("=".repeat(64));

  await pool.query("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)");
  await pool.query("ANALYZE");

  const orders = (await pool.query("SELECT id FROM orders LIMIT 200")).rows;

  // --- the naive version: 1 query for orders + 1 per order ---
  let t = process.hrtime.bigint();
  for (const o of orders) {
    await pool.query("SELECT * FROM order_items WHERE order_id = $1", [o.id]);
  }
  const naive = ms(t);
  console.log(`  N+1     ${orders.length + 1} queries    ${naive} ms`);

  // --- the fixed version: one query, joined ---
  t = process.hrtime.bigint();
  await pool.query(
    `SELECT o.id, o.total_amount,
            json_agg(json_build_object('productId', oi.product_id, 'qty', oi.quantity)) AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = ANY($1::int[])
     GROUP BY o.id`,
    [orders.map((o) => o.id)]
  );
  const joined = ms(t);
  console.log(`  JOIN    1 query        ${joined} ms`);
  console.log(`  -> ${(Number(naive) / Number(joined)).toFixed(1)}x faster with ${orders.length} fewer round trips.\n`);
}

async function main() {
  await generateData();
  await benchmarkIndex();
  await benchmarkNPlusOne();
  console.log("Re-run `npm run migrate` to reset the database to a clean state.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
