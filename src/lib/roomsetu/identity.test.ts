import assert from "node:assert/strict";
import test from "node:test";
import { digilockerAuthorizeUrl, judgeDigilockerUser, nextIdentityAttempt } from "./identity.ts";

test("the second DigiLocker miss closes the thread", () => {
  assert.deepEqual(nextIdentityAttempt(0, false), { attempts: 1, status: "UNVERIFIED", closeThreads: false });
  assert.deepEqual(nextIdentityAttempt(1, false), { attempts: 2, status: "FAILED", closeThreads: true });
  assert.equal(nextIdentityAttempt(1, true).closeThreads, false);
  assert.equal(nextIdentityAttempt(1, true).status, "VERIFIED");
});

test("DigiLocker user details need a name and account id, not a document number", () => {
  const passed = judgeDigilockerUser({ name: "Asha Rao", digilocker_id: "123e4567-e89b-12d3-a456-426655440000", eaadhaar: "Y" });
  assert.equal(passed.ok, true);
  if (passed.ok) assert.equal(passed.person.eaadhaar, true);
  assert.equal(judgeDigilockerUser({ name: "Asha", aadhaar: "123412341234" }).ok, false);
});

test("authorize url is the partner oauth endpoint", () => {
  const url = new URL(digilockerAuthorizeUrl("https://digilocker.meripehchaan.gov.in/public", "client", "https://roomeo.com/verify/digilocker", "state-1"));
  assert.equal(url.pathname, "/public/oauth2/1/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), "https://roomeo.com/verify/digilocker");
  assert.equal(url.searchParams.get("state"), "state-1");
});
