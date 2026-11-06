import { useCallback, useEffect, useState } from "react";
import { CaretDown, SealCheck } from "@phosphor-icons/react";
import { DealAgreement } from "@/components/deal-agreement";
import { MoveIn } from "@/components/move-in-confirm";
import { getDealSnapshot } from "@/lib/roomsetu/activity-api";
import { activityRow, pinnedPrimaryAction, pinnedStepLine } from "@/lib/roomsetu/activity";
import { myMoveIns } from "@/lib/roomsetu/pricing-api";
import { requestStatusLabel } from "@/lib/roomsetu/booking-cta";
import { inr } from "@/lib/roomsetu/map";
import { errText } from "@/lib/ui-text";
import { btnSmallPrimary, inner } from "@/components/ui-tokens";

export type PinnedRequest = {
  id: string;
  listingId: string;
  title: string;
  rent: number;
  deposit: number;
  status: string;
  mine: boolean;
};

type Snapshot = Awaited<ReturnType<typeof getDealSnapshot>>;
type MoveInfo = Awaited<ReturnType<typeof myMoveIns>>;

/**
 * The pinned "📌 Bed request" card in a chat thread, now carrying the deal's
 * current step and ONE primary button (sign → pay → move in → done).
 *
 * It reads the same `dealSteps()` output `/activity` uses via `activityRow`, so
 * the two surfaces can never disagree about the next step. Everything it does
 * (sign, pay, confirm move in) is the existing DealAgreement / MoveIn component;
 * no new status transition is introduced.
 */
export function PinnedDealCard({ request }: { request: PinnedRequest }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [moves, setMoves] = useState<MoveInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    void getDealSnapshot({ data: { applicationId: request.id } })
      .then(setSnap)
      .catch((e) => setError(errText(e)));
    void myMoveIns().then(setMoves).catch(() => undefined);
  }, [request.id]);

  useEffect(load, [load]);

  const facts = snap?.facts;
  const row = facts
    ? activityRow(
        { id: request.id, listingId: request.listingId, title: request.title, city: "", rent: request.rent, deposit: request.deposit, status: snap.status, mine: snap.mine, otherName: "" },
        facts,
      )
    : null;
  const action = row ? pinnedPrimaryAction(row) : null;
  const step = row ? pinnedStepLine(row.steps, snap?.status) : null;
  const accepted = (snap?.status ?? request.status) === "ACCEPTED";

  /** One tap on the primary button: expand the existing detail surface at that step. */
  const primary = () => {
    if (!action) return;
    if (action.kind === "wait" || action.kind === "done" || action.kind === "none") return;
    setOpen(true);
  };

  return (
    <div className="mx-3 mt-3 min-w-0 rounded-2xl border-2 border-brand bg-brand-soft px-4 py-3" data-testid="pinned-request">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-brand-deep">📌 Bed request</p>
        {row ? (
          <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-brand-deep" data-testid="pinned-step-count">
            Step {step?.index}/{step?.total}
          </span>
        ) : null}
      </div>
      <p className="mt-1 break-words text-sm font-semibold">{request.title}</p>
      <p className="text-xs text-muted">
        {inr(request.rent)}/mo · {inr(request.deposit)} deposit to the owner
      </p>

      {row ? (
        <>
          <p className="mt-1.5 break-words text-sm font-medium" data-testid="pinned-step-line">
            {snap?.status === "PENDING" ? (
              <span className="text-brand-deep">Waiting on the owner to say yes ⏳</span>
            ) : (
              <>
                <span className="text-brand-deep">{step?.label}</span>
                {" · "}
                {row.statusLine}
              </>
            )}
          </p>
          {row.current && accepted && !facts?.cancelled ? (
            <p className="mt-1 text-xs text-muted [text-wrap:pretty]" data-testid="pinned-step-hint">
              {row.current.hint}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-sm">{requestStatusLabel(request.status, request.mine)}</p>
      )}

      <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-2">
        {action && (action.kind === "sign" || action.kind === "pay" || action.kind === "movein") ? (
          <button type="button" className={btnSmallPrimary} onClick={primary} data-testid="pinned-primary">
            {action.label}
          </button>
        ) : action ? (
          <p className="min-w-0 break-words text-xs font-semibold text-brand-deep" data-testid="pinned-primary-wait">
            {action.label}
          </p>
        ) : null}
        {accepted ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink underline underline-offset-4"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            data-testid="pinned-details-toggle"
          >
            Deal details
            <CaretDown size={12} className={open ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {open && accepted ? (
        <div className="mt-3 min-w-0 border-t border-line pt-3" data-testid="pinned-details">
          <p className={`${inner} text-xs`}>
            Rent {inr(request.rent)}/month + {inr(request.deposit)} deposit, paid straight to the owner. Roomeo never takes a cut of the rent.
          </p>
          <DealAgreement dealRef={{ kind: "app", id: request.id }} />
          {row?.current?.key === "movein" ? (
            <MoveIn
              applicationId={request.id}
              mine={snap?.mine ?? request.mine}
              info={moves}
              reload={() => {
                load();
              }}
            />
          ) : null}
          {facts?.movedIn ? (
            <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-deep">
              <SealCheck size={14} /> Moved in. Nice.
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
