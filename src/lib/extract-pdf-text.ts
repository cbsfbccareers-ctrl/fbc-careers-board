"use client";

/**
 * Client-only PDF → plain text extraction (no server upload).
 * Requires `public/pdf.worker.min.mjs` from pdfjs-dist.
 */
export async function extractTextFromPdfFile(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc =
      `${window.location.origin}/pdf.worker.min.mjs`;
  }
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let pi = 1; pi <= doc.numPages; pi += 1) {
    const page = await doc.getPage(pi);
    const content = await page.getTextContent();
    let line = "";
    for (const item of content.items) {
      if (typeof item === "object" && item !== null && "str" in item) {
        line += `${(item as { str: string }).str} `;
      }
    }
    parts.push(line.trim());
  }
  return parts.filter(Boolean).join("\n\n").trim().slice(0, 100_000);
}
