import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { LEGAL_NOTE, LEGAL_UPDATED, type LegalSection } from "@/lib/legal";

export function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return (
    <Shell>
      <article className="mx-auto max-w-3xl py-8" data-testid="legal-page">
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-4 [text-wrap:pretty]">{intro}</p>
        <p className="mt-3 rounded-2xl border border-line bg-card p-3 text-sm text-muted">{LEGAL_NOTE}</p>
        <nav className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="On this page">
          {sections.map((s) => <a key={s.id} href={`#${s.id}`} className="rounded-full border border-line px-3 py-1">{s.title}</a>)}
        </nav>
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="mt-8 scroll-mt-20">
            <h2 className="text-2xl font-semibold">{s.title}</h2>
            {s.body.map((p, i) => <p key={i} className="mt-2 [text-wrap:pretty]">{p}</p>)}
          </section>
        ))}
        <p className="mt-10 text-sm text-muted">See also <Link to="/privacy" className="underline">Privacy</Link> · <Link to="/terms" className="underline">Terms</Link> · <Link to="/pricing" className="underline">Pricing</Link></p>
      </article>
    </Shell>
  );
}
