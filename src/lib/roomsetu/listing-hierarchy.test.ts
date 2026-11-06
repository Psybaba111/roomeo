import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../../routes/listing.$id.tsx", import.meta.url), "utf8");

test("the fee line is unchanged and still reads from the shared constant", () => {
  assert.ok(page.includes("FEE_UNDER_PRICE"));
  const cta = readFileSync(new URL("./booking-cta.ts", import.meta.url), "utf8");
  assert.match(cta, /₹589 one-time Roomeo fee, only after the owner says yes · rent & deposit go straight to the owner/);
});

test("one request CTA, and it keeps its ids and labels", () => {
  assert.ok(page.includes('data-testid="request-bed"'));
  assert.ok(page.includes('data-testid="sticky-request-bed"'));
  assert.ok(page.includes("REQUEST_CTA"));
  assert.ok(page.includes("REQUEST_CTA_SIGNED_OUT"));
  // Only two mount points (inline + sticky); no third competing button.
  assert.equal((page.match(/onClick=\{requestBed\}/g) ?? []).length, 2);
});

test("save and share are photo overlays with their original test ids", () => {
  assert.ok(page.includes('data-testid="save-icon"'));
  assert.ok(page.includes('data-testid="share-icon"'));
  assert.ok(page.includes('data-testid="listing-menu"'));
  // They sit inside the gallery container, before the sidebar starts.
  const gallery = page.indexOf('data-testid="save-icon"');
  const sidebar = page.indexOf('lg:col-span-5');
  assert.ok(gallery > 0 && sidebar > gallery, "overlay renders in the gallery");
});

test("trial nights, report and the extras all open in sheets, not inline", () => {
  // Sheet forwards its `testId` prop to data-testid on the dialog element.
  assert.ok(page.includes('testId="trial-sheet"'));
  assert.ok(page.includes('testId="report-sheet"'));
  assert.ok(page.includes('testId="listing-menu-sheet"'));
  assert.ok(page.includes('testId="share-sheet"'));
  const sheet = readFileSync(new URL("../../components/sheet.tsx", import.meta.url), "utf8");
  assert.ok(sheet.includes("data-testid={testId}"), "Sheet renders the hook as data-testid");
  assert.ok(page.includes("TrialNightsSheetBody"));
  // The old inline blocks are gone.
  assert.ok(!page.includes('onClick={() => setReportOpen((v) => !v)}'), "inline report toggle removed");
  assert.ok(!page.includes("id=\"trial\""), "inline trial anchor removed");
});

test("nothing functional was deleted: every secondary action stays reachable from the menu", () => {
  for (const id of [
    'data-testid="menu-trial"',
    'data-testid="menu-share"',
    'data-testid="menu-report"',
    'data-testid="menu-more-rooms"',
    "SquadShortlistButton",
    'data-testid="video-tour-link"',
    'data-testid="fee-line"',
    'data-testid="deposit-terms"',
    'data-testid="headline-price"',
    'data-testid="sticky-cta"',
  ]) {
    assert.ok(page.includes(id), `missing ${id}`);
  }
});

test("the page no longer carries a second inline action column", () => {
  // ShareButtons now lives only inside the share sheet.
  assert.equal((page.match(/<ShareButtons/g) ?? []).length, 1);
});
