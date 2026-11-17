/**
 * Meta Pixel loader. Pure until called with a window/document from a client-only effect.
 * autoConfig is off (no automatic button-click / metadata events): only the calls we make are sent.
 */
export const PIXEL_SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";

export type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; callMethod?: (...a: unknown[]) => void; push?: unknown };
export type PixelWindow = { fbq?: Fbq; _fbq?: Fbq; __roomeoPixel?: string };
export type PixelDocument = {
  head: { appendChild: (el: unknown) => unknown };
  createElement: (tag: string) => { async?: boolean; src?: string };
  querySelector: (sel: string) => unknown;
};

/** Install fbq once (Meta's standard stub), init the id, no automatic PageView. Returns fbq. */
export function installPixel(win: PixelWindow, doc: PixelDocument, id: string): Fbq {
  if (win.__roomeoPixel === id && win.fbq) return win.fbq;
  if (!win.fbq) {
    const q: unknown[] = [];
    const f = function (...args: unknown[]) {
      if (f.callMethod) f.callMethod(...args);
      else q.push(args);
    } as Fbq;
    f.queue = q;
    f.push = f;
    f.loaded = true;
    f.version = "2.0";
    win.fbq = f;
    if (!win._fbq) win._fbq = f;
  }
  const fbq = win.fbq as Fbq;
  fbq("set", "autoConfig", false, id);
  fbq("init", id);
  if (!doc.querySelector(`script[src="${PIXEL_SCRIPT_SRC}"]`)) {
    const s = doc.createElement("script");
    s.async = true;
    s.src = PIXEL_SCRIPT_SRC;
    doc.head.appendChild(s);
  }
  win.__roomeoPixel = id;
  return fbq;
}
