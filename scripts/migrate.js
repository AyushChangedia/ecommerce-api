require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("../src/config/db");

async function migrate() {
  const withIndexes = process.argv.includes("--with-indexes");

  const schema = fs.readFileSync(path.join(__dirname, "../src/db/schema.sql"), "utf8");
  await pool.query(schema);
  console.log("Schema created (all tables dropped and rebuilt).");

  if (withIndexes) {
    const indexes = fs.readFileSync(path.join(__dirname, "../src/db/indexes.sql"), "utf8");
    await pool.query(indexes);
    console.log("Indexes created.");
  } else {
    console.log("Indexes NOT created — run `npm run benchmark` to see why they matter.");
  }

  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
