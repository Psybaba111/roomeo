/**
 * No scores (MASTER_PRD §6/§10, Rohith 31 Oct 2026). A bed either fits the hard facts a seeker
 * gave (city, budget, gender) or it doesn't. No ranking number is computed or shown.
 */
export type SeekerFacts = {
  city: string;
  localities: string;
  budget: number | null;
  moveIn: string;
  roomPref: string;
  gender: string;
  roommateGender: string;
  occupation: string;
  smoking: string;
  pets: string;
  food: string;
};

export type ListingFacts = {
  city: string;
  locality: string;
  rent: number;
  availableFrom: string;
  roomType: string;
  genderPref: string;
  occupationPref: string;
  smokingAllowed: boolean;
  petsAllowed: boolean;
  foodAvailable: boolean;
};

/** Plain yes/no: same city (when the seeker set one), within budget, and not gender-restricted against them. */
export function fitsSeeker(listing: ListingFacts, seeker: SeekerFacts): boolean {
  if (seeker.city && listing.city.trim().toLowerCase() !== seeker.city.trim().toLowerCase()) return false;
  if (seeker.budget && listing.rent > seeker.budget) return false;
  const g = seeker.gender.toUpperCase();
  const pref = listing.genderPref.toUpperCase();
  if ((g === "MALE" || g === "MEN") && pref === "WOMEN") return false;
  if ((g === "FEMALE" || g === "WOMEN") && pref === "MEN") return false;
  return true;
}
