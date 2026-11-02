import { useEffect, useState } from "react";
import { errText } from "@/lib/ui-text";
import { getIdVerification, startIdVerification } from "@/lib/roomsetu/trust-api";
import { btnSmall, btnSmallPrimary, card } from "@/components/ui-tokens";

/** "Verify with DigiLocker" (Aadhaar or student ID). Renders nothing unless ROOMEO_ID_VERIFICATION_ENABLED is on. */
export function IdVerifyPanel({ verified }: { verified: boolean }) {
  const [s, setS] = useState<Awaited<ReturnType<typeof getIdVerification>> | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    void getIdVerification().then(setS).catch(() => setS(null));
  }, []);
  if (!s?.enabled) return null;
  const go = (docType: "AADHAAR" | "STUDENT_ID") => {
    setErr("");
    void startIdVerification({ data: { docType } }).then((r) => { window.location.href = r.url; }).catch((e) => setErr(errText(e)));
  };
  return (
    <section className={`${card} mt-4 w-full max-w-xl`} data-testid="id-verify-panel">
      <h3 className="font-semibold">Verify your ID with DigiLocker</h3>
      <p className="mt-1 text-sm text-muted [text-wrap:pretty]">
        Students and owners verify once before a trial night booking or a deal is confirmed. You log in to DigiLocker and agree to share. Roomeo keeps only your verified name, the document type and the last 4 characters of the ID. Never the full Aadhaar number or a copy of the card.
      </p>
      {verified ? (
        <p className="mt-2 text-sm font-semibold text-pop" data-testid="id-verified">
          ID verified ✓{s.latest?.status === "VERIFIED" ? ` ${s.latest.name}${s.latest.last4 ? ` · ending ${s.latest.last4}` : ""}` : ""}
        </p>
      ) : (
        <>
          {s.latest?.status === "FAILED" ? <p className="mt-2 text-sm text-danger" role="alert">Last try didn't go through: {s.latest.reason} Try again.</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btnSmallPrimary} disabled={!s.ready} onClick={() => go("AADHAAR")} data-testid="verify-aadhaar">Verify with DigiLocker (Aadhaar)</button>
            <button type="button" className={btnSmall} disabled={!s.ready} onClick={() => go("STUDENT_ID")} data-testid="verify-student-id">Use student ID (DigiLocker)</button>
          </div>
          {!s.ready ? <p className="mt-2 text-xs text-muted">ID verification isn't connected on this deployment yet.</p> : null}
          {s.provider === "mock" ? <p className="mt-2 text-xs text-muted">Test mode: no real DigiLocker request is made.</p> : null}
        </>
      )}
      {err ? <p className="mt-2 text-sm text-danger" role="alert">{err}</p> : null}
    </section>
  );
}
