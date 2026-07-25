-- ============================================================
-- Indexes: applied AFTER benchmarking so the improvement is measurable.
-- Rule: index the columns you filter on (WHERE) and join on (foreign keys).
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_user_id        ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id  ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id     ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_products_category     ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);
