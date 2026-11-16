// Canvas drawing for the 1080×1920 Instagram-story roomie card. Original Roomeo art (the "room blob").
import { ROOMIE_TYPES, type RoomieTypeKey } from "./roomie-quiz.ts";

export const CARD_W = 1080;
export const CARD_H = 1920;
const FONT = "Manrope, ui-sans-serif, system-ui, sans-serif";

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Roomeo's own "room blob" mascot: a squishy pillow with a face and a per-type prop. */
function drawMascot(ctx: CanvasRenderingContext2D, type: RoomieTypeKey, cx: number, cy: number, s: number) {
  const t = ROOMIE_TYPES[type];
  ctx.save();
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.62, s * 0.55, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = t.colors.accent;
  roundRect(ctx, cx - s * 0.5, cy - s * 0.45, s, s * 0.95, s * 0.32);
  ctx.fill();
  // cheeks
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.arc(cx - s * 0.28, cy + s * 0.12, s * 0.07, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.28, cy + s * 0.12, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  ctx.fillStyle = "#14111f";
  const sleepy = type === "moonlighter" || type === "chill";
  if (sleepy) {
    ctx.lineWidth = s * 0.035;
    ctx.strokeStyle = "#14111f";
    ctx.lineCap = "round";
    for (const dx of [-0.17, 0.17]) {
      ctx.beginPath();
      ctx.arc(cx + s * dx, cy - s * 0.02, s * 0.06, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  } else {
    for (const dx of [-0.17, 0.17]) {
      ctx.beginPath();
      ctx.arc(cx + s * dx, cy - s * 0.04, s * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#fff";
    for (const dx of [-0.15, 0.19]) {
      ctx.beginPath();
      ctx.arc(cx + s * dx, cy - s * 0.06, s * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // smile
  ctx.strokeStyle = "#14111f";
  ctx.lineWidth = s * 0.035;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy + s * 0.1, s * 0.1, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // prop
  ctx.fillStyle = t.colors.ink;
  ctx.strokeStyle = t.colors.ink;
  ctx.lineWidth = s * 0.04;
  if (type === "moonlighter") {
    ctx.fillStyle = "#ffcf5c";
    ctx.beginPath();
    ctx.arc(cx + s * 0.55, cy - s * 0.62, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ROOMIE_TYPES.moonlighter.colors.bg;
    ctx.beginPath();
    ctx.arc(cx + s * 0.62, cy - s * 0.68, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffcf5c";
    for (const [dx, dy, r] of [[-0.6, -0.55, 0.03], [-0.42, -0.78, 0.02], [0.2, -0.85, 0.025]])
      star(ctx, cx + s * dx, cy + s * dy, s * r * 2);
  } else if (type === "sunrise") {
    ctx.fillStyle = "#ffb703";
    ctx.beginPath();
    ctx.arc(cx + s * 0.55, cy - s * 0.6, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffb703";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.55 + Math.cos(a) * s * 0.2, cy - s * 0.6 + Math.sin(a) * s * 0.2);
      ctx.lineTo(cx + s * 0.55 + Math.cos(a) * s * 0.28, cy - s * 0.6 + Math.sin(a) * s * 0.28);
      ctx.stroke();
    }
    // chai cup
    ctx.fillStyle = "#fff";
    roundRect(ctx, cx - s * 0.75, cy + s * 0.15, s * 0.22, s * 0.24, s * 0.05);
    ctx.fill();
    ctx.strokeStyle = t.colors.ink;
    ctx.lineWidth = s * 0.025;
    ctx.stroke();
  } else if (type === "tidy") {
    ctx.fillStyle = "#fff";
    for (const [dx, dy, r] of [[0.62, -0.55, 0.06], [-0.64, -0.4, 0.045], [0.66, 0.05, 0.035]]) star(ctx, cx + s * dx, cy + s * dy, s * r * 2);
  } else if (type === "hype") {
    const colors = ["#ffcf5c", "#5b21b6", "#13a37f", "#3459d6", "#fff"];
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = colors[i % colors.length];
      const a = (i / 18) * Math.PI * 2;
      const r = s * (0.64 + (i % 3) * 0.05);
      ctx.save();
      ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.72);
      ctx.rotate(a);
      ctx.fillRect(-s * 0.025, -s * 0.05, s * 0.05, s * 0.1);
      ctx.restore();
    }
  } else if (type === "chill") {
    ctx.fillStyle = "#8fbf3a";
    for (const [dx, dy, rot] of [[0.6, -0.55, 0.6], [-0.62, -0.5, -0.6]]) {
      ctx.save();
      ctx.translate(cx + s * dx, cy + s * dy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.08, s * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (type === "solo") {
    ctx.strokeStyle = t.colors.ink;
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.12, s * 0.48, 1.05 * Math.PI, 1.95 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = t.colors.ink;
    roundRect(ctx, cx - s * 0.6, cy - s * 0.25, s * 0.16, s * 0.3, s * 0.06);
    ctx.fill();
    roundRect(ctx, cx + s * 0.44, cy - s * 0.25, s * 0.16, s * 0.3, s * 0.06);
    ctx.fill();
  }
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.35;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Draws the 1080×1920 Instagram-story results card. */
export function drawRoomieCard(ctx: CanvasRenderingContext2D, type: RoomieTypeKey, linkLabel: string) {
  const t = ROOMIE_TYPES[type];
  const W = CARD_W;
  const H = CARD_H;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = t.colors.bg;
  ctx.fillRect(0, 0, W, H);
  // background dots
  ctx.fillStyle = t.colors.accent;
  ctx.globalAlpha = 0.12;
  for (let y = 60; y < H; y += 90) for (let x = (y / 90) % 2 ? 60 : 105; x < W; x += 90) {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.fillStyle = t.colors.ink;
  ctx.font = `800 56px ${FONT}`;
  ctx.fillText("roomeo", W / 2, 150);
  ctx.font = `700 40px ${FONT}`;
  ctx.globalAlpha = 0.75;
  ctx.fillText("my roomie type is", W / 2, 300);
  ctx.globalAlpha = 1;

  drawMascot(ctx, type, W / 2, 640, 420);

  ctx.fillStyle = t.colors.ink;
  ctx.font = `800 ${t.name.length > 12 ? 118 : 136}px ${FONT}`;
  ctx.fillText(t.name, W / 2, 1080);
  ctx.font = `700 50px ${FONT}`;
  ctx.fillStyle = t.colors.accent;
  ctx.fillText(t.tagline, W / 2, 1160);

  // match panel
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  roundRect(ctx, 90, 1240, W - 180, 380, 48);
  ctx.fill();
  ctx.fillStyle = "#14111f";
  ctx.textAlign = "left";
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText("💞 Vibes best with", 150, 1320);
  ctx.font = `600 44px ${FONT}`;
  const best = t.bestWith.map((k) => ROOMIE_TYPES[k].name).join(", ");
  wrap(ctx, best, W - 300).slice(0, 2).forEach((l, i) => ctx.fillText(l, 150, 1385 + i * 54));
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText("⚡ Might clash with", 150, 1500);
  ctx.font = `600 44px ${FONT}`;
  const clash = t.clashesWith.length ? t.clashesWith.map((k) => ROOMIE_TYPES[k].name).join(", ") : "Literally no one 😌";
  ctx.fillText(wrap(ctx, clash, W - 300)[0] ?? "", 150, 1565);

  // footer CTA
  ctx.textAlign = "center";
  ctx.fillStyle = t.colors.ink;
  roundRect(ctx, 180, 1690, W - 360, 120, 60);
  ctx.fill();
  ctx.fillStyle = t.colors.bg;
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText("What's your roomie type? →", W / 2, 1765);
  ctx.fillStyle = t.colors.ink;
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(linkLabel, W / 2, 1870);
}

