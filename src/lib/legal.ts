/** Roomeo legal pages copy. Plain, casual-but-clear. Not a substitute for legal review. */
import { FEE_OFF, FREE_TENANTS, ownerOf, type FeeView } from "./roomsetu/fee-copy.ts";

export const LEGAL_UPDATED = "29 Oct 2026";
/**
 * Terms date shown only while the owner-fee model is live (OWNER_FEE_ENABLED on, tenant fee off): that copy
 * is different, so it carries its own date. ROHITH TO CONFIRM before switching the owner fee on.
 */
export const OWNER_FEE_TERMS_UPDATED = "15 Nov 2026";

/** "Last updated" for the terms the visitor actually sees. Unchanged unless the owner-fee copy is live. */
export function termsUpdated(fee: FeeView): string {
  return !fee.on && ownerOf(fee).on ? OWNER_FEE_TERMS_UPDATED : LEGAL_UPDATED;
}
export const OPERATOR = {
  name: "Athiti Hospitality Services Private Limited",
  gstin: "29ABFCA1830K1ZM",
  address: "62 MPT Road, Bunder, Mangaluru 575001, Karnataka, India",
  email: "rohithrishima@gmail.com",
  grievanceOfficer: "Rohith S Rao",
} as const;
export const LEGAL_NOTE = "Heads up: this page is written in plain language and isn't a substitute for advice from a lawyer. We're getting it reviewed.";

export type LegalSection = { id: string; title: string; body: string[] };

const grievance = [
  `Grievance Officer: ${OPERATOR.grievanceOfficer}, ${OPERATOR.name}, ${OPERATOR.address}. Email: ${OPERATOR.email}.`,
  "We acknowledge every complaint within 24 hours and aim to resolve it within 15 days, as the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 require. Requests to take down content that's clearly unlawful or impersonates someone are handled faster.",
  "Not happy with our answer on a data issue? Under the DPDP Act, 2023 you can escalate to the Data Protection Board of India.",
];

export const PRIVACY: LegalSection[] = [
  { id: "who", title: "Who we are", body: [
    `Roomeo is run by ${OPERATOR.name} (GSTIN ${OPERATOR.gstin}), ${OPERATOR.address}. For the Digital Personal Data Protection Act, 2023 (DPDP Act), we're the "data fiduciary" for the data you give us.`,
    `Questions? Mail ${OPERATOR.email}.`,
  ] },
  { id: "collect", title: "What we collect", body: [
    "Account: your email, name, password (stored hashed, never readable), phone if you add it, city, and the profile bits you choose to fill in (age, occupation, lifestyle, budget).",
    "Google sign-in: if you use it, we only get your name, email address and profile photo from Google. Nothing else, no contacts, no Drive, no Gmail.",
    "Listings: room details, address, rent, deposit, photos and house rules you post.",
    "Chats: the messages you send to owners, tenants and squad mates on Roomeo.",
    "ID verification: the ID details or documents you submit (for example via DigiLocker or an upload) and the result of the check.",
    "Payments: Roomeo is paid by UPI. We store the amount, what it was for, the UPI reference/UTR you enter and the payer UPI ID, so we can confirm it, refund it and issue a GST invoice. We never see your UPI PIN or bank login.",
    "Agreement signatures: when you sign a Roomeo agreement we record the name you type, the date and time, and your IP address, so there's a proof of who signed what.",
    "Basic logs: IP address, device/browser type and timestamps, for security and fixing bugs.",
  ] },
  { id: "why", title: "Why we use it", body: [
    "To run your account and sign you in; to show listings and match tenants with rooms; to deliver chats; to verify IDs and keep fake profiles and brokers out; to take payments, refund them and issue GST invoices; to keep signed-agreement records; to send you service notices about your requests, payments and account; and to meet legal duties (tax, law-enforcement requests).",
    "We use your data only for these purposes. You give consent when you sign up or use a feature; for some things (tax records, fraud prevention) we rely on legal obligations and legitimate uses allowed by the DPDP Act.",
  ] },
  { id: "share", title: "Who we share it with (we never sell it)", body: [
    "We don't sell or rent your personal data. Ever.",
    "Other users see what's needed for the deal: e.g. an owner sees your profile and messages when you contact them; tenants see the listing and the owner's first name. Your exact phone/email is shared only when you choose to.",
    "Service providers who help us run Roomeo: Vercel (hosting) and Neon (Postgres database), Google (only if you use Google sign-in), DigiLocker/ID partners (only if you verify), and messaging providers for notifications. They process data for us under contract and only for that job.",
    "Authorities: when the law requires it, or to prevent fraud or protect someone's safety.",
    "If the company is merged or sold, your data moves with it under the same promises, and we'll tell you.",
  ] },
  { id: "storage", title: "Where it's stored and how it's protected", body: [
    "Data is stored with Vercel and Neon on cloud servers, which may be outside India. We use encrypted connections (HTTPS), hashed passwords, encrypted sign-in tokens and access limited to people who need it. No system is 100% secure, but we follow reasonable security practices and will tell you and the Data Protection Board if a breach affects you.",
  ] },
  { id: "retention", title: "How long we keep it", body: [
    "Account, profile, listings and chats: while your account is active. Delete your account and we erase them within 30 days, except where the law makes us keep something.",
    "Payments, invoices and signed-agreement records: 8 years, because tax and accounting laws need them.",
    "ID verification documents: only as long as needed to complete the check and handle disputes, then deleted; we keep the result (verified or not).",
    "Logs: up to 180 days.",
  ] },
  { id: "rights", title: "Your rights (DPDP Act, 2023)", body: [
    "Access: ask what we hold about you and how it's used.",
    "Correction and update: fix anything wrong (most of it right in your profile).",
    "Erasure: ask us to delete your account and data. We'll do it within 30 days, apart from records the law makes us keep.",
    "Withdraw consent: you can, any time. Some features (like messaging owners) won't work without the data they need.",
    "Nominate someone to exercise these rights if you can't.",
    `Grievance: complain to us first (details below). Email ${OPERATOR.email} for any of these.`,
  ] },
  { id: "cookies", title: "Cookies", body: [
    "We use cookies only to keep you signed in and secure your session. No advertising cookies, no third-party trackers. Blocking them means you can't stay signed in.",
  ] },
  { id: "kids", title: "Age", body: ["Roomeo is for people 18 and over. We don't knowingly collect data from children."] },
  { id: "grievance", title: "Grievance Officer", body: grievance },
  { id: "changes", title: "Changes", body: ["If we change this policy in a way that matters, we'll show a notice on the site before it applies. The date at the top always tells you the latest version."] },
];

/** Terms of use, with the fee and refund clauses built from the fee setting (no fee amounts while it is off). */
export function termsFor(fee: FeeView): LegalSection[] {
  const o = ownerOf(fee);
  const ownerModel = !fee.on && o.on;
  return [
    { id: "about", title: "The basics", body: [
      `These terms are an agreement between you and ${OPERATOR.name} (GSTIN ${OPERATOR.gstin}), ${OPERATOR.address}, which runs Roomeo. Using Roomeo means you accept them. You must be 18+.`,
      "They're an electronic record under the Information Technology Act, 2000 and published as the Intermediary Rules, 2021 require.",
    ] },
    { id: "platform", title: "We're a platform, not your landlord", body: [
      "Roomeo is a technology platform that helps people find rooms, beds and flatmates. We're an intermediary under section 79 of the IT Act, 2000.",
      "We are not the owner, landlord, licensor, tenant, agent, broker or guarantor in any rental, and we're not a party to any agreement between users, even one signed inside Roomeo.",
      ownerModel
        ? "We don't collect, hold or refund rent or deposits. Those go directly between tenant and owner. Tenants pay Roomeo nothing. Owners pay Roomeo a separate placement commission (see Fees), which is not rent, deposit or brokerage."
        : "We don't collect, hold or refund rent or deposits. Those go directly between tenant and owner, and we take no commission or brokerage on them. Fees you pay Roomeo are separate platform fees, not rent, deposit or brokerage.",
      "Disputes about the room, rent, deposit, house rules or behaviour are between tenant and owner. We may help (for example by suspending a bad actor), but that doesn't make us a party.",
    ] },
    { id: "accounts", title: "Your account", body: [
      "Give true details, keep your password private, and use one account per person. You're responsible for what happens under your account. Tell us quickly if you think someone else got in.",
    ] },
    { id: "listings", title: "Listings & accuracy", body: [
      "Owners must only list places they have the right to let, at the real price, with real photos (clearly label any design mockups). We don't inspect every room or endorse any listing.",
      "Verified badges mean we did a limited check, not a guarantee. Visit the place, meet the person and check documents yourself before paying anything.",
    ] },
    { id: "fees", title: "Fees", body: [
      "Browsing, saving, listing, applying and chatting are free.",
      "Owner chats are free for renters once your phone is verified. There are no chat passes.",
      "Listing is free for owners. There are no paid boosts or paid fast-track reviews right now.",
      ...(ownerModel
        ? [
            `${FREE_TENANTS}: renters pay Roomeo nothing, ever, to search, chat, lock a bed or move in.`,
            `Owners pay Roomeo a flat fee of ₹${o.flatInr} for each tenant who moves in through Roomeo (for a squad, for each tenant, i.e. each bed). ${o.gstPct ? `The ₹${o.flatInr} includes GST at ${o.gstPct}%, shown as a separate line on the invoice; nothing is added on top.` : `No GST is charged on it at present; if that changes, the ₹${o.flatInr} will stay all-in and only apply to move-ins after we tell you.`} A tenant counts as coming through Roomeo when they move in within ${o.attributionDays} days of their first Roomeo enquiry to that owner (the enquiry day is day 0; day ${o.attributionDays} counts, day ${o.attributionDays + 1} doesn't).`,
            `The commission is due within ${o.dueDays} days of the move-in being confirmed on Roomeo, by a Razorpay payment link Roomeo sends. Amounts are rounded to the nearest rupee. The tenant never sees or pays the owner's commission.`,
            `Owners who agreed a percentage commission before 17 Nov 2026 keep what they already owe for move-ins before that date; every later move-in is the flat ₹${o.flatInr}, founding partners included.`,
            "Owners must not charge a Roomeo tenant any brokerage, finder's fee or similar charge. Doing so can get the listing removed and the account closed.",
          ]
        : fee.on
        ? [
            `Roomeo charges a flat platform fee of ₹${fee.totalInr} including 18% GST, once, to the renter and ₹${fee.totalInr} including 18% GST, once, to the owner, per person, per stay, when the stay is confirmed. No monthly fee. Roomeo never takes a cut of rent or deposit.`,
            `The ₹${fee.totalInr} already includes GST (₹${fee.baseInr.toFixed(2)} fee + ₹${(fee.totalInr - fee.baseInr).toFixed(2)} GST), and you get a GST invoice for platform fees. We may change prices for the future; we'll never change the price of something you already paid for.`,
          ]
        : [
            "Roomeo charges no platform fee to renters or owners while we pilot. Roomeo never takes a cut of rent or deposit.",
            "If we introduce a platform fee, we'll show the price with GST before anyone signs or pays, and it won't apply to a stay that's already confirmed. You'd get a GST invoice for any platform fee.",
          ]),
    ] },
    { id: "refunds", title: "Refunds", body: [
      "Pass promise: if every owner you contact during a pass declines or doesn't reply within 48 hours, the full pass price goes back to your UPI ID automatically.",
      ownerModel
        ? `Owner commission: if the tenant leaves within ${o.refundDays} days of moving in, the owner pays only ${o.refundPct}%. If the commission isn't paid yet, only ${o.refundPct}% is due; if it's already paid, Roomeo refunds ${o.refundPct}% of the commission${o.gstPct ? " and 50% of the GST charged" : ""}. After that it isn't refundable. Tenants pay nothing, so there's nothing to refund them. Deposits are paid directly to the owner and are never held or refunded by Roomeo.`
        : fee.on
        ? `Platform fee: the ₹${fee.totalInr} (GST included) fee is refunded in full only if the tenant vacates within 7 days of paying it. The owner's fee is refunded too if the stay ends within 7 days of the owner's payment. In every other case, including moving out later, the fee is not refundable. Deposits are paid directly to the owner and are never held or refunded by Roomeo.`
        : "Platform fee: there is none right now, so there's nothing to refund. Deposits are paid directly to the owner and are never held or refunded by Roomeo.",
      "Refunds go back to the UPI ID that paid, usually within 7 working days after we approve them. Boost and fast-track aren't refundable once they've started.",
    ] },
    { id: "agreement", title: "Agreements signed in Roomeo", body: [
      "The Roomeo agreement is a simple click-to-sign record (typed name, time, IP). It isn't Aadhaar e-sign and it isn't a stamped or registered rental agreement. You may still need a properly stamped leave-and-licence agreement under Karnataka law, and that's between tenant and owner.",
    ] },
    { id: "conduct", title: "Play fair (acceptable use)", body: [
      "Don't: post fake, misleading or someone else's listings; act as a broker or charge brokerage while posing as an owner or tenant; ask for money outside agreed rent/deposit before a visit; harass, discriminate or threaten; share others' personal data; post anything illegal, obscene or infringing; scrape, spam or try to hack Roomeo; or dodge Roomeo fees by misusing free chats.",
      "We can remove content and suspend or close accounts that break these rules or the law, and we may report serious cases to the police.",
    ] },
    { id: "fraud", title: "Stay safe: brokers and scams", body: [
      "Never pay a 'token advance' to someone you haven't met or for a place you haven't seen. Roomeo will never ask for your UPI PIN, OTP or password.",
      `Spotted a broker, scam or fake listing? Use Report on the listing or mail ${OPERATOR.email}. Law-enforcement requests also go to this email.`,
    ] },
    { id: "liability", title: "Limitation of liability", body: [
      "Roomeo is provided 'as is'. We try hard to keep it working and safe but can't promise it'll always be available or error-free.",
      "To the extent the law allows, we're not liable for the condition of any room, the conduct of any user, rent or deposit disputes, or indirect losses. Our total liability for any claim is limited to the platform fees you paid us in the 6 months before the claim.",
    ] },
    { id: "indemnity", title: "Indemnity", body: [
      "If you break these terms or the law, or post content that gets us into trouble, you agree to cover the reasonable costs and claims that follow.",
    ] },
    { id: "termination", title: "Closing your account", body: [
      "You can stop using Roomeo and ask us to delete your account any time. We can suspend or end access for breaking these terms. Fees already used aren't refunded except as described above.",
    ] },
    { id: "law", title: "Governing law & jurisdiction", body: [
      "These terms are governed by Indian law. Courts at Mangaluru, Karnataka have exclusive jurisdiction.",
    ] },
    { id: "grievance", title: "Grievance Officer & contact", body: grievance },
    { id: "changes", title: "Changes", body: ["We may update these terms. If a change matters, we'll show a notice before it applies. Using Roomeo after that means you accept the update."] },
  ];
}

/** Terms with the default (fee OFF) setting. Pages should use `termsFor(fee)` with the live setting. */
export const TERMS: LegalSection[] = termsFor(FEE_OFF);
