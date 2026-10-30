import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import jpeg from "jpeg-js";
import inter600 from "./fonts/inter-600.ttf?inline";
import inter800 from "./fonts/inter-800.ttf?inline";
import { OG_H, OG_W, ogCardTree, type OgCardModel } from "./listing-card";

const font = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
let fonts: { name: string; data: Buffer; weight: 600 | 800; style: "normal" }[] | null = null;

/** Render the share card to a JPEG (small enough for WhatsApp previews, which skip big PNGs). */
export async function renderOgCard(model: OgCardModel): Promise<Uint8Array> {
  fonts ??= [
    { name: "Inter", data: font(inter600), weight: 600, style: "normal" },
    { name: "Inter", data: font(inter800), weight: 800, style: "normal" },
  ];
  const svg = await satori(ogCardTree(model) as never, { width: OG_W, height: OG_H, fonts, loadAdditionalAsset: async () => "" });
  const img = new Resvg(svg, { fitTo: { mode: "width", value: OG_W } }).render();
  const out = jpeg.encode({ data: Buffer.from(img.pixels), width: img.width, height: img.height }, 82);
  return new Uint8Array(out.data);
}
