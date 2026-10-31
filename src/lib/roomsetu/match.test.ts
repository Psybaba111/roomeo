import test from "node:test";
import assert from "node:assert/strict";
import * as m from "./match.ts";
import type { ListingFacts, SeekerFacts } from "./match.ts";

const seeker: SeekerFacts = { city: "Pune", localities: "", budget: 10000, moveIn: "", roomPref: "", gender: "FEMALE", roommateGender: "", occupation: "", smoking: "", pets: "", food: "" };
const bed: ListingFacts = { city: "pune", locality: "Baner", rent: 9000, availableFrom: "", roomType: "", genderPref: "ANY", occupationPref: "ANY", smokingAllowed: false, petsAllowed: false, foodAvailable: false };

test("no score function is exported", () => {
  assert.equal("scoreMatch" in m, false);
});

test("fit is a plain yes/no on city, budget and gender", () => {
  assert.equal(m.fitsSeeker(bed, seeker), true);
  assert.equal(m.fitsSeeker({ ...bed, city: "Mumbai" }, seeker), false);
  assert.equal(m.fitsSeeker({ ...bed, rent: 12000 }, seeker), false);
  assert.equal(m.fitsSeeker({ ...bed, genderPref: "MEN" }, seeker), false);
  assert.equal(m.fitsSeeker({ ...bed, city: "Mumbai" }, { ...seeker, city: "" }), true);
});
