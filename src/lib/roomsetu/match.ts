export type MatchTone = "excellent" | "good" | "fair" | "weak";

export type MatchReason = { label: string; detail: string; tone: MatchTone };

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

function toneFor(score: number, max: number): MatchTone {
  const r = max === 0 ? 0 : score / max;
  if (r >= 0.85) return "excellent";
  if (r >= 0.6) return "good";
  if (r >= 0.35) return "fair";
  return "weak";
}

function day(value: string): number | null {
  if (!value) return null;
  const t = Date.parse(value.slice(0, 10));
  return Number.isNaN(t) ? null : t;
}

export function scoreMatch(listing: ListingFacts, seeker: SeekerFacts): {
  score: number;
  reasons: MatchReason[];
} {
  let location = 0;
  const cityOk = seeker.city && listing.city.toLowerCase() === seeker.city.toLowerCase();
  const locHint = seeker.localities.toLowerCase();
  const locOk = Boolean(locHint && locHint.includes(listing.locality.toLowerCase()));
  if (cityOk && locOk) location = 25;
  else if (cityOk) location = 16;
  else if (!seeker.city) location = 8;

  let budget = 12;
  let budgetDetail = "Add a budget for a sharper match";
  if (seeker.budget && seeker.budget > 0) {
    const ratio = listing.rent / seeker.budget;
    if (ratio <= 1) {
      budget = 25;
      budgetDetail = "Inside your budget";
    } else if (ratio <= 1.15) {
      budget = 16;
      budgetDetail = "Just above your budget";
    } else if (ratio <= 1.35) {
      budget = 8;
      budgetDetail = "A stretch on rent";
    } else {
      budget = 0;
      budgetDetail = "Well above your budget";
    }
  }

  let move = 8;
  let moveDetail = "Move-in dates are loose";
  const want = day(seeker.moveIn);
  const open = day(listing.availableFrom);
  if (want && open) {
    const diff = Math.round((want - open) / 86400000);
    if (diff >= 0 && diff <= 21) {
      move = 15;
      moveDetail = "Ready when you are";
    } else if (diff >= -14 && diff <= 45) {
      move = 9;
      moveDetail = "Close to your date";
    } else {
      move = 3;
      moveDetail = "Dates are far apart";
    }
  }

  let room = 4;
  if (!seeker.roomPref || seeker.roomPref === listing.roomType) room = 10;

  const seekerGender = seeker.gender === "F" ? "WOMEN" : seeker.gender === "M" ? "MEN" : "ANY";
  const wants = seeker.roommateGender || "ANY";
  let gender = 10;
  if (listing.genderPref !== "ANY" && seekerGender !== "ANY" && listing.genderPref !== seekerGender) {
    gender = 0;
  }
  if (wants !== "ANY" && listing.genderPref !== "ANY" && wants !== listing.genderPref) {
    gender = 0;
  }

  let occupation = 3;
  if (
    !seeker.occupation ||
    listing.occupationPref === "ANY" ||
    (listing.occupationPref === "Student" && /student|intern|scholar/i.test(seeker.occupation)) ||
    (listing.occupationPref === "Working professional" && !/student|intern/i.test(seeker.occupation))
  ) {
    occupation = 5;
  }

  let life = 0;
  if (seeker.smoking !== "YES" || listing.smokingAllowed) life += 4;
  if (seeker.pets !== "YES" || listing.petsAllowed) life += 3;
  if (seeker.food === "ANY" || seeker.food === "VEG" || listing.foodAvailable || !listing.foodAvailable) {
    life += seeker.food === "VEG" && listing.foodAvailable ? 3 : 2;
  }

  const raw = location + budget + move + room + gender + occupation + life;
  const score = Math.max(0, Math.min(100, Math.round((raw / 100) * 100)));

  const reasons: MatchReason[] = [
    { label: "Budget", detail: budgetDetail, tone: toneFor(budget, 25) },
    {
      label: "Location",
      detail: locOk ? "Locality lines up" : cityOk ? "Right city" : seeker.city ? "Different city" : "Set your city",
      tone: toneFor(location, 25),
    },
    { label: "Move-in", detail: moveDetail, tone: toneFor(move, 15) },
    {
      label: "Lifestyle",
      detail: gender === 0 ? "Gender preference does not fit" : "House rules are compatible",
      tone: gender === 0 ? "weak" : toneFor(life + gender, 20),
    },
  ];

  return { score, reasons };
}
