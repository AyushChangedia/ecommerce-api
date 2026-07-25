require("dotenv").config();
const app = require("./app");
const pool = require("./config/db");

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log(`DB connected at ${result.rows[0].now}`);
  } catch (err) {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  }

  app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
}

start();
