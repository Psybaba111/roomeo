import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { NeedAccount } from "@/components/need-account";
import { Shell } from "@/components/shell";
import { errText } from "@/lib/ui-text";
import { completeIdVerification } from "@/lib/roomsetu/trust-api";
import { btnSmall, btnSmallPrimary, card, input } from "@/components/ui-tokens";
import { pageHead } from "@/lib/seo";

/** Stand-in for the DigiLocker consent screen (ID_PROVIDER=mock). Never reaches a real service. */
export const Route = createFileRoute("/verify/id-mock")({
  head: () => pageHead("DigiLocker (test mode)", { noindex: true }),
  validateSearch: (s: Record<string, unknown>) => ({ v: typeof s.v === "string" ? s.v : "", doc: typeof s.doc === "string" ? s.doc : "AADHAAR" }),
  component: () => (
    <NeedAccount next="/verification">
      <Mock />
    </NeedAccount>
  ),
});

function Mock() {
  const { v, doc } = Route.useSearch();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [msg, setMsg] = useState("");
  const send = (outcome: "pass" | "fail") => {
    setMsg("");
    void completeIdVerification({ data: { verificationId: v, outcome, name, idNumber } })
      .then((r) => (r.ok ? navigate({ to: "/verification" }) : setMsg(r.reason)))
      .catch((e) => setMsg(errText(e)));
  };
  return (
    <Shell>
      <div className={`${card} mx-auto max-w-md`} data-testid="id-mock">
        <p className="text-xs font-bold uppercase tracking-widest text-brand">Test mode · no real DigiLocker</p>
        <h1 className="mt-2 font-display text-3xl">Share your {doc === "STUDENT_ID" ? "student ID" : "Aadhaar"}</h1>
        <p className="mt-2 text-sm text-muted">In production this is DigiLocker's own login and consent page.</p>
        <label className="mt-4 block text-sm">Name as on the document<input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="mt-2 block text-sm">{doc === "STUDENT_ID" ? "Student ID number" : "Aadhaar number (only the last 4 are kept)"}<input className={input} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} /></label>
        <div className="mt-4 flex gap-2">
          <button type="button" className={btnSmallPrimary} onClick={() => send("pass")}>Allow and share</button>
          <button type="button" className={btnSmall} onClick={() => send("fail")}>Deny</button>
        </div>
        {msg ? <p className="mt-2 text-sm text-danger" role="alert">{msg}</p> : null}
      </div>
    </Shell>
  );
}
