import { useEffect, useRef, useState } from "react";
import { ROOMIE_TYPES, roomieShareLabel, roomieShareUrl, type RoomieTypeKey } from "@/lib/roomsetu/roomie-quiz";
import { SITE_URL } from "@/lib/seo";
import { btnPrimary, btnSecondary } from "@/components/ui-tokens";
import { CARD_H, CARD_W, drawRoomieCard } from "@/lib/roomsetu/roomie-card-draw";

/** "Vibe match NN%" pill. ruleOut = a smoking or veg/non-veg hard clash with someone in the room. */
export function VibeMatchBadge({ score, ruleOut, className = "" }: { score: number; ruleOut?: boolean; className?: string }) {
  const tone = ruleOut ? "bg-danger-soft text-danger" : score >= 75 ? "bg-lime text-ink" : score >= 50 ? "bg-pop-soft text-pop" : "bg-paper text-muted";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${tone} ${className}`} data-testid="vibe-match-badge">
      Vibe match {score}%{ruleOut ? " · deal-breaker" : ""}
    </span>
  );
}

/** Small pill: emoji + type name. Types only, never answers. */
export function RoomieBadge({ type, className = "" }: { type: string; className?: string }) {
  const t = ROOMIE_TYPES[type as RoomieTypeKey];
  if (!t) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${className}`}
      style={{ background: t.colors.bg, color: t.colors.ink, border: `1px solid ${t.colors.accent}` }}
      data-testid="roomie-badge"
    >
      <span aria-hidden>{t.emoji}</span> {t.name}
    </span>
  );
}

/** Public site URL for the card; falls back to the current origin when the build has no real site URL. */
function shareOrigin(): string {
  if (SITE_URL && !/localhost|127\.0\.0\.1/.test(SITE_URL)) return SITE_URL;
  return typeof window !== "undefined" ? window.location.origin : SITE_URL;
}

/** The shareable card: live preview + download / share / copy link. */
export function RoomieShareCard({ type }: { type: RoomieTypeKey }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [note, setNote] = useState("");
  const origin = shareOrigin();
  const link = roomieShareUrl(origin, type);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const draw = () => drawRoomieCard(ctx, type, roomieShareLabel(origin));
    draw();
    // Redraw once web fonts are in so the card uses Manrope.
    void document.fonts?.ready.then(draw).catch(() => undefined);
  }, [type, origin]);

  async function blob(): Promise<Blob | null> {
    return new Promise((res) => ref.current?.toBlob((b) => res(b), "image/png") ?? res(null));
  }

  async function share() {
    setNote("");
    const b = await blob();
    if (!b) return setNote("Couldn't make the image. Try download instead.");
    const file = new File([b], `roomeo-${type}.png`, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: "My roomie type", text: `I'm a ${ROOMIE_TYPES[type].name}. What's yours? ${link}` });
        return;
      } catch {
        /* cancelled: fall through to download */
      }
    }
    download(b);
  }

  function download(b: Blob) {
    const url = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roomeo-${type}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setNote("Saved! Post it to your story and drop the link sticker 👇");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link copied. Add it as a link sticker on your story ✨");
    } catch {
      setNote(link);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3" data-testid="roomie-share">
      <canvas
        ref={ref}
        width={CARD_W}
        height={CARD_H}
        className="w-full max-w-[270px] rounded-3xl border border-line shadow-lg"
        aria-label={`Roomie type card: ${ROOMIE_TYPES[type].name}`}
        role="img"
        data-testid="roomie-card-canvas"
      />
      <div className="grid w-full max-w-sm grid-cols-2 gap-2">
        <button type="button" className={btnPrimary} onClick={() => void share()} data-testid="roomie-share-btn">
          Share to story
        </button>
        <button type="button" className={btnSecondary} onClick={() => void copy()}>
          Copy link
        </button>
      </div>
      {note ? (
        <p className="max-w-sm break-all text-center text-sm text-muted" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
