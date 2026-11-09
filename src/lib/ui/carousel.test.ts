import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activeSlide, slideLabel, slideOffset } from "./carousel.ts";

test("activeSlide rounds to the nearest card and clamps", () => {
  assert.equal(activeSlide(0, 300, 4), 0);
  assert.equal(activeSlide(140, 300, 4), 0);
  assert.equal(activeSlide(160, 300, 4), 1);
  assert.equal(activeSlide(900, 300, 4), 3);
  assert.equal(activeSlide(5000, 300, 4), 3);
  assert.equal(activeSlide(-20, 300, 4), 0);
  assert.equal(activeSlide(100, 0, 4), 0);
  assert.equal(activeSlide(100, 300, 0), 0);
  assert.equal(activeSlide(Number.NaN, 300, 4), 0);
});

test("slideOffset and labels", () => {
  assert.equal(slideOffset(2, 312, 4), 624);
  assert.equal(slideOffset(9, 312, 4), 936);
  assert.equal(slideOffset(-1, 312, 4), 0);
  assert.equal(slideLabel(0, 4), "1 of 4");
  assert.equal(slideLabel(3, 4), "4 of 4");
  assert.equal(slideLabel(0, 0), "");
});

test("home uses the peeking, snapping carousel with dots", () => {
  const home = readFileSync(new URL("../../routes/index.tsx", import.meta.url), "utf8");
  assert.ok(home.includes("<BedCarousel rooms={data.listings} />"));
  const c = readFileSync(new URL("../../components/bed-carousel.tsx", import.meta.url), "utf8");
  for (const cls of ["snap-x", "snap-mandatory", "snap-start", "w-[80%]", "-mx-4", "overscroll-x-contain"]) assert.ok(c.includes(cls), cls);
  assert.ok(c.includes('data-testid="carousel-dots"') && c.includes("aria-current"));
});
