import { prisma } from "@/lib/prisma";

let ftsReady: Promise<void> | null = null;

async function ensureFtsReady() {
  if (!ftsReady) {
    ftsReady = prisma.$executeRawUnsafe(
      "CREATE VIRTUAL TABLE IF NOT EXISTS ChapterSearch USING fts5(chapterId UNINDEXED, content)"
    ).then(() => {});
  }
  return ftsReady;
}

export async function upsertChapterSearch(chapterId: string, content: string) {
  await ensureFtsReady();
  await prisma.$executeRawUnsafe("DELETE FROM ChapterSearch WHERE chapterId = ?", chapterId);
  await prisma.$executeRawUnsafe(
    "INSERT INTO ChapterSearch(chapterId, content) VALUES (?, ?)",
    chapterId,
    content,
  );
}

export async function bulkIndexChapters(entries: { chapterId: string; content: string }[]) {
  if (entries.length === 0) return;
  await ensureFtsReady();
  await prisma.$executeRawUnsafe("BEGIN");
  try {
    for (const entry of entries) {
      await prisma.$executeRawUnsafe("DELETE FROM ChapterSearch WHERE chapterId = ?", entry.chapterId);
      await prisma.$executeRawUnsafe(
        "INSERT INTO ChapterSearch(chapterId, content) VALUES (?, ?)",
        entry.chapterId,
        entry.content,
      );
    }
    await prisma.$executeRawUnsafe("COMMIT");
  } catch (error) {
    await prisma.$executeRawUnsafe("ROLLBACK");
    throw error;
  }
}

export type SearchHit = {
  chapterId: string;
  snippet: string;
};

export async function searchChapterContent(documentId: string, query: string, limit = 10): Promise<SearchHit[]> {
  await ensureFtsReady();
  const rows = await prisma.$queryRawUnsafe<{ chapterId: string; snippet: string }[]>(
    `SELECT c.id as chapterId,
            snippet(ChapterSearch, 1, '[', ']') as snippet
     FROM ChapterSearch
     JOIN Chapter ON Chapter.id = ChapterSearch.chapterId
     WHERE Chapter.documentId = ?
       AND ChapterSearch MATCH ?
     LIMIT ?`,
    documentId,
    query,
    limit,
  );
  return rows.map((row) => ({ chapterId: row.chapterId, snippet: row.snippet }));
}
