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

## Deploying

`npm run build` only builds. Migrations are a separate step so preview builds never touch the production database:

```bash
npm ci && npm run build        # build (Vercel build command)
DATABASE_URL=... npm run db:migrate   # run once per release, before or right after promoting the deploy
```

Node 22+ is required (`engines`, `.nvmrc`). CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build on Node 22.

### Verification
Publishing a bed requires a verified phone (OTP) **and** a verified ID (DigiLocker, or an operator desk pass). See `.env.example` for `OTP_PROVIDER`, `SMS_GATEWAY_*` and `DIGILOCKER_*`.

### Operator (admin) access
Nobody becomes an operator by signing up. Two safe ways, no credentials in the repo:

1. **CLI (preferred).** The person signs up on the site first (and verifies their phone if you use a phone number). Then someone with database access runs:
   ```bash
   DATABASE_URL=... npm run admin:grant -- you@example.com     # or a phone: 98450 11111
   DATABASE_URL=... npm run admin:grant -- --revoke you@example.com
   ```
   It grants `SUPER_ADMIN` to that one existing account, is idempotent, and prints who it matched.
2. **First-run claim (optional).** Set `ADMIN_BOOTSTRAP_TOKEN` (24+ random characters) in the environment. While it is set *and no admin exists*, a signed-in user with a verified phone can open `/admin-claim` and enter the token once. After the first admin exists it refuses, and you should remove the variable.

### Tests
`npm test` runs `test:scripts` (the template script tests that apply to this app) and `test:app` (`src/lib/**/*.test.ts`, including PGlite-backed SQL tests). The other `scripts/*.test.mjs` files assert builder-template defaults (auth off, `.grok/skills` present) that this app intentionally diverges from, so they are not run.
