# E-Commerce REST API

A production-shaped REST API for **product, order and payment workflows**, built with
Node.js, Express and PostgreSQL, with JWT authentication, request validation and
measured query optimization.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js (Express 4) |
| Database | PostgreSQL |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` password hashing |
| Validation | `express-validator` |

## Features

- **JWT authentication** — register / login / `me`, with role-based access (`customer`, `admin`)
- **Products** — public reads with filtering and pagination; admin-only writes
- **Orders** — multi-item orders created inside a database transaction with row-level locking
- **Payments** — idempotent payment recording that flips order status atomically
- **Validation** — every mutating endpoint validates its payload before reaching the controller
- **Measured optimization** — a benchmark script that proves the index and JOIN improvements

## Architecture

```
src/
├── config/db.js            connection pool
├── db/schema.sql           tables, constraints, foreign keys
├── db/indexes.sql          indexes (applied separately so gains are measurable)
├── middleware/
│   ├── auth.js             verifyToken + requireAdmin
│   ├── validate.js         express-validator result handler
│   └── errorHandler.js     centralised error + 404 handling
├── controllers/            business logic per workflow
├── routes/                 one router per workflow
├── app.js                  app assembly
└── server.js               startup + DB connectivity check
```

## Data model

```
users ──< orders ──< order_items >── products
             └──< payments
```

`order_items` is a join table (an order has many products; a product appears in many
orders). It stores `price_at_purchase` rather than joining to the live product price,
so historical orders are not rewritten when prices change.

## Setup

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and JWT_SECRET
npm run migrate               # create tables
npm run seed                  # 2 users + 5 products
npm run dev                   # http://localhost:3000
```

Seeded accounts:

| Email | Password | Role |
|---|---|---|
| admin@shop.com | admin1234 | admin |
| customer@shop.com | user1234 | customer |

## API

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Get JWT |
| GET | `/api/auth/me` | Bearer | Current user |
| GET | `/api/products` | — | List (filter, paginate) |
| GET | `/api/products/:id` | — | Single product |
| POST | `/api/products` | Admin | Create |
| PATCH | `/api/products/:id` | Admin | Partial update |
| DELETE | `/api/products/:id` | Admin | Delete |
| POST | `/api/orders` | Bearer | Create order (transactional) |
| GET | `/api/orders` | Bearer | My orders with line items |
| GET | `/api/orders/:id` | Bearer | Single order (ownership enforced) |
| PATCH | `/api/orders/:id/cancel` | Bearer | Cancel + restore stock |
| POST | `/api/payments` | Bearer | Pay for an order |
| GET | `/api/payments/order/:orderId` | Bearer | Payment for an order |

## Query optimization

`npm run benchmark` generates 500 users / 200 products / 20,000 orders, then measures
two classic problems against the live database.

**1. Missing index on `orders.user_id`** — measured with `EXPLAIN ANALYZE`:

| | Plan | Execution time |
|---|---|---|
| Before | Seq Scan | 1.262 ms |
| After `CREATE INDEX` | Index Scan | 0.025 ms |

**~50x faster**, and the planner switches strategy rather than scanning every row.

**2. N+1 queries vs a single JOIN** — fetching 200 orders with their line items:

| | Queries | Time |
|---|---|---|
| Loop per order | 201 | 66.0 ms |
| One JOIN + `json_agg` | 1 | 4.3 ms |

**~15x faster** with 200 fewer network round trips. `GET /api/orders` uses the
single-query version.

**Latency multiplies it.** The table above is from `npm run benchmark`. Run the same
endpoint from Pune against a PostgreSQL instance in Ohio and every one of those 201
queries pays a full cross-continent round trip: about **45 s** for the loop versus
**0.46 s** for the single JOIN (~98x). The bug is invisible in code review; it only
shows up when you measure.

Indexes are deliberately kept out of `migrate` (they live in `db/indexes.sql`) so the
before/after difference is reproducible. Run `npm run migrate -- --with-indexes` to
apply them from the start.

## Design decisions

- **Transactions on money paths.** Order creation writes the order, its line items and
  the stock decrement inside `BEGIN`/`COMMIT`. Any failure rolls back all of it.
- **`SELECT ... FOR UPDATE`** locks product rows during checkout so two concurrent
  buyers cannot both pass the stock check on the last unit.
- **`NUMERIC(10,2)` for money**, never floating point.
- **Parameterised queries everywhere** (`$1`), never string concatenation — SQL injection safe.
- **401 vs 403** are distinct: 401 means the token is missing or invalid, 403 means the
  token is valid but the action is not permitted.
- **Identical login error messages** for unknown email and wrong password, so the
  endpoint cannot be used to enumerate registered accounts.
- **Secrets in the environment variables**, never committed.

## License

MIT
