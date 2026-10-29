import { test } from "node:test";
import assert from "node:assert/strict";
import { digilockerLine, idReviewHeading, showDigilockerButton, VERIFICATION_INTRO } from "./verification-copy.ts";

test("hides DigiLocker entirely when not configured", () => {
    assert.equal(digilockerLine({ digilockerReady: false }), null);
    assert.equal(showDigilockerButton({ digilockerReady: false }), false);
    assert.equal(idReviewHeading(false), "Get your ID approved");
  });
test("shows DigiLocker when configured", () => {
    assert.equal(showDigilockerButton({ digilockerReady: true, attempts: 0 }), true);
    assert.match(digilockerLine({ digilockerReady: true }) ?? "", /DigiLocker/);
    assert.match(idReviewHeading(true) ?? "", /^Or /);
  });
test("hides button after pass or two attempts", () => {
    assert.equal(showDigilockerButton({ digilockerReady: true, identitySource: "DIGILOCKER" }), false);
    assert.equal(showDigilockerButton({ digilockerReady: true, attempts: 2 }), false);
    assert.match(digilockerLine({ identitySource: "DIGILOCKER" }) ?? "", /verified/);
  });
test("never leaks dev/config or per-rent fee text", () => {
    const all = [VERIFICATION_INTRO, idReviewHeading(true), idReviewHeading(false),
      ...[0, 1].map((a) => digilockerLine({ digilockerReady: true, attempts: a }) ?? ""),
      digilockerLine({ digilockerReady: true, identityStatus: "FAILED" }) ?? ""].join(" ");
    assert.doesNotMatch(all, /client id|secret|deployment|499|rent payment|No DigiLocker/i);
  });

