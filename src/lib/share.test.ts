import test from "node:test";
import assert from "node:assert/strict";
import { shareNative, shareText, whatsappShareUrl } from "./share.ts";

test("whatsapp share url encodes text and link", () => {
  assert.equal(whatsappShareUrl("Bed & more", "https://r.co/l/1"), "https://wa.me/?text=Bed%20%26%20more%20https%3A%2F%2Fr.co%2Fl%2F1");
  assert.equal(shareText({ title: "Room", locality: "HSR", rent: 12000 }), "Room in HSR for ₹12,000/mo on roomeo 👀");
});

test("native share falls back to copying the link", async () => {
  const d = { title: "t", text: "x", url: "https://r.co" };
  assert.equal(await shareNative(d, { share: async () => {} }), "shared");
  let copied = "";
  assert.equal(await shareNative(d, { share: async () => { throw new Error("cancel"); }, clipboard: { writeText: async (s) => { copied = s; } } }), "copied");
  assert.equal(copied, "https://r.co");
  assert.equal(await shareNative(d, {}), "unavailable");
});

test("share text uses the all-in price when the owner set one", () => {
  assert.equal(shareText({ title: "Room", locality: "HSR", rent: 12000, allInInr: 13500 }), "Room in HSR for ₹13,500/mo all-in on roomeo 👀");
  assert.equal(shareText({ title: "Room", locality: "HSR", rent: 12000, allInInr: null }), "Room in HSR for ₹12,000/mo on roomeo 👀");
});
