import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activeTabKey, navTabs, roleOf } from "./nav.ts";

const shell = readFileSync(new URL("../../components/shell.tsx", import.meta.url), "utf8");
const navSrc = readFileSync(new URL("./nav.ts", import.meta.url), "utf8");

test("renters get four tabs: Beds, Activity, Chats, Profile", () => {
  const tabs = navTabs("renter");
  assert.deepEqual(
    tabs.map((t) => t.label),
    ["Beds", "Activity", "Chats", "Profile"],
  );
  assert.deepEqual(
    tabs.map((t) => t.to),
    ["/search", "/activity", "/messages", "/profile"],
  );
  assert.equal(tabs.length, 4);
});

test("owners get four tabs: Inbox, Chats, My beds, Profile, badge on Inbox", () => {
  const tabs = navTabs("owner", "9+");
  assert.deepEqual(
    tabs.map((t) => t.label),
    ["Inbox", "Chats", "My beds", "Profile"],
  );
  assert.equal(tabs.length, 4);
  assert.equal(tabs.find((t) => t.key === "inbox")?.badge, "9+");
  // The badge never rides on any other tab.
  assert.deepEqual(
    tabs.filter((t) => t.badge).map((t) => t.key),
    ["inbox"],
  );
});

test("role comes from the owner flag, never from intent", () => {
  assert.equal(roleOf({ isOwner: true }), "owner");
  assert.equal(roleOf({ isOwner: false }), "renter");
});

test("active tab follows the path, including nested listing and saved links", () => {
  const renter = navTabs("renter");
  assert.equal(activeTabKey(renter, "/search"), "beds");
  assert.equal(activeTabKey(renter, "/listing/abc"), "beds");
  assert.equal(activeTabKey(renter, "/saved"), "beds");
  assert.equal(activeTabKey(renter, "/activity"), "activity");
  assert.equal(activeTabKey(renter, "/applications"), "activity");
  assert.equal(activeTabKey(renter, "/messages"), "chats");
  assert.equal(activeTabKey(renter, "/profile"), "profile");
  assert.equal(activeTabKey(renter, "/pricing"), null);

  const owner = navTabs("owner");
  assert.equal(activeTabKey(owner, "/inbox"), "inbox");
  assert.equal(activeTabKey(owner, "/dashboard"), "mybeds");
  assert.equal(activeTabKey(owner, "/edit-listing/x"), "mybeds");
});

test("nav never grows past four tabs (the whole point of PR 1)", () => {
  for (const role of ["renter", "owner"] as const) {
    assert.ok(navTabs(role).length <= 4, role);
  }
});

test("shell renders a four-column bottom nav and no 'Yours' pill", () => {
  assert.match(shell, /grid-cols-4/);
  assert.ok(!shell.includes("grid-cols-6"), "the six-tab grid is gone");
  assert.ok(!shell.includes(">Yours<") && !shell.includes('"Yours"'), "the Yours pill is gone");
  assert.match(shell, /data-testid="inbox-badge"/);
  // The tab hooks keep their old names so existing checks and screenshots still find them.
  assert.match(navSrc, /testId: "nav-inbox"/);
  assert.match(shell, /data-testid=\{testId\}/);
  // Kept: the phone check needs >= h-16 tap targets.
  assert.match(shell, /flex h-16 flex-col/);
});
