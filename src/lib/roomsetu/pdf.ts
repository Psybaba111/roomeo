/** Tiny dependency-free text PDF (A4, Helvetica). Enough for agreements, police forms and receipts. */
export type PdfLine = { text: string; size?: number; bold?: boolean; gap?: number };

/** Helvetica (WinAnsi) can't draw ₹ or emoji: swap ₹ for "Rs." and drop anything else outside Latin-1. */
export function pdfSafe(s: string): string {
  return s
    .replace(/₹\s?/g, "Rs. ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** Greedy wrap by character budget (Helvetica averages ~0.5em per char). */
export function wrap(text: string, size: number, width = 495): string[] {
  const max = Math.max(10, Math.floor(width / (size * 0.5)));
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if ((line + " " + word).length <= max) line += " " + word;
      else {
        out.push(line);
        line = word;
      }
      while (line.length > max) {
        out.push(line.slice(0, max));
        line = line.slice(max);
      }
    }
    out.push(line);
  }
  return out;
}

export function buildPdf(lines: PdfLine[]): Uint8Array {
  const pages: string[][] = [[]];
  let y = 800;
  for (const l of lines) {
    const size = l.size ?? 10;
    const lead = size * 1.35;
    y -= l.gap ?? 0;
    for (const w of wrap(l.text, size)) {
      if (y - lead < 50) {
        pages.push([]);
        y = 800;
      }
      y -= lead;
      pages[pages.length - 1].push(`BT /${l.bold ? "F2" : "F1"} ${size} Tf 50 ${y.toFixed(1)} Td (${pdfSafe(w)}) Tj ET`);
    }
  }
  const objs: string[] = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  const kids: string[] = [];
  pages.forEach((ops, i) => {
    const pageId = 5 + i * 2;
    const content = ops.join("\n");
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objs[pageId + 1] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
    kids.push(`${pageId} 0 R`);
  });
  objs[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(body, "latin1");
    body += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

export function pdfBase64(lines: PdfLine[]): string {
  return Buffer.from(buildPdf(lines)).toString("base64");
}
