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
  // legacy 빌드: 최신 문법(Map.getOrInsertComputed 등)을 아직 모르는 Safari·옛 브라우저용 보완 코드가 들어 있다
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
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
    pages.push(pageTextFromItems(await readTextItems(page.streamTextContent())));
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

/**
 * 쪽의 글자 조각을 읽는다. pdf.js의 getTextContent는 `for await`로 스트림을 읽는데,
 * Safari는 스트림을 그렇게 읽지 못해 "undefined is not a function" 오류가 난다. 그래서 reader로 직접 읽는다.
 */
async function readTextItems(stream: ReadableStream<{ items: unknown[] }>): Promise<TextItem[]> {
  const reader = stream.getReader();
  const items: TextItem[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const it of value?.items ?? []) if (it && typeof it === "object" && "str" in it) items.push(it as TextItem);
  }
  return items;
}
