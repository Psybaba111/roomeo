import { CalendarCheck, ChatCircleDots, HandCoins, Receipt, ShieldCheck, Star, VideoCamera } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { Shell } from "@/components/shell";
import { TaglineReveal } from "@/components/tagline-reveal";
import { btnPrimary, btnSecondary, card } from "@/components/ui-tokens";

export const Route = createFileRoute("/pricing")({
  head: () =>
    pageHead("Pricing: free for renters and owners", {
      description:
        "Roomeo is free. Chat owners free, list your PG free. No passes, no move-in fee, no cut of rent. Just real photos, one all-in price and deposit terms in writing.",
    }),
  component: Pricing,
});

const EMPTY_SEARCH = { city: "Bengaluru", locality: "", maxRent: "", roomType: "", furnished: "", gender: "", food: "", kind: "", sort: "recommended", q: "", availableBy: "" };

const TRUST_PROMISES: { icon: React.ReactNode; title: string; body: string }[] = [
  { icon: <CalendarCheck size={24} aria-hidden="true" />, title: "Dated photos", body: "Every photo shows when it was uploaded. No 2019 pics of a room that looks nothing like that now." },
  { icon: <VideoCamera size={24} aria-hidden="true" />, title: "Video tours", body: "Owners can add a walk-through video, so you see the actual room before you visit." },
  { icon: <Receipt size={24} aria-hidden="true" />, title: "One all-in price", body: "Rent + food + wifi + power in one monthly number, with what's included spelled out. No surprise add-ons." },
  { icon: <HandCoins size={24} aria-hidden="true" />, title: "Deposit terms in writing", body: "Deposit amount and refund window (7 days by default) right on the listing, before you pay a rupee." },
  { icon: <Star size={24} aria-hidden="true" />, title: "Honest reviews", body: "Reviews are never tied to your deposit. Say it like it is, your refund doesn't depend on it." },
];

function Pricing() {
  const faq: [string, string][] = [
    ["Is Roomeo really free?", "Yep. Searching, saving, applying, squads and chatting owners are all free for renters. Listing a bed is free for owners. No passes, no boosts, no move-in fee."],
    ["Do I pay to message an owner?", "No. Verify your phone once (keeps bots and spam out) and message as many owners as you want."],
    ["Does Roomeo take a cut of rent or deposit?", "Never. Rent and deposit go straight to the owner, on the terms written on the listing."],
    ["So how does Roomeo make money?", "We run our own PG beds (starting with Mud Home in Bunder, Mangaluru). Roomeo is how we, and other good owners, fill beds through trust instead of ads and brokers."],
    ["What if the deposit isn't refunded on time?", "The refund window is written on the listing. Report it from the listing and we follow up with the owner. Repeat offenders get removed."],
  ];
  return (
    <Shell>
      <section className="pt-16 pb-12 text-center">
        <p className="text-sm font-semibold text-brand">Pricing</p>
        <h1 className="mx-auto mt-4 max-w-[680px] bg-gradient-to-r from-[#000000] to-[#666666] bg-clip-text text-4xl font-semibold tracking-tight text-transparent [text-wrap:balance] md:text-5xl dark:from-[#FFFFFF] dark:to-[#9B9B9B]">
          ₹0. For renters and owners.
        </h1>
        <p className="mx-auto mt-4 max-w-[680px] text-lg text-muted [text-wrap:pretty]">
          No chat passes. No move-in fee. No cut of your rent. Just PGs you can actually trust.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link to="/search" search={EMPTY_SEARCH} className={btnPrimary} data-testid="pricing-cta">
            Find a bed, free
          </Link>
          <Link to="/create-listing" className={btnSecondary}>
            List your PG, free
          </Link>
        </div>
      </section>

      <section aria-labelledby="free-h" className="py-12">
        <h2 id="free-h" className="text-3xl font-semibold tracking-tight [text-wrap:balance]">What's free</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2" data-testid="free-plans">
          <div className={card} data-testid="plan">
            <p className="flex items-center gap-2 text-base font-semibold"><ChatCircleDots size={24} aria-hidden="true" /> Renters</p>
            <p className="mt-4 text-4xl font-semibold tabular-nums">₹0</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>Search, map and listing pages</li>
              <li>Unlimited owner chats after a quick phone check</li>
              <li>Save beds, apply, find a squad</li>
            </ul>
          </div>
          <div className={card} data-testid="plan">
            <p className="flex items-center gap-2 text-base font-semibold"><ShieldCheck size={24} aria-hidden="true" /> Owners</p>
            <p className="mt-4 text-4xl font-semibold tabular-nums">₹0</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>List every bed free</li>
              <li>Free ID check and Verified badge</li>
              <li>Chats only from phone-verified renters</li>
            </ul>
          </div>
        </div>
      </section>

      <TaglineReveal id="tagline" lines={["Trust is the product.", "So we don't charge for it."]} />

      <section aria-labelledby="trust-h" className="py-12">
        <h2 id="trust-h" className="text-3xl font-semibold tracking-tight">The Roomeo trust kit</h2>
        <ul className="mt-8 grid gap-4 md:grid-cols-3" data-testid="trust-kit">
          {TRUST_PROMISES.map((t) => (
            <li key={t.title} className={card}>
              <p className="flex items-center gap-2 text-lg font-semibold">{t.icon} {t.title}</p>
              <p className="mt-2 text-sm text-muted [text-wrap:pretty]">{t.body}</p>
            </li>
          ))}
        </ul>
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
    </Shell>
  );
}
