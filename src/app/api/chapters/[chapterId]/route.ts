import { getChapter, updateChapterContent } from "@/lib/documents";
import { upsertChapterSearch } from "@/lib/search";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const chapter = await getChapter(chapterId);
    return NextResponse.json({ chapter });
  } catch (error) {
    console.error("Failed to fetch chapter", error);
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ chapterId: string }> },
) {
  try {
    const { chapterId } = await context.params;
    const { content } = await request.json();
    if (typeof content !== "string" || content.length === 0) {
      return NextResponse.json({ error: "Invalid content" }, { status: 400 });
    }

    const updated = await updateChapterContent(chapterId, content);
    await upsertChapterSearch(chapterId, content);

    return NextResponse.json({ ok: true, updatedAt: updated.updatedAt });
  } catch (error) {
    console.error("Failed to update chapter", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
