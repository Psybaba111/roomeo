import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/seo";
import { NeedAccount } from "@/components/need-account";
import { getFeeInvoice } from "@/lib/roomsetu/agreement-api";
import { SELLER, rupees } from "@/lib/roomsetu/invoice";
import { errText } from "@/lib/ui-text";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/invoice/$paymentId")({
  head: () => pageHead("Tax invoice", { noindex: true }),
  component: InvoicePage,
});

function InvoicePage() {
  const { paymentId } = Route.useParams();
  return (
    <NeedAccount next={`/invoice/${paymentId}`}>
      <Invoice paymentId={paymentId} />
    </NeedAccount>
  );
}

function Invoice({ paymentId }: { paymentId: string }) {
  const { user } = useCurrentUserState();
  const [inv, setInv] = useState<Awaited<ReturnType<typeof getFeeInvoice>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    void getFeeInvoice({ data: { paymentId } }).then(setInv).catch((e) => setError(errText(e)));
  }, [user, paymentId]);
  if (error) return <p className="p-6" role="alert">{error}</p>;
  if (!inv) return <p className="p-6">Loading invoice…</p>;
  const row = (label: string, v: number) => (v ? <tr><td className="py-1">{label}</td><td className="py-1 text-right tabular-nums">{rupees(v)}</td></tr> : null);
  return (
    <main className="mx-auto max-w-2xl bg-white p-8 text-black print:p-0" data-testid="invoice">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tax Invoice</h1>
          <p className="text-sm">Invoice no. <b>{inv.number}</b></p>
          <p className="text-sm">Date: {new Date(inv.issuedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
        </div>
        <button type="button" onClick={() => window.print()} className="h-10 rounded-full border px-4 text-sm print:hidden">Print / save PDF</button>
      </div>
      <section className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="font-semibold">From</p>
          <p>{SELLER.name}</p>
          <p>{SELLER.address}</p>
          <p>GSTIN: {SELLER.gstin}</p>
          <p>State: {SELLER.state} ({SELLER.stateCode})</p>
        </div>
        <div>
          <p className="font-semibold">Billed to</p>
          <p>{inv.buyerName}</p>
          <p>State: {inv.buyerState || "Not given"}</p>
          <p>Place of supply: {inv.placeOfSupply}</p>
        </div>
      </section>
      <table className="mt-6 w-full text-sm">
        <thead><tr className="border-b"><th className="py-1 text-left">Description</th><th className="py-1 text-right">Amount</th></tr></thead>
        <tbody>
          <tr><td className="py-1">Roomeo platform success fee, one-time (SAC {SELLER.sac})<br /><span className="text-xs">{inv.purpose} · ref {inv.ref}</span></td><td className="py-1 text-right tabular-nums">{rupees(inv.taxable)}</td></tr>
          {row("CGST @ 9%", inv.cgst)}
          {row("SGST @ 9%", inv.sgst)}
          {row("IGST @ 18%", inv.igst)}
          <tr className="border-t font-semibold"><td className="py-1">Total</td><td className="py-1 text-right tabular-nums">{rupees(inv.total)}</td></tr>
          {inv.roundOff ? row("Round off", inv.roundOff) : null}
          <tr className="font-semibold"><td className="py-1">Amount paid (UPI)</td><td className="py-1 text-right tabular-nums">₹{inv.paidInr.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <p className="mt-6 text-xs">Roomeo is a service of {SELLER.name}. This is a computer-generated invoice and needs no signature.</p>
    </main>
  );
}
