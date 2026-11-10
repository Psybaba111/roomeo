import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { finishLoad, listErrorMessage, listItems, listView, runListLoad, startLoad, type ListLoad } from "./list-load.ts";

/** Drives runListLoad like React's setState and records every view the page would render. */
function harness<T>() {
  let state: ListLoad<T> = { kind: "loading" };
  const views: string[] = [listView(state)];
  const update = (fn: (p: ListLoad<T>) => ListLoad<T>) => {
    state = fn(state);
    if (views.at(-1) !== listView(state)) views.push(listView(state));
  };
  return { update, views, get: () => state };
}
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));
const later = <T,>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const failLater = (ms: number, msg: string) => new Promise<never>((_, j) => setTimeout(() => j(new Error(msg)), ms));

test("delayed fetch shows loading, never empty, until rows arrive", async () => {
  const h = harness<{ id: string }>();
  const run = runListLoad(() => later(40, [{ id: "ZZ TEST 1" }]), h.update, reason);
  await later(10, null);
  assert.equal(listView(h.get()), "loading");
  assert.deepEqual(listItems(h.get()), []);
  await run;
  assert.deepEqual(h.views, ["loading", "populated"]);
});

test("delayed empty result only becomes empty once settled", async () => {
  const h = harness<{ id: string }>();
  const run = runListLoad(() => later(30, []), h.update, reason);
  await later(5, null);
  assert.equal(listView(h.get()), "loading");
  await run;
  assert.deepEqual(h.views, ["loading", "empty"]);
});

test("failure is an error state with a reason, not an empty list; retry recovers", async () => {
  const h = harness<{ id: string }>();
  await runListLoad(() => failLater(5, "Network down"), h.update, reason);
  assert.equal(listView(h.get()), "error");
  assert.deepEqual(h.get(), { kind: "failed", reason: "Network down" });
  assert.equal(listErrorMessage("requests", "Network down."), "Couldn't load your requests: Network down. Tap retry.");
  assert.match(listErrorMessage("saved rooms", ""), /Couldn't load your saved rooms\. Check your connection/);
  await runListLoad(() => later(5, [{ id: "a" }]), h.update, reason);
  assert.deepEqual(h.views, ["loading", "error", "loading", "populated"]);
});

test("refresh after load keeps rows; a failed refresh flags it but keeps rows", async () => {
  const loaded: ListLoad<number> = { kind: "loaded", items: [1, 2] };
  assert.equal(startLoad(loaded), loaded);
  assert.deepEqual(finishLoad(loaded, { ok: false, reason: "x" }), { kind: "loaded", items: [1, 2], refreshError: "x" });
  assert.equal(listView(finishLoad(loaded, { ok: false, reason: "x" })), "populated");
  assert.deepEqual(finishLoad(loaded, { ok: true, items: [] }), { kind: "loaded", items: [] });
});

test("results landing after unmount are dropped", async () => {
  const h = harness<number>();
  await runListLoad(() => later(5, [1]), h.update, reason, () => false);
  assert.equal(listView(h.get()), "loading");
});

test("/applications and /saved use the four-state list, no unconditional empty text", () => {
  for (const f of ["applications.tsx", "saved.tsx"]) {
    const src = readFileSync(new URL(`../../routes/${f}`, import.meta.url), "utf8");
    assert.ok(src.includes("useListLoad(") && src.includes("<ListStatus"), f);
    assert.ok(!/\.length === 0 \?/.test(src), `${f} must not render empty text off a raw length check`);
  }
});
