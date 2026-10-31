import test from "node:test";
import assert from "node:assert/strict";
import { testDb } from "./pgtest.ts";
import { adminCount, claimFirstAdmin, findUser, grantAdmin, normalisePhone, parseIdentifier, revokeAdmin, tokenMatches, type Query } from "./admin-bootstrap.ts";

const TOKEN = "x".repeat(32);

async function setup() {
  const { pg } = await testDb();
  const q: Query = async (t, p) => (await pg.query(t, p)).rows as Record<string, unknown>[];
  await pg.query(`insert into "user" (id, name, email, "emailVerified") values ('u1','Rohith','Rohith@Example.com', true), ('u2','Asha','asha@example.com', true)`);
  await pg.query(`insert into profiles (user_id, full_name, phone_e164, phone_verified_at) values ('u1','Rohith','+919845011111', now()), ('u2','Asha', '+919845022222', null)`);
  return q;
}

test("identifier parsing", () => {
  assert.deepEqual(parseIdentifier(" Rohith@Example.com "), { kind: "email", value: "rohith@example.com" });
  assert.deepEqual(parseIdentifier("98450 11111"), { kind: "phone", value: "+919845011111" });
  assert.equal(normalisePhone("+91 98450-11111"), "+919845011111");
  assert.throws(() => parseIdentifier(""));
  assert.throws(() => parseIdentifier("12"));
});

test("CLI core: find by email or verified phone, grant is idempotent, revoke works", async () => {
  const q = await setup();
  const a = await findUser(q, parseIdentifier("rohith@example.com"));
  assert.equal(a.userId, "u1");
  assert.equal((await findUser(q, parseIdentifier("9845011111"))).userId, "u1");
  await assert.rejects(findUser(q, parseIdentifier("9845022222")), /verified phone/);
  await assert.rejects(findUser(q, parseIdentifier("nobody@example.com")), /No Roomeo account/);
  assert.equal(await adminCount(q), 0);
  assert.deepEqual(await grantAdmin(q, "u1"), { granted: true });
  assert.deepEqual(await grantAdmin(q, "u1"), { granted: false });
  assert.equal(await adminCount(q), 1);
  assert.deepEqual(await revokeAdmin(q, "u1"), { revoked: true });
  assert.equal(await adminCount(q), 0);
});

test("token compare: unset/short tokens never match", () => {
  assert.equal(tokenMatches(undefined, ""), false);
  assert.equal(tokenMatches("short", "short"), false);
  assert.equal(tokenMatches(TOKEN, TOKEN), true);
  assert.equal(tokenMatches(TOKEN, TOKEN + "y"), false);
  assert.equal(tokenMatches(TOKEN, 123), false);
});

test("first-run claim is guarded: off without token, wrong token, unverified phone, only once", async () => {
  const q = await setup();
  await assert.rejects(claimFirstAdmin(q, { configuredToken: undefined, givenToken: TOKEN, userId: "u1" }), /off/);
  await assert.rejects(claimFirstAdmin(q, { configuredToken: TOKEN, givenToken: "nope", userId: "u1" }), /wrong/);
  await assert.rejects(claimFirstAdmin(q, { configuredToken: TOKEN, givenToken: TOKEN, userId: "u2" }), /Verify your phone/);
  assert.deepEqual(await claimFirstAdmin(q, { configuredToken: TOKEN, givenToken: TOKEN, userId: "u1" }), { ok: true });
  await assert.rejects(claimFirstAdmin(q, { configuredToken: TOKEN, givenToken: TOKEN, userId: "u2" }), /already exists/);
});
