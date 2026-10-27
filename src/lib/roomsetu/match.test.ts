import assert from "node:assert/strict";
import test from "node:test";
import { scoreMatch, type ListingFacts, type SeekerFacts } from "./match.ts";

const listing: ListingFacts = {
  city: "Bengaluru",
  locality: "Koramangala",
  rent: 15000,
  availableFrom: "2026-11-01",
  roomType: "Private room",
  genderPref: "ANY",
  occupationPref: "Working professional",
  smokingAllowed: false,
  petsAllowed: false,
  foodAvailable: false,
};

const seeker: SeekerFacts = {
  city: "Bengaluru",
  localities: "Koramangala, Indiranagar",
  budget: 18000,
  moveIn: "2026-11-10",
  roomPref: "Private room",
  gender: "F",
  roommateGender: "ANY",
  occupation: "Software engineer",
  smoking: "NO",
  pets: "NO",
  food: "ANY",
};

test("a fitting room scores as a strong match", () => {
  const result = scoreMatch(listing, seeker);
  assert.ok(result.score >= 80);
  assert.equal(result.reasons.find((r) => r.label === "Budget")?.detail, "Inside your budget");
});

test("the wrong city and a blown budget score lower", () => {
  const fit = scoreMatch(listing, seeker).score;
  const miss = scoreMatch(listing, { ...seeker, city: "Jaipur", localities: "", budget: 4000 }).score;
  assert.ok(miss < fit);
});
