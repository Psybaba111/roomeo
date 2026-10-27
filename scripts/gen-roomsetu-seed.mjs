import { writeFileSync } from "node:fs";

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const uid = (n) => {
  const h = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${h}`;
};

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261007);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const PHOTOS = [
  ["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=70", "Living room"],
  ["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1400&q=70", "Living room"],
  ["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1400&q=70", "Living room"],
  ["https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1400&q=70", "Bedroom"],
  ["https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=70", "Bedroom"],
  ["https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1400&q=70", "Bedroom"],
  ["https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1400&q=70", "Kitchen"],
  ["https://images.unsplash.com/photo-1556912173-46c336c7fd55?auto=format&fit=crop&w=1400&q=70", "Kitchen"],
  ["https://images.unsplash.com/photo-1631679706909-1844bbd07221?auto=format&fit=crop&w=1400&q=70", "Bathroom"],
  ["https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=1400&q=70", "Building exterior"],
  ["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=70", "Building exterior"],
  ["https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=70", "Common areas"],
  ["https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1400&q=70", "Bedroom"],
  ["https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1400&q=70", "Living room"],
  ["https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=1400&q=70", "Living room"],
  ["https://images.unsplash.com/photo-1615874959474-d609969a20ed?auto=format&fit=crop&w=1400&q=70", "Bedroom"],
];

const cities = [
  ["Bengaluru", "Karnataka", 12.9716, 77.5946, ["Koramangala", "Indiranagar", "Whitefield", "Jayanagar"], 1.15, "560"],
  ["Mumbai", "Maharashtra", 19.076, 72.8777, ["Andheri West", "Bandra", "Powai", "Dadar"], 1.5, "400"],
  ["Delhi", "Delhi", 28.6139, 77.209, ["Lajpat Nagar", "Saket", "Karol Bagh", "Dwarka"], 1.2, "110"],
  ["Hyderabad", "Telangana", 17.385, 78.4867, ["Madhapur", "Gachibowli", "Banjara Hills", "Kukatpally"], 1.0, "500"],
  ["Pune", "Maharashtra", 18.5204, 73.8567, ["Kothrud", "Hinjawadi", "Viman Nagar", "Koregaon Park"], 1.05, "411"],
  ["Chennai", "Tamil Nadu", 13.0827, 80.2707, ["Adyar", "Velachery", "T. Nagar", "Anna Nagar"], 0.95, "600"],
  ["Kolkata", "West Bengal", 22.5726, 88.3639, ["Salt Lake", "Ballygunge", "Park Street", "New Town"], 0.85, "700"],
  ["Ahmedabad", "Gujarat", 23.0225, 72.5714, ["Navrangpura", "Satellite", "Bopal", "CG Road"], 0.8, "380"],
  ["Gurugram", "Haryana", 28.4595, 77.0266, ["DLF Phase 3", "Sohna Road", "Sector 56", "Cyber Hub"], 1.28, "122"],
  ["Noida", "Uttar Pradesh", 28.5355, 77.391, ["Sector 62", "Sector 18", "Sector 137", "Noida Extension"], 1.05, "201"],
  ["Chandigarh", "Chandigarh", 30.7333, 76.7794, ["Sector 22", "Sector 35", "Sector 17", "Mohali border"], 0.9, "160"],
  ["Jaipur", "Rajasthan", 26.9124, 75.7873, ["Malviya Nagar", "C-Scheme", "Vaishali Nagar", "Mansarovar"], 0.78, "302"],
  ["Kochi", "Kerala", 9.9312, 76.2673, ["Kakkanad", "Panampilly Nagar", "Edappally", "Fort Kochi"], 0.88, "682"],
  ["Mangaluru", "Karnataka", 12.9141, 74.856, ["Kadri", "Bejai", "Falnir", "Derebail"], 0.7, "575"],
  ["Mysuru", "Karnataka", 12.2958, 76.6394, ["VV Mohalla", "Gokulam", "Lakshmipuram", "Hebbal"], 0.68, "570"],
  ["Manipal", "Karnataka", 13.3525, 74.7928, ["Tiger Circle", "Eshwar Nagar", "Perampalli", "End Point"], 0.66, "576"],
  ["Udupi", "Karnataka", 13.3409, 74.7421, ["Kalsanka", "Santhekatte", "Chitpady", "Manipal road"], 0.62, "576"],
  ["Coimbatore", "Tamil Nadu", 11.0168, 76.9558, ["RS Puram", "Peelamedu", "Gandhipuram", "Saravanampatti"], 0.75, "641"],
];

const hosts = [
  ["Asha Rao", "F", 41, "School teacher"],
  ["Rohan Kulkarni", "M", 33, "Software engineer"],
  ["Meera Iyer", "F", 29, "Architect"],
  ["Arjun Nair", "M", 36, "Nurse"],
  ["Fatima Sheikh", "F", 38, "Baker"],
  ["Vikram Joshi", "M", 45, "Bank manager"],
  ["Ananya Reddy", "F", 31, "Product manager"],
  ["Suresh Kamath", "M", 62, "Retired"],
  ["Divya Pai", "F", 27, "PhD scholar"],
  ["Imran Qureshi", "M", 34, "Chef"],
  ["Neha Kapoor", "F", 30, "Designer"],
  ["Harish Shetty", "M", 48, "Shop owner"],
  ["Lakshmi Bhat", "F", 54, "Homemaker"],
  ["Karthik Subramanian", "M", 28, "Data analyst"],
  ["Pooja Deshmukh", "F", 32, "Chartered accountant"],
  ["Aditya Ghosh", "M", 35, "Consultant"],
  ["Sneha Pillai", "F", 26, "Physiotherapist"],
  ["Mohammed Irfan", "M", 39, "Logistics coordinator"],
  ["Ritika Malhotra", "F", 33, "Lawyer"],
  ["Naveen Gowda", "M", 37, "Civil engineer"],
  ["Shreya Banerjee", "F", 29, "Editor"],
  ["Joseph Mathew", "M", 44, "College lecturer"],
  ["Kavya Hegde", "F", 24, "Dental intern"],
  ["Amit Trivedi", "M", 40, "Sales lead"],
  ["Farheen Khan", "F", 31, "HR lead"],
  ["Pranav Kamat", "M", 36, "Marine engineer"],
  ["Isha Jain", "F", 28, "UX designer"],
  ["Deepak Yadav", "M", 42, "Government clerk"],
  ["Anjali Menon", "F", 34, "Researcher"],
  ["Rahul D'Souza", "M", 30, "Hotel supervisor"],
];

const seekers = [
  ["Tanvi Shah", "F", 27, "Software engineer", "Quiet weeks, cook on Sundays. Looking for a private room and respectful flatmates."],
  ["Arvind Rao", "M", 22, "Engineering intern", "First job in a new city. Need something close to a metro or bus and under a tight budget."],
  ["Sana Mir", "F", 25, "Nurse", "Shift work, so I need a calm room and a short commute. Non-smoker."],
  ["Kiran Patil", "M", 21, "College student", "Second-year student. Happy in a shared room if the people are easy to live with."],
  ["Maya Krishnan", "F", 29, "Product designer", "Work from home three days. Need a desk corner, good light, and Wi-Fi that does not drop."],
  ["Harsh Vardhan", "M", 31, "Business analyst", "Relocating with one suitcase. Prefer a furnished private room, no brokers."],
  ["Leela Thomas", "F", 38, "School teacher", "Looking for a women-only home. I cook Kerala food and keep common spaces clean."],
  ["Zoya Ahmad", "F", 23, "Design student", "Studio or private room. I keep plants. No smoking indoors."],
  ["Nikhil Bansal", "M", 33, "Consultant", "In the city four nights a week. Need a lockable room and a predictable rent."],
  ["Anusha Rai", "F", 26, "PhD scholar", "Library hours, early nights. A PG with food is fine if the kitchen is usable on weekends."],
  ["Varun Shetty", "M", 28, "Chef", "Late shifts. I need a room where coming home at midnight is not a problem."],
  ["Pallavi Kulkarni", "F", 24, "CA article", "Articleship stipend budget. Shared room is okay. I study at night with headphones."],
  ["Rehan Syed", "M", 30, "Sales executive", "Travel two weeks a month. Looking for a straightforward house share, no drama."],
  ["Diya Nambiar", "F", 22, "Marketing intern", "New in town. Prefer a home with another woman and a washing machine."],
  ["Manish Agarwal", "M", 35, "Banker", "Transfer posting for a year. Furnished 1BHK or a large private room."],
  ["Shalini Poojary", "F", 27, "Staff nurse", "Hospital housing is full. Need something within 6 km and available this month."],
  ["Abhishek Rao", "M", 20, "College student", "First time away from home. PG bed or shared room near campus."],
  ["Nandita Bose", "F", 32, "Book editor", "I work from the flat. Quiet locality matters more than a gym or a club nearby."],
  ["Vivek Pai", "M", 29, "Software engineer", "Two-wheeler. Parking helps. Budget is firm. I do not smoke."],
  ["Huda Farooq", "F", 26, "Research assistant", "Vegetarian kitchen preferred. Happy to share cooking, not parties."],
];

const roomTypes = ["Private room", "Shared room", "Master bedroom", "Studio", "1BHK", "2BHK", "3BHK", "PG bed", "Other"];
const baseRent = {
  "Private room": 14000,
  "Shared room": 8000,
  "Master bedroom": 18000,
  "Studio": 21000,
  "1BHK": 26000,
  "2BHK": 36000,
  "3BHK": 48000,
  "PG bed": 7500,
  Other: 12000,
};
const propTypes = ["Apartment", "Independent house", "PG", "Co-living", "Builder floor"];
const furnishedOpts = ["Furnished", "Semi-furnished", "Unfurnished"];
const genders = ["ANY", "WOMEN", "MEN"];
const occPrefs = ["ANY", "Working professional", "Student"];
const lines = [];
const push = (s) => lines.push(s);

push("-- RoomSetu demo marketplace. Every row is sample data (is_demo = true).");
push("begin;");

const cityIds = [];
const localityByCity = [];
cities.forEach((c, i) => {
  const id = uid(1000 + i);
  cityIds.push(id);
  push(
    `insert into cities (id, name, state, lat, lng) values (${q(id)}, ${q(c[0])}, ${q(c[1])}, ${c[2]}, ${c[3]});`,
  );
  const locs = [];
  c[4].forEach((name, li) => {
    const lid = uid(1100 + i * 10 + li);
    const lat = c[2] + (li - 1.5) * 0.02;
    const lng = c[3] + (li - 1.5) * 0.02;
    locs.push({ id: lid, name, lat, lng });
    push(
      `insert into localities (id, city_id, name, lat, lng) values (${q(lid)}, ${q(id)}, ${q(name)}, ${lat.toFixed(5)}, ${lng.toFixed(5)});`,
    );
  });
  localityByCity.push(locs);
});

const amenityNames = [
  ["Wi-Fi", "Connectivity"],
  ["Air conditioning", "Comfort"],
  ["Kitchen access", "Kitchen"],
  ["Washing machine", "Utility"],
  ["Parking", "Building"],
  ["Power backup", "Building"],
  ["Lift", "Building"],
  ["Housekeeping", "Services"],
  ["Food", "Services"],
  ["Attached bathroom", "Room"],
  ["Balcony", "Room"],
  ["Pets considered", "House rules"],
];
const amenityIds = {};
amenityNames.forEach((a, i) => {
  const id = uid(2000 + i);
  amenityIds[a[0]] = id;
  push(`insert into amenities (id, name, group_name) values (${q(id)}, ${q(a[0])}, ${q(a[1])});`);
});

const permRows = [
  ["SUPER_ADMIN", "admin.all"],
  ["ADMIN", "users.moderate"],
  ["ADMIN", "listings.moderate"],
  ["ADMIN", "reports.review"],
  ["ADMIN", "cities.manage"],
  ["HOST", "listings.own"],
  ["SEEKER", "applications.own"],
  ["ROOMMATE", "profile.share"],
  ["OPERATOR", "properties.manage"],
];
permRows.forEach((p) => push(`insert into permissions (role, permission) values (${q(p[0])}, ${q(p[1])});`));

const plans = [
  ["free", "Free listing", "HOST", 0, "Publish a room. Standard placement."],
  ["premium", "Premium listing", "HOST", 499, "Higher placement for 30 days."],
  ["featured", "Featured listing", "HOST", 999, "Homepage and city feature."],
  ["boost", "Boost", "HOST", 199, "Seven-day bump in search."],
  ["host-plus", "Host Plus", "HOST", 1499, "Multiple rooms, faster verification review."],
  ["verified-host", "Verified host fee", "HOST", 299, "Identity and address review."],
  ["tenant-premium", "Seeker Plus", "SEEKER", 199, "Earlier access to new rooms."],
  ["pm-sub", "Property desk", "OPERATOR", 4999, "Multi-property tools. Coming soon."],
];
plans.forEach((p, i) => {
  push(
    `insert into subscription_plans (id, code, name, audience, price_inr, perks) values (${q(uid(3000 + i))}, ${q(p[0])}, ${q(p[1])}, ${q(p[2])}, ${p[3]}, ${q(p[4])});`,
  );
});

const userIds = [];
function isoDays(daysFromNow) {
  const d = new Date(Date.UTC(2026, 9, 6));
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
function tsDays(daysAgo) {
  const d = new Date(Date.UTC(2026, 9, 6, 8, 0, 0));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(ri(1, 18), ri(0, 59), 0, 0);
  return d.toISOString();
}

hosts.forEach((h, i) => {
  const id = uid(4000 + i);
  userIds.push(id);
  const city = cities[i % cities.length][0];
  const verified = i < 10;
  const about = `${h[0].split(" ")[0]} lets a spare room in ${city}. Prefers clear house rules and people who say when they will be late.`;
  push(
    `insert into profiles (user_id, full_name, mobile, age, gender, city, occupation, intent, preferred_cities, about, lifestyle, smoking, pets, food, budget, verification_status, reputation, is_demo, created_at) values (${q(id)}, ${q(h[0])}, ${q("98" + String(10000000 + i * 137).slice(0, 8))}, ${h[2]}, ${q(h[1])}, ${q(city)}, ${q(h[3])}, 'OFFERING', ${q(city)}, ${q(about)}, ${q("Early mornings, home by 10 on weeknights.")}, 'NO', 'NO', 'ANY', null, ${q(verified ? "VERIFIED" : i < 16 ? "PENDING" : "UNVERIFIED")}, ${70 + (i % 20)}, true, ${q(tsDays(80 - i))});`,
  );
  push(`insert into profile_roles (user_id, role) values (${q(id)}, 'HOST');`);
  if (i % 5 === 0) push(`insert into profile_roles (user_id, role) values (${q(id)}, 'ROOMMATE');`);
});

seekers.forEach((s, i) => {
  const id = uid(4100 + i);
  userIds.push(id);
  const city = cities[(i * 3) % cities.length][0];
  push(
    `insert into profiles (user_id, full_name, mobile, age, gender, city, occupation, intent, preferred_cities, about, lifestyle, smoking, pets, food, budget, move_in, room_pref, furnished_pref, verification_status, reputation, is_demo, created_at) values (${q(id)}, ${q(s[0])}, ${q("97" + String(20000000 + i * 149).slice(0, 8))}, ${s[2]}, ${q(s[1])}, ${q(city)}, ${q(s[3])}, 'LOOKING', ${q(city)}, ${q(s[4])}, ${q(s[4])}, ${q(i % 7 === 0 ? "OUTSIDE" : "NO")}, 'NO', ${q(i % 4 === 0 ? "VEG" : "ANY")}, ${ri(8, 28) * 1000}, ${q(isoDays(ri(3, 40)))}, ${q(pick(["Private room", "Shared room", "PG bed", "1BHK"]))}, ${q(pick(furnishedOpts))}, ${q(i < 6 ? "PENDING" : "UNVERIFIED")}, ${60 + i}, true, ${q(tsDays(40 - i))});`,
  );
  push(`insert into profile_roles (user_id, role) values (${q(id)}, 'SEEKER');`);
});

const propertyIds = [];
const propertyMeta = [];
for (let i = 0; i < 30; i++) {
  const id = uid(5000 + i);
  propertyIds.push(id);
  const owner = userIds[i];
  const ci = i % cities.length;
  const loc = localityByCity[ci][i % 4];
  const city = cities[ci];
  const ptype = propTypes[i % propTypes.length];
  const verified = i < 10 ? "VERIFIED" : i < 16 ? "PENDING" : "UNVERIFIED";
  const address = `${12 + i}, ${loc.name} cross, ${city[0]}`;
  const pin = city[6] + String(10 + (i % 80)).padStart(3, "0");
  propertyMeta.push({ id, owner, ci, loc, city: city[0], mult: city[5], ptype, verified, address });
  push(
    `insert into properties (id, owner_id, title, property_type, address, city_id, locality_id, pincode, lat, lng, verification_status, is_demo, created_at) values (${q(id)}, ${q(owner)}, ${q(`${ptype} in ${loc.name}`)}, ${q(ptype)}, ${q(address)}, ${q(cityIds[ci])}, ${q(loc.id)}, ${q(pin)}, ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}, ${q(verified)}, true, ${q(tsDays(70 - i))});`,
  );
}

const listingIds = [];
const listingMeta = [];
for (let i = 0; i < 50; i++) {
  const id = uid(6000 + i);
  listingIds.push(id);
  const prop = propertyMeta[i % 30];
  const room = roomTypes[i % roomTypes.length];
  const furn = furnishedOpts[i % 3];
  const rent = Math.round((baseRent[room] * prop.mult * (0.86 + rnd() * 0.28)) / 500) * 500;
  const deposit = rent * (i % 4 === 0 ? 1 : 2);
  const gender = i % 6 === 0 ? "WOMEN" : i % 7 === 0 ? "MEN" : "ANY";
  const occ = occPrefs[i % 3];
  const food = i % 4 === 0 || prop.ptype === "PG";
  const ac = furn !== "Unfurnished" && i % 3 !== 0;
  const wifi = true;
  const kitchen = room !== "PG bed" || i % 2 === 0;
  const wash = i % 2 === 0;
  const parking = i % 3 === 0;
  const power = i % 2 === 1;
  const lift = prop.ptype === "Apartment" || prop.ptype === "Co-living";
  const house = prop.ptype === "PG" || prop.ptype === "Co-living";
  const bath = room !== "Shared room" && room !== "PG bed";
  const balcony = i % 2 === 0;
  const smoke = i % 11 === 0;
  const pets = i % 9 === 0;
  const occupants = room === "PG bed" || room === "Shared room" ? ri(1, 3) : ri(0, 2);
  const available = isoDays(ri(-5, 35));
  const minStay = room === "PG bed" ? 1 : ri(1, 3);
  const maxStay = ri(6, 24);
  const tier = i < 4 ? "FEATURED" : i < 10 ? "PREMIUM" : "FREE";
  const ver = prop.verified === "VERIFIED" && i % 30 < 12 ? "VERIFIED" : prop.verified === "PENDING" ? "PENDING" : "UNVERIFIED";
  const quality = 62 + (ver === "VERIFIED" ? 18 : 0) + (furn === "Furnished" ? 8 : 0) + (i % 5);
  const views = ri(18, 640);
  const title =
    room === "PG bed"
      ? `PG bed near ${prop.loc.name}`
      : room === "Shared room"
        ? `Shared room in a ${prop.city} home`
        : `${room} in ${prop.loc.name}`;
  const people =
    occupants === 1 ? "1 person already lives here" : `${occupants} people already live here`;
  const ptypeLabel = prop.ptype === "PG" ? "PG" : prop.ptype.toLowerCase();
  const article = /^[aeiou]/i.test(ptypeLabel) ? "an" : "a";
  const description = `${prop.city} · ${prop.loc.name}. A ${room.toLowerCase()} in ${article} ${ptypeLabel}, ${furn.toLowerCase()}. ${food ? "Meals can be arranged." : "There is kitchen access for people who cook."} ${people}. Rent is ₹${rent.toLocaleString("en-IN")} a month, deposit ₹${deposit.toLocaleString("en-IN")}.`;
  const reply = `Thanks for writing. The ${room.toLowerCase()} in ${prop.loc.name} is still open from ${available}. I can do a short video tour after 7pm. Phone numbers stay inside RoomSetu until we both agree.`;
  const fp = `${prop.city}|${prop.loc.name}|${rent}|${room}`.toLowerCase();
  const dup = i === 47;
  listingMeta.push({ id, owner: prop.owner, city: prop.city, loc: prop.loc.name, rent, room, gender, title });
  push(
    `insert into listings (id, property_id, owner_id, title, description, city_name, locality_name, monthly_rent, deposit, available_from, min_stay_months, max_stay_months, room_type, furnished, attached_bath, balcony, ac, wifi, kitchen, washing_machine, parking, power_backup, lift, housekeeping, food_available, smoking_allowed, pets_allowed, guest_policy, gender_pref, age_pref, occupation_pref, roommate_pref, occupants, status, verification_status, listing_tier, quality_score, views, fingerprint, possible_duplicate, auto_reply, is_demo, created_at) values (${q(id)}, ${q(prop.id)}, ${q(prop.owner)}, ${q(title)}, ${q(description)}, ${q(prop.city)}, ${q(prop.loc.name)}, ${rent}, ${deposit}, ${q(available)}, ${minStay}, ${maxStay}, ${q(room)}, ${q(furn)}, ${bath}, ${balcony}, ${ac}, ${wifi}, ${kitchen}, ${wash}, ${parking}, ${power}, ${lift}, ${house}, ${food}, ${smoke}, ${pets}, ${q("Guests can stay a night if you tell the house a day before.")}, ${q(gender)}, ${q("18 to 45")}, ${q(occ)}, ${q(gender === "WOMEN" ? "Women flatmates" : gender === "MEN" ? "Men flatmates" : "Easy-going flatmates")}, ${occupants}, 'ACTIVE', ${q(ver)}, ${q(tier)}, ${quality}, ${views}, ${q(fp)}, ${dup}, ${q(reply)}, true, ${q(tsDays(60 - (i % 50)))});`,
  );
  const photos = [PHOTOS[i % PHOTOS.length], PHOTOS[(i + 5) % PHOTOS.length], PHOTOS[(i + 9) % PHOTOS.length]];
  photos.forEach((p, pi) => {
    push(
      `insert into listing_images (id, listing_id, url, category, sort_order) values (${q(uid(7000 + i * 4 + pi))}, ${q(id)}, ${q(p[0])}, ${q(p[1])}, ${pi});`,
    );
  });
  const flags = [
    ["Wi-Fi", wifi],
    ["Air conditioning", ac],
    ["Kitchen access", kitchen],
    ["Washing machine", wash],
    ["Parking", parking],
    ["Power backup", power],
    ["Lift", lift],
    ["Housekeeping", house],
    ["Food", food],
    ["Attached bathroom", bath],
    ["Balcony", balcony],
    ["Pets considered", pets],
  ];
  flags.filter((f) => f[1]).forEach((f) => {
    push(
      `insert into listing_amenities (listing_id, amenity_id) values (${q(id)}, ${q(amenityIds[f[0]])});`,
    );
  });
}

const wantedIds = [];
seekers.forEach((s, i) => {
  const id = uid(8000 + i);
  wantedIds.push(id);
  const user = userIds[30 + i];
  const city = cities[(i * 3) % cities.length];
  const locs = city[4].slice(0, 2).join(", ");
  const budget = ri(8, 26) * 1000;
  const bio = `${s[2]}-year-old ${s[3].toLowerCase()} looking in ${city[0]}. Budget ₹${budget.toLocaleString("en-IN")}. ${s[4]}`;
  push(
    `insert into room_wanted (id, user_id, display_name, age, gender, occupation, city, localities, budget, move_in, duration_months, room_pref, furnished_pref, food_pref, smoking_pref, pet_pref, roommate_gender, people_count, bio, lifestyle, status, is_demo, created_at) values (${q(id)}, ${q(user)}, ${q(s[0])}, ${s[2]}, ${q(s[1])}, ${q(s[3])}, ${q(city[0])}, ${q(locs)}, ${budget}, ${q(isoDays(ri(4, 36)))}, ${ri(3, 12)}, ${q(pick(["Private room", "Shared room", "PG bed", "1BHK", "Master bedroom"]))}, ${q(pick(furnishedOpts))}, ${q(i % 3 === 0 ? "VEG" : "ANY")}, ${q(i % 8 === 0 ? "OUTSIDE_OK" : "NO")}, 'NO', ${q(s[1] === "F" && i % 2 === 0 ? "WOMEN" : "ANY")}, 1, ${q(bio)}, ${q("Weeknight quiet. Happy to split cleaning.")}, 'ACTIVE', true, ${q(tsDays(28 - i))});`,
  );
});

for (let i = 0; i < 20; i++) {
  const cid = uid(9000 + i);
  const listing = listingMeta[i];
  const seeker = userIds[30 + (i % 20)];
  push(
    `insert into conversations (id, listing_id, created_at, updated_at) values (${q(cid)}, ${q(listing.id)}, ${q(tsDays(20 - (i % 15)))}, ${q(tsDays(i % 6))});`,
  );
  push(
    `insert into conversation_members (conversation_id, user_id, last_read_at) values (${q(cid)}, ${q(listing.owner)}, ${q(tsDays(i % 5))}), (${q(cid)}, ${q(seeker)}, ${q(tsDays(i % 4))});`,
  );
  const open = `Hello, I am looking at your ${listing.room.toLowerCase()} in ${listing.loc}. Is it still free?`;
  const reply = `Yes, it is open. Rent is ₹${listing.rent.toLocaleString("en-IN")}. Tell me your move-in week and I will hold a video tour.`;
  push(
    `insert into messages (id, conversation_id, sender_id, body, kind, created_at) values (${q(uid(9100 + i * 3))}, ${q(cid)}, ${q(seeker)}, ${q(open)}, 'USER', ${q(tsDays(18 - (i % 10)))});`,
  );
  push(
    `insert into messages (id, conversation_id, sender_id, body, kind, created_at) values (${q(uid(9101 + i * 3))}, ${q(cid)}, ${q(listing.owner)}, ${q(reply)}, 'USER', ${q(tsDays(17 - (i % 10)))});`,
  );
  if (i < 10) {
    push(
      `insert into messages (id, conversation_id, sender_id, body, kind, created_at) values (${q(uid(9102 + i * 3))}, ${q(cid)}, ${q(seeker)}, ${q("Thank you. I can do Thursday evening.")}, 'USER', ${q(tsDays(12 - (i % 8)))});`,
    );
  }
}

for (let i = 0; i < 20; i++) {
  const seeker = userIds[30 + (i % 20)];
  const listing = listingIds[(i * 3 + 1) % 50];
  push(
    `insert into saved_listings (user_id, listing_id, created_at) values (${q(seeker)}, ${q(listing)}, ${q(tsDays(15 - (i % 10)))});`,
  );
}

for (let i = 0; i < 10; i++) {
  const listing = listingMeta[i + 2];
  const seeker = userIds[30 + i];
  const status = i < 3 ? "ACCEPTED" : i < 7 ? "PENDING" : "DECLINED";
  push(
    `insert into applications (id, listing_id, seeker_id, host_id, note, status, created_at) values (${q(uid(9300 + i))}, ${q(listing.id)}, ${q(seeker)}, ${q(listing.owner)}, ${q("I can move in this month and share a short intro on a call.")}, ${q(status)}, ${q(tsDays(16 - i))});`,
  );
}

for (let i = 0; i < 10; i++) {
  push(
    `insert into matches (id, user_id, listing_id, room_wanted_id, score, reasons, created_at) values (${q(uid(9400 + i))}, ${q(userIds[30 + i])}, ${q(listingIds[i])}, ${q(wantedIds[i])}, ${82 + (i % 12)}, ${q("Budget: Excellent; Location: Good; Move-in: Good; Lifestyle: Good")}, ${q(tsDays(9 - (i % 6)))});`,
  );
}

const reportCats = ["Scam", "Fake listing", "Wrong information", "Harassment", "Unsafe property", "Illegal activity", "Duplicate listing", "Other"];
for (let i = 0; i < 10; i++) {
  const cat = reportCats[i % reportCats.length];
  push(
    `insert into reports (id, reporter_id, target_type, target_id, category, note, status, fraud_flag, created_at) values (${q(uid(9500 + i))}, ${q(userIds[30 + i])}, ${q(i % 3 === 0 ? "USER" : "LISTING")}, ${q(i % 3 === 0 ? userIds[i] : listingIds[20 + i])}, ${q(cat)}, ${q("Sample report filed so the moderation queue is visible. Not a real incident.")}, ${q(i < 6 ? "OPEN" : "REVIEWING")}, ${i === 0 || i === 6}, ${q(tsDays(8 - (i % 5)))});`,
  );
}

const checkKinds = ["IDENTITY", "ADDRESS", "PHOTOS", "OWNERSHIP", "PHONE", "EMAIL"];
for (let i = 0; i < 12; i++) {
  checkKinds.forEach((kind, k) => {
    const status = i < 10 ? "VERIFIED" : "PENDING";
    push(
      `insert into trust_checks (id, user_id, property_id, kind, status, note, created_at) values (${q(uid(9600 + i * 10 + k))}, ${q(userIds[i])}, ${q(propertyIds[i % 30])}, ${q(kind)}, ${q(status)}, ${q(status === "VERIFIED" ? "Sample check marked verified for the demo queue." : "Waiting for an operator.")}, ${q(tsDays(30 - i))});`,
    );
  });
}

for (let i = 0; i < 24; i++) {
  push(
    `insert into metric_events (id, kind, city, created_at) values (${q(uid(12000 + i))}, 'search', ${q(cities[i % cities.length][0])}, ${q(tsDays(21 - (i % 20)))});`,
  );
}
for (let i = 0; i < 16; i++) {
  push(
    `insert into search_history (id, user_id, query, created_at) values (${q(uid(12100 + i))}, ${q(userIds[30 + (i % 20)])}, ${q(cities[i % cities.length][0] + " · private room")}, ${q(tsDays(14 - (i % 10)))});`,
  );
}
for (let i = 0; i < 12; i++) {
  push(
    `insert into notifications (id, user_id, kind, title, body, href, created_at) values (${q(uid(12200 + i))}, ${q(userIds[i % 30])}, 'enquiry', ${q("New enquiry")}, ${q("Someone asked about your room. This is sample activity.")}, '/messages', ${q(tsDays(6 - (i % 5)))});`,
  );
}
for (let i = 0; i < 8; i++) {
  push(
    `insert into audit_log (id, actor_id, action, target_type, target_id, detail, created_at) values (${q(uid(12300 + i))}, 'seed', 'seed.import', 'listing', ${q(listingIds[i])}, ${q("Demo row loaded with the marketplace.")}, ${q(tsDays(2))});`,
  );
}

push("commit;");

writeFileSync(new URL("../migrations/0003_seed.sql", import.meta.url), lines.join("\n") + "\n");
console.log("lines", lines.length);
