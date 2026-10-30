import { useState } from "react";
import { InstagramLogo as Instagram, WhatsappLogo as MessageCircle } from "@phosphor-icons/react";
import { shareNative, shareText, whatsappShareUrl } from "@/lib/share";

export function ShareButtons({ room, url }: { room: { title: string; locality: string; rent: number; allInInr?: number | null }; url: string }) {
  const [note, setNote] = useState("");
  const text = shareText(room);
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Send to the gang</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={whatsappShareUrl(text, url)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="share-whatsapp"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#14532d] px-4 text-sm font-semibold text-white"
        >
          <MessageCircle className="h-4 w-4" /> Share on WhatsApp
        </a>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold"
          onClick={() => {
            void shareNative({ title: room.title, text, url }).then((r) =>
              setNote(r === "copied" ? "Link copied. Paste it in your story or DM ✨" : r === "unavailable" ? "Copy the link from the address bar." : ""),
            );
          }}
        >
          <Instagram className="h-4 w-4" /> Instagram / more
        </button>
      </div>
      {note ? <p className="mt-2 text-xs text-muted" role="status">{note}</p> : null}
    </div>
  );
}
