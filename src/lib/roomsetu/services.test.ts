import assert from "node:assert/strict";
import test from "node:test";
import { fileUploadError, likeContains, photoUrlError } from "./services.ts";

const jpegBytes = Buffer.alloc(48, 1);
jpegBytes[0] = 0xff;
jpegBytes[1] = 0xd8;
jpegBytes[2] = 0xff;
const pngBytes = Buffer.alloc(48, 2);
pngBytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = `data:image/jpeg;base64,${jpegBytes.toString("base64")}`;
const png = `data:image/png;base64,${pngBytes.toString("base64")}`;

test("accepts https catalog photos and real image bytes", () => {
  assert.equal(photoUrlError("https://images.unsplash.com/photo-1?w=800"), null);
  assert.equal(photoUrlError(jpeg), null);
  assert.equal(photoUrlError(png), null);
});

test("rejects insecure, fake, and oversized photos", () => {
  assert.match(photoUrlError("http://example.com/a.jpg") ?? "", /https/);
  assert.match(photoUrlError("data:image/svg+xml;base64,PHN2Zy8+") ?? "", /JPG/);
  assert.match(photoUrlError(`data:image/jpeg;base64,${"A".repeat(300_000)}`) ?? "", /large|read|JPEG/);
  assert.equal(likeContains("100%_off"), "%100\\%\\_off%");
  assert.match(fileUploadError({ type: "image/gif", bytes: 100 }) ?? "", /JPG/);
  assert.equal(fileUploadError({ type: "image/jpeg", bytes: 1000 }), null);
});
