import { CalendarCheck, ChatCircleDots, HandCoins, Receipt, ShieldCheck, VideoCamera } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { Shell } from "@/components/shell";
import { TaglineReveal } from "@/components/tagline-reveal";
import { btnPrimary, btnSecondary, card } from "@/components/ui-tokens";

export const Route = createFileRoute("/pricing")({
  head: () =>
    pageHead("Pricing: ₹499 once, not a broker's month", {
      description:
        "₹499 once from the renter and ₹499 once from the owner, per person, per stay. Chat owners free, list free. No passes, no cut of rent. Deposit is paid directly to the owner.",
    }),
  component: Pricing,
});

const EMPTY_SEARCH = { city: "", locality: "", maxRent: "", roomType: "", furnished: "", gender: "", food: "", kind: "", sort: "recommended", q: "", availableBy: "" };

const TRUST_PROMISES: { icon: React.ReactNode; title: string; body: string }[] = [
  { icon: <CalendarCheck size={24} aria-hidden="true" />, title: "Dated photos", body: "Every photo shows when it was uploaded. No 2019 pics of a room that looks nothing like that now." },
  { icon: <VideoCamera size={24} aria-hidden="true" />, title: "Video tours", body: "Owners can add a walk-through video, so you see the actual room before you visit." },
  { icon: <Receipt size={24} aria-hidden="true" />, title: "One all-in price", body: "Rent + food + wifi + power in one monthly number, with what's included spelled out. No surprise add-ons." },
  { icon: <HandCoins size={24} aria-hidden="true" />, title: "Deposit shown, never held", body: "The deposit is on the listing before you pay a rupee. You pay it directly to the owner. Roomeo never holds it." },
];

function Pricing() {
  const faq: [string, string][] = [
    ["What does Roomeo cost?", "₹499 once. The renter pays ₹499 once and the owner pays ₹499 once, per person, per stay. Not every month, and not a cut of the rent. Searching, chatting, squads and listing are free."],
    ["Do I pay to message an owner?", "No. Verify your phone once (keeps bots and spam out) and message as many owners as you want."],
    ["Does Roomeo hold my deposit?", "No. Roomeo shows the deposit on the listing, but you pay it directly to the owner. Roomeo never holds or refunds deposits, and never takes a cut of rent."],
    ["Why ₹499?", "A broker usually takes a month's rent. ₹499 once beats that on any bed. The next months cost no fee."],
    ["What if the owner doesn't return my deposit?", "The deposit is between you and the owner. Report the owner from the listing and repeat offenders get removed."],
  ];
  return (
    <Shell>
      <section className="pt-16 pb-12 text-center">
        <p className="text-sm font-semibold text-brand">Pricing</p>
        <h1 className="mx-auto mt-4 max-w-[680px] bg-gradient-to-r from-[#000000] to-[#666666] bg-clip-text text-4xl font-semibold tracking-tight text-transparent [text-wrap:balance] md:text-5xl dark:from-[#FFFFFF] dark:to-[#9B9B9B]">
          ₹499 once. Not a broker's month.
        </h1>
        <p className="mx-auto mt-4 max-w-[680px] text-lg text-muted [text-wrap:pretty]">
          ₹499 from the renter and ₹499 from the owner, once per stay. No chat passes. No cut of your rent.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link to="/search" search={EMPTY_SEARCH} className={btnPrimary} data-testid="pricing-cta">
            Find a bed
          </Link>
          <Link to="/create-listing" className={btnSecondary}>
            List your bed
          </Link>
        </div>
      </section>

      <section aria-labelledby="free-h" className="py-12">
        <h2 id="free-h" className="text-3xl font-semibold tracking-tight [text-wrap:balance]">What it costs</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2" data-testid="free-plans">
          <div className={card} data-testid="plan">
            <p className="flex items-center gap-2 text-base font-semibold"><ChatCircleDots size={24} aria-hidden="true" /> Renters</p>
            <p className="mt-4 text-4xl font-semibold tabular-nums">₹499 once</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>Search, map and listing pages</li>
              <li>Unlimited owner chats after a quick phone check</li>
              <li>Save beds, apply, find a squad</li>
            </ul>
          </div>
          <div className={card} data-testid="plan">
            <p className="flex items-center gap-2 text-base font-semibold"><ShieldCheck size={24} aria-hidden="true" /> Owners</p>
            <p className="mt-4 text-4xl font-semibold tabular-nums">₹499 once</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>List every bed free</li>
              <li>Free ID check and Verified badge</li>
              <li>Chats only from phone-verified renters</li>
            </ul>
          </div>
        </div>
      </section>

      <TaglineReveal id="tagline" lines={["₹499 once.", "Not a broker's month."]} />

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
