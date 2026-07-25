const pool = require("../config/db");

// Public. Supports filtering + pagination so the response size stays bounded
// no matter how large the catalogue grows.
async function listProducts(req, res, next) {
  try {
    const { category, maxPrice, limit = 20, offset = 0 } = req.query;

    const conditions = [];
    const values = [];

    if (category) {
      values.push(category);
      conditions.push(`category = $${values.length}`);
    }
    if (maxPrice) {
      values.push(maxPrice);
      conditions.push(`price <= $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    values.push(Math.min(Number(limit), 100));
    values.push(Number(offset));

    const result = await pool.query(
      `SELECT id, name, description, price, stock, category
       FROM products
       ${where}
       ORDER BY id
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    res.json({ count: result.rowCount, products: result.rows });
  } catch (err) {
    next(err);
  }
}

async function getProduct(req, res, next) {
  try {
    const result = await pool.query(
      "SELECT id, name, description, price, stock, category FROM products WHERE id = $1",
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json({ product: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// Admin only
async function createProduct(req, res, next) {
  try {
    const { name, description, price, stock, category } = req.body;
    const result = await pool.query(
      `INSERT INTO products (name, description, price, stock, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description || null, price, stock || 0, category || null]
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// Admin only. COALESCE lets one endpoint handle partial updates:
// any field you omit keeps its current value.
async function updateProduct(req, res, next) {
  try {
    const { name, description, price, stock, category } = req.body;
    const result = await pool.query(
      `UPDATE products
       SET name        = COALESCE($1, name),
           description = COALESCE($2, description),
           price       = COALESCE($3, price),
           stock       = COALESCE($4, stock),
           category    = COALESCE($5, category)
       WHERE id = $6
       RETURNING *`,
      [name ?? null, description ?? null, price ?? null, stock ?? null, category ?? null, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json({ product: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const result = await pool.query("DELETE FROM products WHERE id = $1 RETURNING id", [
      req.params.id
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listProducts, getProduct, createProduct, updateProduct, deleteProduct };
