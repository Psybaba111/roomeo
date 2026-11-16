import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, splitContact, validateWaitlist, waitlistAllows, waitlistCsv, waitlistModeOn, WaitlistError } from "./waitlist.ts";

test("ROOMEO_WAITLIST_MODE: off unless explicitly on (unset = today's behaviour)", () => {
  assert.equal(waitlistModeOn({}), false);
  for (const v of ["", "false", "0", "off", "no", "yes please"]) assert.equal(waitlistModeOn({ ROOMEO_WAITLIST_MODE: v }), false, v);
  for (const v of ["true", "TRUE", " 1 ", "on"]) assert.equal(waitlistModeOn({ ROOMEO_WAITLIST_MODE: v }), true, v);
  // Other env (Vercel preview, dev) never turns it on by itself.
  assert.equal(waitlistModeOn({ VERCEL_ENV: "preview", NODE_ENV: "development" }), false);
});

test("contact: one field takes an email or an Indian mobile", () => {
  assert.equal(normalizePhone("+91 98450 12345"), "9845012345");
  assert.equal(normalizePhone("09845012345"), "9845012345");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("5845012345"), null);
  assert.deepEqual(splitContact(" ZZ.Test@Example.com "), { email: "zz.test@example.com", phone: null });
  assert.deepEqual(splitContact("98450-12345"), { email: null, phone: "9845012345" });
  assert.deepEqual(splitContact("not an email@"), { email: null, phone: null });
});

test("validateWaitlist: consent, name, contact, city and role required; quiz type optional", () => {
  const ok = { name: " ZZ TEST  Asha ", contact: "zz.test.asha@example.com", city: "Mangaluru", role: "tenant", consent: true, roomieType: "tidy", source: "quiz" };
  assert.deepEqual(validateWaitlist(ok), { name: "ZZ TEST Asha", email: "zz.test.asha@example.com", phone: null, city: "Mangaluru", role: "tenant", roomieType: "tidy", source: "quiz" });
  assert.throws(() => validateWaitlist({ ...ok, consent: "true" }), WaitlistError);
  assert.throws(() => validateWaitlist({ ...ok, consent: false }), /Tick the box/);
  assert.throws(() => validateWaitlist({ ...ok, name: "  " }), /name/);
  assert.throws(() => validateWaitlist({ ...ok, contact: "abc" }), /email or 10-digit/);
  assert.throws(() => validateWaitlist({ ...ok, city: "560034" }), /city/);
  assert.throws(() => validateWaitlist({ ...ok, role: "admin" }), /tenant or owner/);
  const w = validateWaitlist({ ...ok, roomieType: "villain", source: "evil", role: "owner", name: "<b>ZZ</b>" });
  assert.equal(w.roomieType, null);
  assert.equal(w.source, "home");
  assert.equal(w.role, "owner");
  assert.ok(!/[<>]/.test(w.name));
  assert.throws(() => validateWaitlist(null), WaitlistError);
});

test("who keeps browse pages in waitlist mode", () => {
  assert.equal(waitlistAllows("search", { signedIn: false, isAdmin: false }), false);
  assert.equal(waitlistAllows("search", { signedIn: true, isAdmin: false }), false);
  assert.equal(waitlistAllows("search", { signedIn: true, isAdmin: true }), true);
  assert.equal(waitlistAllows("listing", { signedIn: false, isAdmin: false }), false);
  assert.equal(waitlistAllows("listing", { signedIn: true, isAdmin: false }), true); // existing deals keep working
});

test("CSV: header, quoting, and no spreadsheet formula injection", () => {
  const csv = waitlistCsv([
    { id: "1", name: '=HYPERLINK("x")', email: "a@example.com", phone: null, city: "Pune, MH", role: "tenant", roomieType: "tidy", source: "quiz", createdAt: "2026-11-16 14:00" },
    { id: "2", name: "+91 trick", email: null, phone: "9845012345", city: "Mangaluru", role: "owner", roomieType: null, source: "home", createdAt: "2026-11-16 14:01" },
  ]);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "created_at,name,email,phone,city,role,roomie_type,source");
  assert.equal(lines[1], `2026-11-16 14:00,"'=HYPERLINK(""x"")",a@example.com,,"Pune, MH",tenant,tidy,quiz`);
  assert.equal(lines[2], "2026-11-16 14:01,'+91 trick,,9845012345,Mangaluru,owner,,home");
});
