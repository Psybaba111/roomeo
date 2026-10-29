import test from "node:test";
import assert from "node:assert/strict";
import { adminRedirect, rolesAreAdmin } from "./admin-gate.ts";

test("non-admins are sent away from /admin", () => {
  assert.equal(adminRedirect({ signedIn: true, isAdmin: false }), "/dashboard");
  assert.equal(adminRedirect({ signedIn: true, isAdmin: true }), null);
  assert.equal(adminRedirect({ signedIn: false, isAdmin: false }), null);
});

test("rolesAreAdmin", () => {
  assert.equal(rolesAreAdmin(["SEEKER", "HOST"]), false);
  assert.equal(rolesAreAdmin(["ADMIN"]), true);
  assert.equal(rolesAreAdmin(["SUPER_ADMIN"]), true);
  assert.equal(rolesAreAdmin(["ADMIN"], "SUSPENDED"), false);
});
