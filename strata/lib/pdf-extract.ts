"use client";
import { detectPageOffset, looksScanned, pageTextFromItems, type TextItem } from "@/lib/pdf-text";

export interface ExtractedPdf {
  fileName: string;
  pages: string[];
  pageOffset: number | null;
  chars: number;
  scanned: boolean;
}

/** 한 번에 받는 최대 쪽 수 (학위논문 전체도 대부분 들어간다) */
export const MAX_PDF_PAGES = 300;

/**
 * 브라우저에서 PDF의 글자를 쪽별로 뽑는다. 파일은 서버로 보내지 않고 글자만 보낸다.
 * pdf.js는 무거워서 쓸 때만 불러온다.
 */
export async function extractPdf(file: File, onProgress?: (done: number, total: number) => void): Promise<ExtractedPdf> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "PasswordException") throw new Error(`“${file.name}”은 암호가 걸려 있어 열 수 없습니다.`);
    throw new Error(`“${file.name}”을 PDF로 읽지 못했습니다.`);
  }
  const total = Math.min(doc.numPages, MAX_PDF_PAGES);
  const pages: string[] = [];
  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(pageTextFromItems(content.items.filter((x): x is TextItem & typeof x => "str" in x) as TextItem[]));
    page.cleanup();
    onProgress?.(i, total);
  }
  await task.destroy();
  return {
    fileName: file.name,
    pages,
    pageOffset: detectPageOffset(pages),
    chars: pages.reduce((n, p) => n + p.length, 0),
    scanned: looksScanned(pages),
  };
}
