import { control } from "@/components/cards";

export type TrustForm = {
  allInInr: string;
  allInIncludes: string;
  videoTourUrl: string;
  depositRefundDays: string;
};
export const EMPTY_TRUST: TrustForm = {
  allInInr: "",
  allInIncludes: "",
  videoTourUrl: "",
  depositRefundDays: "7",
};

export function trustPayload(t: TrustForm) {
  return {
    allInInr: t.allInInr ? Number(t.allInInr) : null,
    allInIncludes: t.allInIncludes,
    videoTourUrl: t.videoTourUrl.trim(),
    depositRefundDays: t.depositRefundDays ? Number(t.depositRefundDays) : 7,
  };
}

/** Owner-side trust kit: one all-in price, deposit shown (paid directly to the owner), an optional video tour. */
export function TrustFields({
  value,
  onChange,
}: {
  value: TrustForm;
  onChange: (k: keyof TrustForm, v: string) => void;
}) {
  const digits = (s: string) => s.replace(/[^\d]/g, "");
  return (
    <fieldset
      className="grid gap-4 rounded-2xl border border-line p-4 md:col-span-2 md:grid-cols-2"
      data-testid="trust-fields"
    >
      <legend className="px-1 text-sm font-semibold">
        Trust kit · renters pick listings with these first
      </legend>
      <label>
        <span className="mb-1 block text-sm text-muted">All-in monthly price (optional)</span>
        <input
          className={control}
          inputMode="numeric"
          placeholder="e.g. 7499"
          value={value.allInInr}
          onChange={(e) => onChange("allInInr", digits(e.target.value))}
          data-testid="all-in-price"
        />
      </label>
      <label>
        <span className="mb-1 block text-sm text-muted">What the all-in price includes</span>
        <input
          className={control}
          maxLength={200}
          placeholder="Rent, 3 meals, wifi, power, water"
          value={value.allInIncludes}
          onChange={(e) => onChange("allInIncludes", e.target.value)}
          data-testid="all-in-includes"
        />
      </label>
      <label>
        <span className="mb-1 block text-sm text-muted">Video tour link (optional)</span>
        <input
          className={control}
          type="url"
          placeholder="https://youtu.be/…"
          value={value.videoTourUrl}
          onChange={(e) => onChange("videoTourUrl", e.target.value)}
          data-testid="video-tour"
        />
      </label>
      <p className="text-xs text-muted md:col-span-2">
        Photos get a date stamp when you upload them, so keep them fresh.
      </p>
    </fieldset>
  );
}
