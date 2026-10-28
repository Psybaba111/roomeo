import { CheckCircle, ChatCircleDots, Lightning, RocketLaunch, ShieldCheck, UsersThree } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { Shell } from "@/components/shell";
import { TaglineReveal } from "@/components/tagline-reveal";
import { getPublicPricing } from "@/lib/roomsetu/pricing-api";
import { btnPrimary, btnSecondary, card, inner } from "@/components/ui-tokens";

export const Route = createFileRoute("/pricing")({
  head: () =>
    pageHead("Pricing: 3 free owner chats, then passes from ₹149", {
      description:
        "Browse, save and apply free. Your first 3 owner chats are free. After that a weekly pass is ₹149 with a money back promise. Hosts list free.",
    }),
  loader: () => getPublicPricing(),
  component: Pricing,
});

const EMPTY_SEARCH = { city: "Bengaluru", locality: "", maxRent: "", roomType: "", furnished: "", gender: "", food: "", kind: "", sort: "recommended", q: "", availableBy: "" };

function Pricing() {
  const p = Route.useLoaderData();
  const faq: [string, string][] = [
    ["What is free?", `Searching, the map, listing pages, saving beds, applying to a room and joining a squad are always free. You also get ${p.freeContacts} free owner chats once your phone is verified.`],
    ["What counts as an owner contact?", "Starting a new chat with the owner of a listing. Replying in a chat you already have does not use anything."],
    ["Do I get a free contact back?", `Yes. If the owner declines your request, or does not reply within ${p.noReplyHours} hours, that free contact comes back to you.`],
    ["What does a pass give me?", `Unlimited new owner chats while it lasts: 7 days for ₹${p.weekly}, or 30 days for ₹${p.monthly}. A new pass starts when your current one ends.`],
    ["How does the refund promise work?", `If you start at least one owner chat with your pass and every owner you contacted declines or does not reply within ${p.noReplyHours} hours, the full pass price goes back to the UPI ID you paid from. We check this ${p.noReplyHours} hours after the pass ends.`],
    ["When is there no refund?", "If any owner you contacted with the pass replies or accepts. A pass you never use to contact an owner is not refunded, so buy one when you are ready to message."],
    ["How do squads pay?", `Any member can use one of their free chats or their own active pass to open the squad chat with an owner. Or buy a squad pass: ₹${p.squadPerMember} per person for ${p.squadDays} days of chats with every flat your squad requests, paid by one person or split.`],
    ["Do hosts pay to list?", `Never. Listing is free. Hosts can choose a ₹${p.boost} boost for ${p.boostDays} days or ₹${p.fastTrack} fast track ID review.`],
    ["Is there a fee when I move in?", p.successFeeEnabled ? `Yes, a flat ₹${p.successFeeTenant} for the tenant and ₹${p.successFeeOwner} for the owner after both confirm the move in. Never a cut of the rent.` : "Not right now. Roomeo never takes a cut of your rent or deposit."],
    ["How do I pay?", "Direct UPI to Roomeo by QR code. Enter the 12 digit UTR and we confirm it, usually within a few hours. No gateway, no card details."],
  ];
  return (
    <Shell>
      <section className="pt-16 pb-12 text-center">
        <p className="text-sm font-semibold text-brand">Pricing</p>
        <h1 className="mx-auto mt-4 max-w-[680px] bg-gradient-to-r from-[#000000] to-[#666666] bg-clip-text text-4xl font-semibold tracking-tight text-transparent [text-wrap:balance] md:text-5xl dark:from-[#FFFFFF] dark:to-[#9B9B9B]">
          Message {p.freeContacts} owners free.
          <br /> Pay only when you are serious.
        </h1>
        <p className="mx-auto mt-4 max-w-[680px] text-lg text-muted [text-wrap:pretty]">
          Browse every bed in Bengaluru for free. Your first {p.freeContacts} owner chats cost nothing,
          then a pass from ₹{p.weekly} a week with a money back promise.
        </p>
        <div className="mt-8 flex justify-center">
          <Link to="/search" search={EMPTY_SEARCH} className={btnPrimary} data-testid="pricing-cta">
            Find a bed for free
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted">Zero commission on rent. Hosts list free.</p>
      </section>

      <section aria-labelledby="plans-h" className="py-12">
        <h2 id="plans-h" className="text-3xl font-semibold tracking-tight [text-wrap:balance]">Plans for renters</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Plan name="Free" price="₹0" note="forever" points={["Search, map and listing pages", "Save beds and apply", "Join a squad", `${p.freeContacts} free owner chats`]} icon={<ChatCircleDots size={24} aria-hidden="true" />} />
          <Plan name="Weekly pass" price={`₹${p.weekly}`} note="7 days" points={["Unlimited owner chats", "Fits a one week hunt", "Refund promise included"]} icon={<CheckCircle size={24} aria-hidden="true" />} highlight />
          <Plan name="Monthly pass" price={`₹${p.monthly}`} note="30 days" points={["Unlimited owner chats", "Best for a slow, careful search", "Refund promise included"]} icon={<CheckCircle size={24} aria-hidden="true" />} />
          <Plan name="Squad pass" price={`₹${p.squadPerMember}`} note={`per person, ${p.squadDays} days`} points={["Chat with owners of whole flats", "Pay together or split", "Refund promise included"]} icon={<UsersThree size={24} aria-hidden="true" />} />
        </div>
      </section>

      <TaglineReveal id="tagline" lines={["Browsing stays free.", "You pay only when an owner can answer."]} />

      <section aria-labelledby="how-h" className="py-12">
        <h2 id="how-h" className="text-3xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["01", "Verify your phone", `Unlocks your ${p.freeContacts} free owner chats.`],
            ["02", "Chat with owners", `Declined or no reply in ${p.noReplyHours} hours? The free chat comes back.`],
            ["03", "Need more? Get a pass", `₹${p.weekly} for a week of unlimited chats, refunded if no owner engages.`],
          ].map(([n, t, d]) => (
            <li key={n} className={card}>
              <p className="font-mono text-sm text-muted">{n}</p>
              <p className="mt-2 text-lg font-semibold">{t}</p>
              <p className="mt-2 text-sm text-muted [text-wrap:pretty]">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="promise-h" className={`my-12 ${card}`} data-testid="refund-promise">
        <h2 id="promise-h" className="flex items-center gap-2 text-2xl font-semibold">
          <ShieldCheck size={24} aria-hidden="true" /> The refund promise
        </h2>
        <p className="mt-2 text-base [text-wrap:pretty]">{p.refundPromise}</p>
        <ul className="mt-4 space-y-2 text-sm">
          <li className={inner}>Refunded: you contacted 3 owners with a pass, 2 declined and 1 never replied within {p.noReplyHours} hours.</li>
          <li className={inner} data-testid="unused-pass-rule">Not refunded: any owner you contacted with the pass replied, or the pass was never used. Unused passes are not refundable.</li>
          <li className={inner}>Refunds go back to the UPI ID you paid from, checked {p.noReplyHours} hours after the pass ends.</li>
        </ul>
      </section>

      <section aria-labelledby="hosts-h" className="py-12">
        <h2 id="hosts-h" className="text-3xl font-semibold tracking-tight">For hosts: listing is free</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className={card}>
            <p className="flex items-center gap-2 text-lg font-semibold"><RocketLaunch size={24} aria-hidden="true" /> Boost · ₹{p.boost}</p>
            <p className="mt-2 text-sm text-muted [text-wrap:pretty]">Your bed shows first in search with a Boosted badge for {p.boostDays} days.</p>
          </div>
          <div className={card}>
            <p className="flex items-center gap-2 text-lg font-semibold"><Lightning size={24} aria-hidden="true" /> Fast track · ₹{p.fastTrack}</p>
            <p className="mt-2 text-sm text-muted [text-wrap:pretty]">Your ID review moves to the front of the queue so you can publish sooner.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-h" className="py-12">
        <h2 id="faq-h" className="text-3xl font-semibold tracking-tight">Questions</h2>
        <div className="mt-8 space-y-2">
          {faq.map(([q, a]) => (
            <details key={q} className={card}>
              <summary className="cursor-pointer text-base font-semibold">{q}</summary>
              <p className="mt-2 text-sm text-muted [text-wrap:pretty]">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="py-16 text-center">
        <h2 className="mx-auto max-w-[680px] text-3xl font-semibold tracking-tight [text-wrap:balance]">Your first {p.freeContacts} owner chats are on us</h2>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link to="/search" search={EMPTY_SEARCH} className={btnPrimary}>
            Find a bed for free
          </Link>
          <Link to="/create-listing" className={btnSecondary}>
            List your bed free
          </Link>
        </div>
      </section>
    </Shell>
  );
}

function Plan({ name, price, note, points, icon, highlight }: { name: string; price: string; note: string; points: string[]; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`${card} ${highlight ? "border-brand" : ""}`} data-testid="plan">
      <p className="flex items-center gap-2 text-base font-semibold">{icon} {name}</p>
      <p className="mt-4 text-4xl font-semibold tabular-nums">{price}</p>
      <p className="text-sm text-muted">{note}</p>
      <ul className="mt-4 space-y-2 text-sm">
        {points.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
