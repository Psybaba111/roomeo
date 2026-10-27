export function whatsappShareUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`.trim())}`;
}

export function shareText(room: { title: string; locality: string; rent: number }): string {
  return `${room.title} in ${room.locality} for ₹${room.rent.toLocaleString("en-IN")}/mo on roomeo 👀`;
}

/**
 * Instagram has no web share URL. Use the native share sheet when available (it lists Instagram on phones),
 * otherwise copy the link so it can be pasted into a story or DM.
 */
export async function shareNative(
  data: { title: string; text: string; url: string },
  nav: { share?: (d: ShareData) => Promise<void>; clipboard?: { writeText: (s: string) => Promise<void> } } | undefined = typeof navigator === "undefined" ? undefined : navigator,
): Promise<"shared" | "copied" | "unavailable"> {
  if (nav?.share) {
    try {
      await nav.share(data);
      return "shared";
    } catch {
      // user cancelled: fall through to copy
    }
  }
  if (nav?.clipboard) {
    await nav.clipboard.writeText(data.url);
    return "copied";
  }
  return "unavailable";
}
