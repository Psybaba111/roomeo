import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FilePdf, ShieldCheck } from "@phosphor-icons/react";
import { Shell } from "@/components/shell";
import { NeedAccount } from "@/components/need-account";
import { compressPhoto } from "@/components/photo-upload";
import { downloadBase64 } from "@/components/download";
import { btnPrimary, btnSmall, card, errorBox, inner, input } from "@/components/ui-tokens";
import { errText } from "@/lib/ui-text";
import { pageHead } from "@/lib/seo";
import { ID_TYPES } from "@/lib/roomsetu/movein";
import { getAgreementPdf, openMoveIn, signMoveInAgreement, submitMoveInDetails } from "@/lib/roomsetu/movein-api";

export const Route = createFileRoute("/move-in/$token")({
  head: () => pageHead("Your move-in", { description: "Fill your details, upload ID and sign your PG stay agreement.", noindex: true }),
  component: Page,
});

function Page() {
  const { token } = Route.useParams();
  return (
    <Shell>
      <NeedAccount next={`/move-in/${token}`}>
        <Flow token={token} />
      </NeedAccount>
    </Shell>
  );
}

type Data = Awaited<ReturnType<typeof openMoveIn>>;
type On = Extract<Data, { enabled: true }>;

function Flow({ token }: { token: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const load = () => openMoveIn({ data: { token } }).then(setData).catch((x) => setErr(errText(x)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  if (err) return <p className={errorBox}>{err}</p>;
  if (!data) return <p className="text-muted">Loading your move-in…</p>;
  if (!data.enabled) return <p className="text-muted">Digital move-in isn't live yet. Hang tight 🙏</p>;
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Move-in · {data.title}</p>
      <h1 className="mt-2 font-display text-4xl sm:text-5xl">Let's get you moved in 🏠</h1>
      <p className="mt-2 text-muted">
        From {data.startDate}{data.bedLabel ? ` · ${data.bedLabel}` : ""} · ₹{data.rentInr.toLocaleString("en-IN")}/mo · deposit ₹{data.depositInr.toLocaleString("en-IN")} · owner {data.ownerName}
      </p>
      {data.role === "owner" ? (
        <p className={`mt-4 ${inner} text-sm`}>This is your own move-in link. Share it with the resident from your dashboard.</p>
      ) : data.status === "SENT" ? (
        <DetailsStep id={data.id} onDone={load} />
      ) : data.status === "SUBMITTED" ? (
        <SignStep d={data} onDone={load} />
      ) : (
        <Done d={data} />
      )}
    </div>
  );
}

function DetailsStep({ id, onDone }: { id: string; onDone: () => void }) {
  const [f, setF] = useState({ fullName: "", phone: "", email: "", dateOfBirth: "", occupation: "", employer: "", homeAddress: "", homeCity: "", homeState: "", homePincode: "", emergencyName: "", emergencyPhone: "", idType: "AADHAAR", idNumber: "" });
  const [img, setImg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const field = (k: keyof typeof f, label: string, extra: Record<string, string> = {}) => (
    <label className="block text-sm text-muted">
      {label}
      <input className={`mt-1 ${input}`} value={f[k]} onChange={set(k)} {...extra} />
    </label>
  );
  return (
    <form
      className={`mt-6 ${card} space-y-3`}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          await submitMoveInDetails({ data: { id, ...f, idImage: img } });
          onDone();
        } catch (x) {
          setErr(errText(x));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="font-semibold">Step 1 of 2 · You + your ID</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("fullName", "Full name (as on ID)", { autoComplete: "name" })}
        {field("phone", "Mobile", { inputMode: "tel", autoComplete: "tel" })}
        {field("email", "Email", { type: "email", autoComplete: "email" })}
        {field("dateOfBirth", "Date of birth", { type: "date" })}
        {field("occupation", "Work / study")}
        {field("employer", "Company or college")}
      </div>
      {field("homeAddress", "Permanent home address", { autoComplete: "street-address" })}
      <div className="grid gap-3 sm:grid-cols-3">
        {field("homeCity", "Home town / city")}
        {field("homeState", "State")}
        {field("homePincode", "Pincode", { inputMode: "numeric" })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("emergencyName", "Emergency contact name")}
        {field("emergencyPhone", "Emergency contact mobile", { inputMode: "tel" })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-muted">
          ID type
          <select className={`mt-1 ${input}`} value={f.idType} onChange={set("idType")}>
            {Object.entries(ID_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {field("idNumber", "ID number", { autoComplete: "off" })}
      </div>
      <label className={`${btnSmall} w-full`}>
        {img ? "ID photo added ✓ (tap to change)" : "Upload ID photo 📸"}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setImg(await compressPhoto(file).catch(() => "")); }} />
      </label>
      <p className="flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="mt-0.5 shrink-0" /> Your ID stays private: only you and your PG owner can see it. We keep just the last 4 digits of the number, never the full thing.
      </p>
      {err ? <p className={errorBox}>{err}</p> : null}
      <button className={`${btnPrimary} w-full`} disabled={busy || !img}>
        {busy ? "Saving…" : "Next: the agreement →"}
      </button>
    </form>
  );
}

function SignStep({ d, onDone }: { d: On; onDone: () => void }) {
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className={`mt-6 ${card} space-y-3`}>
      <p className="font-semibold">Step 2 of 2 · Read + sign your stay agreement ✍️</p>
      <div className={`${inner} max-h-96 space-y-2 overflow-y-auto text-sm`}>
        {d.agreement.map((t, i) => (
          <p key={i} className={i === 0 || t === "HOUSE RULES" ? "font-semibold" : ""}>
            {t}
          </p>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
        I've read this and agree. Typing my name below is my signature.
      </label>
      <input className={input} placeholder={`Type your full name${d.tenantName ? ` (${d.tenantName})` : ""}`} value={name} onChange={(e) => setName(e.target.value)} />
      {err ? <p className={errorBox}>{err}</p> : null}
      <button
        className={`${btnPrimary} w-full`}
        disabled={busy || !agree || name.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            await signMoveInAgreement({ data: { id: d.id, typedName: name, agree } });
            onDone();
          } catch (x) {
            setErr(errText(x));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing…" : "Sign it 🖊️"}
      </button>
      <p className="text-xs text-muted">We save the time and your IP with the signature, so both sides have proof.</p>
    </div>
  );
}

function Done({ d }: { d: On }) {
  const [err, setErr] = useState("");
  return (
    <div className={`mt-6 ${card}`}>
      <p className="font-display text-3xl">You're in 🎉</p>
      <p className="mt-1 text-sm text-muted">{d.signature ? `Signed by ${d.signature.name} on ${d.signature.at}.` : "Signed."} Your owner handles the police verification next.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btnSmall} onClick={() => getAgreementPdf({ data: { id: d.id } }).then((r) => downloadBase64(r.base64, r.filename)).catch((x) => setErr(errText(x)))}>
          <FilePdf /> Download agreement
        </button>
        <Link to="/dashboard" className={btnSmall}>
          Go to dashboard
        </Link>
      </div>
      {err ? <p className={`mt-2 ${errorBox}`}>{err}</p> : null}
    </div>
  );
}
