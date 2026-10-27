# roomeo

A bed in Bengaluru. People choose their own group. The owner says yes once. Each person pays their own share. ₹499 once, not a broker's month. No visit. No score.

The product is [MASTER_PRD.md](MASTER_PRD.md). Approved 27 October 2026.

This repository is the phone site. Bengaluru listings only. A chain cannot list. Sample beds are marked and do not collect rent.

## Run

```bash
npm install
npm run dev
```

The dev server listens on port 8080. Postgres is used when `DATABASE_URL` is set. Otherwise the app uses embedded PGLite. Payment and identity partner keys stay in the environment. They are not in this repository.
