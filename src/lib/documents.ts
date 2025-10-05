import { prisma } from "@/lib/prisma";
import type { ChapterSegment, SupportedLang } from "@/lib/chapterize";
import {
  ensureDocumentStorage,
  getChapterPath,
  removeChapterStorage,
  removeDocumentStorage,
  persistFile,
} from "@/lib/storage";
import { removeChaptersFromSearch } from "@/lib/search";

export type DocumentSummary = {
  id: string;
  originalName: string;
  lang: SupportedLang;
  charCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function createDocumentWithChapters(params: {
  originalName: string;
  mimeType: string;
  lang: SupportedLang;
  charCount: number;
  chapters: ChapterSegment[];
}) {
  const { originalName, mimeType, lang, charCount, chapters } = params;

  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        originalName,
        mimeType,
        lang,
        charCount,
      },
    });

    await tx.chapter.createMany({
      data: chapters.map((chapter, index) => ({
        documentId: document.id,
        index,
        title: chapter.title,
        startOff: chapter.start,
        endOff: chapter.end,
        content: chapter.content,
      })),
    });

    const createdChapters = await tx.chapter.findMany({
      where: { documentId: document.id },
      orderBy: { index: "asc" },
    });

    return { document, chapters: createdChapters };
  });
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const docs = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
  });
  return docs as DocumentSummary[];
}

export async function listChapters(documentId: string) {
  return prisma.chapter.findMany({
    where: { documentId },
    orderBy: { index: "asc" },
    select: {
      id: true,
      title: true,
      index: true,
      startOff: true,
      endOff: true,
      updatedAt: true,
    },
  });
}

export async function getChapter(chapterId: string) {
  return prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: { document: true },
  });
}

export async function getChapterWithNeighbors(chapterId: string) {
  const chapter = await prisma.chapter.findUniqueOrThrow({
    where: { id: chapterId },
    include: { document: true },
  });

  const [previous, next] = await Promise.all([
    chapter.index > 0
      ? prisma.chapter.findFirst({
          where: { documentId: chapter.documentId, index: chapter.index - 1 },
          select: { id: true, content: true },
        })
      : Promise.resolve(null),
    prisma.chapter.findFirst({
      where: { documentId: chapter.documentId, index: chapter.index + 1 },
      select: { id: true, content: true },
    }),
  ]);

  return { chapter, previous, next };
}

export async function updateChapterContent(chapterId: string, content: string) {
  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data: { content },
    select: {
      id: true,
      documentId: true,
      updatedAt: true,
    },
  });

  try {
    await ensureDocumentStorage(updated.documentId);
    await persistFile(getChapterPath(updated.documentId, updated.id), content);
  } catch (error) {
    console.error("Failed to persist chapter file", { chapterId, error });
  }

  return updated;
}

export async function deleteChapter(chapterId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { documentId: true, content: true },
  });

  if (!chapter) {
    throw new Error("CHAPTER_NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    await tx.editOperation.deleteMany({ where: { chapterId } });
    await tx.chapter.delete({ where: { id: chapterId } });
    const remaining = await tx.chapter.findMany({
      where: { documentId: chapter.documentId },
      select: { content: true },
    });
    const nextCharCount = remaining.reduce((total, entry) => total + entry.content.length, 0);
    await tx.document.update({
      where: { id: chapter.documentId },
      data: { charCount: nextCharCount },
    });
  });

  await removeChaptersFromSearch([chapterId]);
  await removeChapterStorage(chapter.documentId, chapterId);
}

export async function deleteDocument(documentId: string) {
  const existing = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true },
  });

  if (!existing) {
    throw new Error("DOCUMENT_NOT_FOUND");
  }

  const chapters = await prisma.chapter.findMany({
    where: { documentId },
    select: { id: true },
  });
  const chapterIds = chapters.map((chapter) => chapter.id);

  await prisma.$transaction(async (tx) => {
    if (chapterIds.length > 0) {
      await tx.editOperation.deleteMany({ where: { chapterId: { in: chapterIds } } });
      await tx.chapter.deleteMany({ where: { documentId } });
    }
    await tx.document.delete({ where: { id: documentId } });
  });

  await removeChaptersFromSearch(chapterIds);
  await removeDocumentStorage(documentId);
}

export async function recordEditOperation(params: {
  chapterId: string;
  selectionStart: number;
  selectionEnd: number;
  instruction: string;
  original: string;
  result: string;
  model: string;
  latencyMs: number;
}) {
  const { chapterId, selectionStart, selectionEnd, instruction, original, result, model, latencyMs } = params;
  return prisma.editOperation.create({
    data: {
      chapterId,
      selectionStart,
      selectionEnd,
      instruction,
      original,
      result,
      model,
      latencyMs,
    },
  });
}

export async function listEdits(chapterId: string, limit = 20) {
  return prisma.editOperation.findMany({
    where: { chapterId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
