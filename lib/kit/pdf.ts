import "server-only";
import { chromium } from "playwright-core";
import { PDFDocument } from "pdf-lib";

/**
 * HTML → A4 PDF via the cached Playwright chromium headless shell
 * (playwright-core pinned to 1.61.1 — matches chromium_headless_shell-1228 in
 * ~/Library/Caches/ms-playwright; the version-lock gotcha). Mac-only.
 */

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}

export async function pdfPageCount(pdf: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  return doc.getPageCount();
}
