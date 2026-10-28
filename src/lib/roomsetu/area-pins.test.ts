import test from "node:test";
import assert from "node:assert/strict";
import { areaPins, pinLabel } from "./area-pins.ts";

const C = [
  { name: "HSR Layout", lat: 12.91234567, lng: 77.64123456 },
  { name: "Koramangala", lat: 12.9352, lng: 77.6245 },
  { name: "Nowhere", lat: 0, lng: 0 },
];

test("groups rooms by locality centroid, rounded, ignores unknown areas", () => {
  const pins = areaPins(
    [
      { locality: "HSR Layout", rent: 12000 },
      { locality: "hsr layout", rent: 9000 },
      { locality: "Koramangala", rent: 16000 },
      { locality: "Mars", rent: 1 },
      { locality: "Nowhere", rent: 1 },
    ],
    C,
  );
  assert.deepEqual(pins, [
    { locality: "HSR Layout", lat: 12.91, lng: 77.64, count: 2, minRent: 9000 },
    { locality: "Koramangala", lat: 12.94, lng: 77.62, count: 1, minRent: 16000 },
  ]);
  assert.equal(pinLabel(pins[0]), "HSR Layout: 2 beds from ₹9,000");
});
