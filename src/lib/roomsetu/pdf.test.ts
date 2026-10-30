import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPdf, pdfSafe, wrap } from "./pdf.ts";

test("pdf is a valid-looking PDF with xref and pages", () => {
  const bytes = buildPdf([{ text: "Hello (world) ₹8,999", size: 14, bold: true }, ...Array.from({ length: 80 }, (_, i) => ({ text: `line ${i}` }))]);
  const s = Buffer.from(bytes).toString("latin1");
  assert.ok(s.startsWith("%PDF-1.4"));
  assert.ok(s.trimEnd().endsWith("%%EOF"));
  assert.match(s, /\/Count 2/);
  assert.match(s, /Hello \\\(world\\\) Rs\. 8,999/);
  const xref = Number(/startxref\n(\d+)/.exec(s)![1]);
  assert.equal(s.slice(xref, xref + 4), "xref");
});

test("pdfSafe drops emoji and escapes", () => {
  assert.equal(pdfSafe("hi 🫶 (a)\\"), "hi  \\(a\\)\\\\");
});

test("wrap keeps lines within budget", () => {
  for (const l of wrap("word ".repeat(200), 10)) assert.ok(l.length <= 99);
});
