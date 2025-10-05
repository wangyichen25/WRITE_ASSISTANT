import { prisma } from "@/lib/prisma";
import type { ChapterSegment, SupportedLang } from "@/lib/chapterize";

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

export async function updateChapterContent(chapterId: string, content: string) {
  return prisma.chapter.update({
    where: { id: chapterId },
    data: { content },
  });
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
