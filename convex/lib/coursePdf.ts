import { extractText, getDocumentProxy } from "unpdf";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Only accepts a URL from the scoped Canvas file record, never model input. */
export async function readCoursePdf(
  url: string,
  signal: AbortSignal,
): Promise<{ text: string; pages: number }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Unsupported document URL");
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body)
    throw new Error("Document download unavailable; sync the course and retry");
  if (Number(response.headers.get("content-length")) > MAX_PDF_BYTES) {
    await response.body.cancel();
    throw new Error("Document exceeds 10 MB limit");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PDF_BYTES) throw new Error("Document exceeds 10 MB limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("Document is not a PDF");
  const pdf = await getDocumentProxy(bytes);
  try {
    if (pdf.numPages > 100) throw new Error("Document exceeds 100 page limit");
    const result = await extractText(pdf, { mergePages: true });
    if (!result.text.trim()) throw new Error("PDF has no readable text");
    if (result.text.length > 150_000)
      throw new Error("Document text exceeds extraction limit");
    return { text: result.text, pages: result.totalPages };
  } finally {
    await pdf.loadingTask.destroy();
  }
}
