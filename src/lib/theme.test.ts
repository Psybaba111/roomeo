import test from "node:test";
import assert from "node:assert/strict";
import { contrast, PALETTE, textPairs } from "./theme.ts";

test("contrast math matches known values", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
  assert.equal(contrast("#777777", "#777777"), 1);
});

for (const mode of ["light", "dark"] as const) {
  test(`${mode} palette meets WCAG AA (4.5:1) for text`, () => {
    for (const [name, fg, bg] of textPairs(PALETTE[mode])) {
      assert.ok(contrast(fg, bg) >= 4.5, `${mode} ${name}: ${contrast(fg, bg).toFixed(2)}`);
    }
  });
}

test("white text on brand buttons passes AA in light mode, ink on brand in dark", () => {
  assert.ok(contrast("#ffffff", PALETTE.light.brand) >= 4.5);
  assert.ok(contrast(PALETTE.light.ink, PALETTE.dark.brand) >= 4.5);
});
