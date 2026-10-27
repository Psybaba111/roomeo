/** Palette (light + dark). Every text/background pair used in the UI is checked for WCAG AA in theme.test.ts. */
export const PALETTE = {
  light: { ink: "#14111f", paper: "#f7f5ff", card: "#ffffff", line: "#e4e0f2", muted: "#5b5670", brand: "#d1006b", brandDeep: "#9e0052", brandSoft: "#ffe3f1", pop: "#5b21b6", popSoft: "#ede6ff", lime: "#c6f432", danger: "#b4183f" },
  dark: { ink: "#f4f1ff", paper: "#0f0c1a", card: "#1b1729", line: "#2e2942", muted: "#b3adc9", brand: "#ff6aa9", brandDeep: "#ff9cc6", brandSoft: "#3a1730", pop: "#c4b0ff", popSoft: "#2a2047", lime: "#c6f432", danger: "#ff7b98" },
} as const;

function lum(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Pairs actually used for text in the UI: [foreground, background]. */
export function textPairs(p: (typeof PALETTE)["light" | "dark"]): Array<[string, string, string]> {
  return [
    ["ink on paper", p.ink, p.paper],
    ["ink on card", p.ink, p.card],
    ["muted on card", p.muted, p.card],
    ["muted on paper", p.muted, p.paper],
    ["brand on card", p.brand, p.card],
    ["brand-deep on brand-soft", p.brandDeep, p.brandSoft],
    ["pop on pop-soft", p.pop, p.popSoft],
    ["danger on card", p.danger, p.card],
    ["ink on lime", "#14111f", p.lime],
    ["card on brand (buttons)", p.card, p.brand],
    ["card on ink (buttons)", p.card, p.ink],
  ];
}

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("roomeo-theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
