/**
 * Client-side PDF text extraction. The file never leaves the browser.
 * Text-based PDFs work; scanned images return no text (OCR is a roadmap item).
 */
export async function extractPdfText(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let page = 1; page <= doc.numPages; page++) {
    const p = await doc.getPage(page);
    const content = await p.getTextContent();
    const lines: string[] = [];
    let current = "";
    for (const item of content.items) {
      const str = "str" in item ? item.str : "";
      const hasEol = "hasEOL" in item ? item.hasEOL : false;
      current += str;
      if (hasEol) { lines.push(current.trim()); current = ""; }
    }
    if (current.trim()) lines.push(current.trim());
    parts.push(lines.join("\n"));
  }
  await doc.cleanup();
  return { text: parts.join("\n\n"), pages: doc.numPages };
}
