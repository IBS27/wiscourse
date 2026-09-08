import { afterEach, expect, it, vi } from "vitest";
import { MAX_PDF_BYTES, readCoursePdf } from "../convex/lib/coursePdf";

afterEach(() => vi.unstubAllGlobals());
// Minimal PDF with a real text layer; exercises PDF.js rather than mocking extraction.
function pdfFixture() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream =
    "BT /F1 12 Tf 72 720 Td (Lecture schedule September 8, 2026) Tj ET";
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return body;
}
it("extracts the actual PDF text layer", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(pdfFixture())));
  const result = await readCoursePdf(
    "https://canvas.example/file",
    AbortSignal.timeout(5000),
  );
  expect(result.pages).toBe(1);
  expect(result.text).toContain("Lecture schedule September 8, 2026");
});
it("rejects non-PDF content and oversized streamed bodies", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response("<html>Sign in</html>"))
    .mockResolvedValueOnce(new Response(new Uint8Array(MAX_PDF_BYTES + 1)));
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    readCoursePdf("https://canvas.example/file", AbortSignal.timeout(5000)),
  ).rejects.toThrow("not a PDF");
  await expect(
    readCoursePdf("https://canvas.example/file", AbortSignal.timeout(5000)),
  ).rejects.toThrow("10 MB");
});
it("rejects non-HTTPS URLs before fetching", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    readCoursePdf("file:///etc/passwd", AbortSignal.timeout(5000)),
  ).rejects.toThrow("Unsupported document URL");
  expect(fetchMock).not.toHaveBeenCalled();
});
