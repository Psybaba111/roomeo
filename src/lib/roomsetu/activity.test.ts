import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTIVITY_FEE_LINE,
  activityRow,
  activityStatusLine,
  byGroup,
  groupOf,
  pinnedPrimaryAction,
  pinnedStepLine,
  primaryAction,
  type DealFacts,
  type DealLite,
} from "./activity.ts";

const facts = (over: Partial<DealFacts> = {}): DealFacts => ({
  iSigned: false,
  issued: false,
  cancelled: false,
  feeOn: true,
  feePaid: false,
  feeTotal: 589,
  movedIn: false,
  ...over,
});

const deal = (over: Partial<DealLite> = {}): DealLite => ({
  id: "a1",
  listingId: "L1",
  title: "Sunny bed",
  city: "Mangaluru",
  rent: 9000,
  deposit: 18000,
  status: "PENDING",
  mine: true,
  otherName: "Asha Rao",
  ...over,
});

test("a sent request waits on the owner", () => {
  assert.equal(groupOf({ status: "PENDING", mine: true, facts: facts() }), "waiting");
});

test("an accepted deal with nothing signed needs the tenant", () => {
  const g = groupOf({ status: "ACCEPTED", mine: true, facts: facts() });
  assert.equal(g, "needs-you");
  const row = activityRow(deal({ status: "ACCEPTED" }), facts());
  assert.equal(row.current?.key, "sign");
  assert.equal(primaryAction(row).label, "Sign agreement");
});

test("tenant already signed but owner has not: waiting, not needs-you", () => {
  const g = groupOf({ status: "ACCEPTED", mine: true, facts: facts({ iSigned: true }) });
  assert.equal(g, "waiting");
});

test("issued agreement with unpaid fee needs the tenant to pay ₹589", () => {
  const row = activityRow(deal({ status: "ACCEPTED" }), facts({ iSigned: true, issued: true }));
  assert.equal(row.group, "needs-you");
  assert.equal(row.current?.key, "pay");
  assert.equal(primaryAction(row).label, "Pay ₹589");
});

test("issued + paid lands on move in", () => {
  const row = activityRow(deal({ status: "ACCEPTED" }), facts({ iSigned: true, issued: true, feePaid: true }));
  assert.equal(row.current?.key, "movein");
  assert.equal(primaryAction(row).label, "Move in");
});

test("moved in is done, and the button is just Chat", () => {
  const row = activityRow(deal({ status: "ACCEPTED" }), facts({ iSigned: true, issued: true, feePaid: true, movedIn: true }));
  assert.equal(row.group, "done");
  assert.equal(primaryAction(row).label, "Chat");
});

test("no fee switched on skips the pay step (same rule as dealSteps)", () => {
  const row = activityRow(deal({ status: "ACCEPTED" }), facts({ iSigned: true, issued: true, feeOn: false }));
  assert.equal(row.current?.key, "movein");
  assert.equal(row.group, "needs-you");
});

test("declined and withdrawn land in done with a chat button", () => {
  for (const status of ["DECLINED", "WITHDRAWN"]) {
    const row = activityRow(deal({ status }), facts());
    assert.equal(row.group, "done", status);
    assert.equal(primaryAction(row).label, "Chat", status);
  }
});

test("a cancelled agreement is finished, not a to-do", () => {
  const row = activityRow(deal({ status: "ACCEPTED" }), facts({ iSigned: true, issued: true, cancelled: true }));
  assert.equal(row.group, "done");
});

test("every row gets exactly one primary button", () => {
  const cases: { status: string; f: DealFacts }[] = [
    { status: "PENDING", f: facts() },
    { status: "ACCEPTED", f: facts() },
    { status: "ACCEPTED", f: facts({ iSigned: true, issued: true }) },
    { status: "ACCEPTED", f: facts({ iSigned: true, issued: true, feePaid: true }) },
    { status: "ACCEPTED", f: facts({ iSigned: true, issued: true, feePaid: true, movedIn: true }) },
    { status: "DECLINED", f: facts() },
  ];
  for (const c of cases) {
    const row = activityRow(deal({ status: c.status }), c.f);
    const action = primaryAction(row);
    assert.ok(action.label.length > 0);
    assert.ok(["sign", "pay", "movein", "chat", "none"].includes(action.kind));
  }
});

test("groups render in a fixed order and empty buckets are dropped", () => {
  const rows = [
    activityRow(deal({ id: "1", status: "DECLINED" }), facts()),
    activityRow(deal({ id: "2", status: "ACCEPTED" }), facts()),
    activityRow(deal({ id: "3", status: "PENDING" }), facts()),
  ];
  assert.deepEqual(
    byGroup(rows).map((g) => g.key),
    ["needs-you", "waiting", "done"],
  );
  assert.deepEqual(byGroup([]), []);
});

test("status line is plain-language and never a raw enum", () => {
  for (const status of ["PENDING", "ACCEPTED", "DECLINED", "WITHDRAWN"]) {
    const line = activityStatusLine({ status, group: "waiting" });
    assert.ok(line.length > 0);
    assert.ok(!line.includes(status), line);
  }
});

test("the fee line keeps the approved ₹589 wording", () => {
  assert.match(ACTIVITY_FEE_LINE, /₹589 one-time Roomeo fee \(₹499 \+ GST\)/);
  assert.match(ACTIVITY_FEE_LINE, /renter and owner each pay it once/);
  assert.match(ACTIVITY_FEE_LINE, /only after the owner says yes/);
  assert.match(ACTIVITY_FEE_LINE, /Rent and deposit go straight to the owner/);
});

test("the activity page uses the shared dealSteps logic instead of re-deriving it", () => {
  const src = readFileSync(new URL("../../routes/activity.tsx", import.meta.url), "utf8");
  assert.ok(src.includes("getActivityDeals"));
  assert.ok(!src.includes("update applications"), "activity must never write a status");
  assert.ok(!src.includes("setApplication({"), "activity must never change a request status");
});

// ── Pinned deal card in the chat thread (PR 2) ───────────────────────────────

test("pinned card asks for a signature when the tenant is next", () => {
  const row = activityRow(deal({ status: "ACCEPTED" }), facts());
  assert.deepEqual(pinnedPrimaryAction(row), { kind: "sign", label: "Sign agreement" });
});

test("pinned card asks for the fee once the agreement is issued", () => {
  const row = activityRow(deal({ status: "ACCEPTED" }), facts({ iSigned: true, issued: true }));
  assert.deepEqual(pinnedPrimaryAction(row), { kind: "pay", label: "Pay ₹589" });
});

test("pinned card moves on to move in after the fee is paid", () => {
  const row = activityRow(deal({ status: "ACCEPTED" }), facts({ iSigned: true, issued: true, feePaid: true }));
  assert.deepEqual(pinnedPrimaryAction(row), { kind: "movein", label: "Move in" });
});

test("pinned card never offers a dead button once the deal is done", () => {
  const moved = activityRow(deal({ status: "ACCEPTED" }), facts({ iSigned: true, issued: true, feePaid: true, movedIn: true }));
  assert.equal(pinnedPrimaryAction(moved).kind, "done");
  for (const status of ["DECLINED", "WITHDRAWN"]) {
    assert.equal(pinnedPrimaryAction(activityRow(deal({ status }), facts())).kind, "done", status);
  }
});

test("pinned card waits quietly instead of nagging when the ball is with the owner", () => {
  const waiting = activityRow(deal({ status: "PENDING" }), facts());
  assert.equal(pinnedPrimaryAction(waiting).kind, "wait");
  const signedByMe = activityRow(deal({ status: "ACCEPTED" }), facts({ iSigned: true }));
  assert.equal(pinnedPrimaryAction(signedByMe).kind, "wait");
});

test("pinned card and Activity agree on the same current step", () => {
  const cases = [
    facts(),
    facts({ iSigned: true }),
    facts({ iSigned: true, issued: true }),
    facts({ iSigned: true, issued: true, feePaid: true }),
    facts({ iSigned: true, issued: true, feePaid: true, movedIn: true }),
  ];
  for (const f of cases) {
    const row = activityRow(deal({ status: "ACCEPTED" }), f);
    const pinned = pinnedPrimaryAction(row);
    // The pinned card must never claim an action the Activity row would not.
    if (row.group === "done") assert.equal(pinned.kind, "done");
    if (row.group === "waiting") assert.equal(pinned.kind, "wait");
    if (row.group === "needs-you" && row.current?.key === "pay") assert.equal(pinned.kind, "pay");
    if (row.group === "needs-you" && row.current?.key === "movein") assert.equal(pinned.kind, "movein");
  }
});

test("step counter reads 1..N and finishes on the last step", () => {
  const first = pinnedStepLine(activityRow(deal({ status: "ACCEPTED" }), facts()).steps);
  assert.deepEqual(first, { label: "Sign agreement", index: 2, total: 4 });
  const issued = pinnedStepLine(activityRow(deal({ status: "ACCEPTED" }), facts({ iSigned: true, issued: true })).steps);
  assert.deepEqual(issued, { label: "Pay fee", index: 3, total: 4 });
  const done = pinnedStepLine(activityRow(deal({ status: "ACCEPTED" }), facts({ iSigned: true, issued: true, feePaid: true, movedIn: true })).steps);
  assert.equal(done.label, "Done");
  assert.equal(done.index, done.total);
});

test("the chat thread renders the shared pinned card, not its own step logic", () => {
  const src = readFileSync(new URL("../../routes/messages.tsx", import.meta.url), "utf8");
  assert.ok(src.includes("PinnedDealCard"), "uses the shared component");
  assert.ok(!src.includes("dealSteps("), "messages must not re-derive steps");
  assert.ok(src.includes("pinnedRequestFor"), "still pins the matching request");
});

test("a pending request never pretends to be at the signing step", () => {
  const row = activityRow(deal({ status: "PENDING" }), facts());
  const line = pinnedStepLine(row.steps, "PENDING");
  assert.equal(line.label, "Request sent");
  assert.equal(line.index, 1);
  // The pinned button is a status line, not an action.
  assert.equal(pinnedPrimaryAction(row).kind, "wait");
});
