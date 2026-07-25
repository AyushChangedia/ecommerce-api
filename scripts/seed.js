require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("../src/config/db");

async function seed() {
  const adminHash = await bcrypt.hash("admin1234", 10);
  const userHash = await bcrypt.hash("user1234", 10);

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin'), ($4, $5, $6, 'customer')
     ON CONFLICT (email) DO NOTHING`,
    ["Admin", "admin@shop.com", adminHash, "Test Customer", "customer@shop.com", userHash]
  );

  const products = [
    ["Mechanical Keyboard", "Hot-swappable, 75% layout", 4999.0, 25, "peripherals"],
    ["Wireless Mouse", "Ergonomic, 6 buttons", 1899.0, 40, "peripherals"],
    ["27in Monitor", "1440p 165Hz IPS", 24999.0, 10, "displays"],
    ["USB-C Hub", "7-in-1 with HDMI", 2499.0, 60, "accessories"],
    ["Laptop Stand", "Aluminium, adjustable", 1299.0, 35, "accessories"]
  ];

  for (const p of products) {
    await pool.query(
      `INSERT INTO products (name, description, price, stock, category)
       VALUES ($1, $2, $3, $4, $5)`,
      p
    );
  }

  console.log("Seeded 2 users and 5 products.");
  console.log("  admin@shop.com    / admin1234");
  console.log("  customer@shop.com / user1234");

  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
