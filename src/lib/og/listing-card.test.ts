import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_PHOTO_LABEL, hasAiPhotos, clip, ogCardModel, ogCardTree, usablePhoto } from "./listing-card.ts";

const base = { title: "Mud Home Premium PG · AC 2-sharing", roomType: "PG", locality: "Bunder", city: "Mangaluru", rent: 8999, allInInr: null, verified: true, photo: "data:image/jpeg;base64,AAAA" };

test("card shows the all-in price when set, else rent", () => {
  assert.equal(ogCardModel(base).priceLabel, "₹8,999/mo");
  const m = ogCardModel({ ...base, allInInr: 9499 });
  assert.equal(m.priceLabel, "₹9,499/mo");
  assert.match(m.priceNote, /all-in/);
});

test("area, badge and photo", () => {
  const m = ogCardModel(base);
  assert.equal(m.area, "Bunder, Mangaluru");
  assert.equal(m.verified, true);
  assert.equal(m.photo, base.photo);
  assert.equal(ogCardModel({ ...base, verified: false }).verified, false);
});

test("only paintable photos are used", () => {
  assert.equal(usablePhoto("data:image/webp;base64,AAA"), null);
  assert.equal(usablePhoto("/demo/x.jpg"), null);
  assert.equal(usablePhoto("https://x/y.jpg"), "https://x/y.jpg");
  assert.equal(usablePhoto(null), null);
});

test("long titles are clipped", () => {
  assert.equal(clip("a".repeat(100), 10).length, 10);
  assert.ok(ogCardModel({ ...base, title: "x".repeat(200) }).headline.length <= 70);
});

test("tree has the badge text only when verified", () => {
  const s = (v: boolean) => JSON.stringify(ogCardTree(ogCardModel({ ...base, verified: v })));
  assert.ok(s(true).includes("verified by phone"));
  assert.ok(!s(false).includes("verified by phone"));
  assert.ok(s(true).includes("roomeo"));
});

test("AI preview photos get a visible label", () => {
  const mud = "Bright AC room. AI photos for representation purpose only; real photos coming soon.";
  assert.equal(hasAiPhotos(mud), true);
  assert.equal(hasAiPhotos("AI-generated images, real ones soon"), true);
  assert.equal(hasAiPhotos("Near the bus stand, fast wifi"), false);
  const tree = (d: string, photo: string | null = base.photo) => JSON.stringify(ogCardTree(ogCardModel({ ...base, photo, description: d })));
  assert.ok(tree(mud).includes(AI_PHOTO_LABEL));
  assert.ok(!tree("real photos").includes(AI_PHOTO_LABEL));
  assert.ok(!tree(mud, null).includes(AI_PHOTO_LABEL), "no photo, no label");
});
