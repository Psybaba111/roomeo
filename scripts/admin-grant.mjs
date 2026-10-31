#!/usr/bin/env node
/**
 * Grant (or revoke) Roomeo operator access for an EXISTING account.
 *
 *   DATABASE_URL=... npm run admin:grant -- <email-or-phone>
 *   DATABASE_URL=... npm run admin:grant -- --revoke <email-or-phone>
 *
 * No credentials are stored or printed. The person must already have signed up
 * (phone lookups need a verified phone). Prints which account was matched.
 */
import pg from "pg";
import { parseIdentifier, findUser, grantAdmin, revokeAdmin } from "../src/lib/roomsetu/admin-bootstrap.ts";

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const ident = args.filter((a) => !a.startsWith("--"))[0];
if (!ident) {
  console.error("Usage: npm run admin:grant -- [--revoke] <email-or-phone>");
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. This script only works against a real Postgres database.");
  process.exit(2);
}
const client = new pg.Client({ connectionString: url, ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
try {
  await client.connect();
  const q = async (text, params) => (await client.query(text, params)).rows;
  const id = parseIdentifier(ident);
  const user = await findUser(q, id);
  const host = new URL(url).hostname;
  if (revoke) {
    const r = await revokeAdmin(q, user.userId);
    console.log(r.revoked ? `Revoked operator access from ${user.name} (${user.userId}) on ${host}.` : `${user.name} was not an operator.`);
  } else {
    const r = await grantAdmin(q, user.userId);
    console.log(r.granted ? `Granted operator access to ${user.name} (${user.userId}) on ${host}.` : `${user.name} is already an operator.`);
  }
} catch (e) {
  console.error(`admin:grant failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
