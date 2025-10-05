import { readFile } from "node:fs/promises";
import { chapterize, detectLang } from "@/lib/chapterize";
import { createDocumentWithChapters } from "@/lib/documents";
import { extractTextFromFile } from "@/lib/parser";
import { bulkIndexChapters } from "@/lib/search";
import {
  ensureDocumentStorage,
  getChapterPath,
  getDocumentDir,
  getOriginalPath,
  persistFile,
} from "@/lib/storage";

export type IngestResult = {
  documentId: string;
  lang: "en" | "zh";
  charCount: number;
  chapters: number;
};

export async function ingestDocument(params: {
  tempFilePath: string;
  originalName: string;
  mimeType: string;
}) {
  const { tempFilePath, originalName, mimeType } = params;

  const plainText = await extractTextFromFile(tempFilePath, originalName, mimeType);
  const lang = detectLang(plainText);
  const segments = chapterize(plainText, lang);

  if (segments.length === 0) {
    throw new Error("Unable to chapterize document");
  }

  const { document, chapters } = await createDocumentWithChapters({
    originalName,
    mimeType,
    lang,
    charCount: plainText.length,
    chapters: segments,
  });

  await ensureDocumentStorage(document.id);
  await persistOriginal(document.id, originalName, tempFilePath);
  await persistChapters(document.id, chapters, segments);

  await bulkIndexChapters(
    chapters.map((chapter) => ({ chapterId: chapter.id, content: chapter.content })),
  );

  return {
    documentId: document.id,
    lang,
    charCount: plainText.length,
    chapters: segments.length,
  } satisfies IngestResult;
}

async function persistOriginal(documentId: string, originalName: string, tempFilePath: string) {
  const buffer = await readFile(tempFilePath);
  const target = getOriginalPath(documentId, originalName || "upload.txt");
  await persistFile(target, buffer);
}

async function persistChapters(
  documentId: string,
  chapters: { id: string; index: number; content: string }[],
  segments: { index: number; content: string }[],
) {
  for (const chapter of chapters) {
    const target = getChapterPath(documentId, chapter.id);
    const matchingSegment = segments[chapter.index];
    const payload = matchingSegment?.content ?? chapter.content;
    await persistFile(target, payload);
  }
}

export function getDocumentStoragePath(documentId: string) {
  return getDocumentDir(documentId);
}
