const express = require("express");
const { errorHandler, notFound } = require("./middleware/errorHandler");

const app = express();

// Parses JSON bodies into req.body. Without it req.body is undefined on POST.
app.use(express.json());

// Tiny request logger — middleware that inspects and waves everything through.
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

// One router per workflow, mounted at its prefix.
app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/payments", require("./routes/payments"));

// These two must come LAST — Express matches in order.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
