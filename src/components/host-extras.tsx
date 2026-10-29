import { useEffect, useState } from "react";
import { Lightning, RocketLaunch } from "@phosphor-icons/react";
import { errText } from "@/lib/ui-text";
import { getHostExtras, startBoostCheckout, startFastTrackCheckout } from "@/lib/roomsetu/pricing-api";
import { UpiCheckout, type UpiCheckoutData } from "@/components/upi-checkout";
import { btnSmallPrimary, card, errorBox, inner, skeleton } from "@/components/ui-tokens";

type Extras = Awaited<ReturnType<typeof getHostExtras>>;

function useExtras() {
  const [data, setData] = useState<Extras | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    void getHostExtras()
      .then(setData)
      .catch((e) => setError(errText(e)));
  };
  useEffect(load, []);
  return { data, error, setError, load };
}

/** Optional ₹149 to move a host's ID review to the front of the queue. Listing stays free. */
export function FastTrackOffer() {
  const { data, error, setError, load } = useExtras();
  const [checkout, setCheckout] = useState<UpiCheckoutData | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return error ? <p className={`mt-4 ${errorBox}`}>{error}</p> : <div className={`mt-4 h-24 ${skeleton}`} aria-busy="true" />;
  if (data.verified || !data.fastTrackEnabled) return null;
  return (
    <div className={`mt-4 ${card}`} data-testid="fast-track">
      <p className="flex items-center gap-2 text-base font-semibold">
        <Lightning size={18} aria-hidden="true" /> Faster verification · ₹{data.fastTrackInr}
      </p>
      <p className="mt-2 text-sm text-muted [text-wrap:pretty]">
        Optional. Skip the queue, usually approved same day. Listing stays free either way.
      </p>
      {error ? <p className={`mt-2 ${errorBox}`} role="alert">{error}</p> : null}
      {data.fastTrack ? (
        <p className={`mt-4 text-sm font-semibold ${inner}`}>Fast track is on. You're first in line ✓</p>
      ) : data.fastTrackPending === "SUBMITTED" && !checkout ? (
        <p className={`mt-4 text-sm font-semibold ${inner}`}>Payment received. Confirming it now.</p>
      ) : checkout ? (
        <UpiCheckout data={checkout} onClose={() => { setCheckout(null); load(); }} />
      ) : (
        <button
          type="button"
          disabled={busy}
          className={`mt-4 ${btnSmallPrimary}`}
          data-testid="buy-fast-track"
          onClick={() => {
            setBusy(true);
            setError("");
            void startFastTrackCheckout().then(setCheckout).catch((e) => setError(errText(e))).finally(() => setBusy(false));
          }}
        >
          Fast track for ₹{data.fastTrackInr}
        </button>
      )}
    </div>
  );
}

/** Host dashboard: boost a live listing for ₹199 / 7 days. */
export function BoostPanel() {
  const { data, error, setError, load } = useExtras();
  const [checkout, setCheckout] = useState<{ id: string; data: UpiCheckoutData } | null>(null);
  const [busy, setBusy] = useState("");
  if (!data) return error ? null : <div className={`mt-8 h-32 ${skeleton}`} aria-busy="true" />;
  const live = data.listings.filter((l) => l.status === "ACTIVE");
  if (!live.length || !data.boostsEnabled) return null;
  return (
    <section className={`mt-8 ${card}`} aria-labelledby="boost-h" data-testid="boost-panel">
      <h2 id="boost-h" className="flex items-center gap-2 text-2xl font-semibold">
        <RocketLaunch size={24} aria-hidden="true" /> Boost a listing
      </h2>
      <p className="mt-2 text-sm text-muted [text-wrap:pretty]">
        ₹{data.boostInr} puts your bed at the top of search with a Boosted badge for {data.boostDays} days. Listing stays free.
      </p>
      {error ? <p className={`mt-2 ${errorBox}`} role="alert">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {live.map((l) => (
          <li key={l.id} className={inner}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{l.title}</p>
              {l.boostedUntil ? (
                <span className="text-sm text-muted" data-testid="boosted-until">Boosted until {l.boostedUntil.slice(0, 10)}</span>
              ) : l.pending === "SUBMITTED" ? (
                <span className="text-sm text-muted">Payment being confirmed</span>
              ) : checkout?.id === l.id ? null : (
                <button
                  type="button"
                  disabled={busy !== ""}
                  className={btnSmallPrimary}
                  data-testid="buy-boost"
                  onClick={() => {
                    setBusy(l.id);
                    setError("");
                    void startBoostCheckout({ data: { listingId: l.id } })
                      .then((d) => setCheckout({ id: l.id, data: d }))
                      .catch((e) => setError(errText(e)))
                      .finally(() => setBusy(""));
                  }}
                >
                  Boost for ₹{data.boostInr}
                </button>
              )}
            </div>
            {checkout?.id === l.id ? <UpiCheckout data={checkout.data} onClose={() => { setCheckout(null); load(); }} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
