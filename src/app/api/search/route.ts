import { searchChapterContent } from "@/lib/search";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const docId = url.searchParams.get("docId");
  const query = url.searchParams.get("q");

  if (!docId || !query) {
    return NextResponse.json({ error: "Missing docId or q" }, { status: 400 });
  }

  const limit = Number(url.searchParams.get("limit") ?? "10");

  try {
    const hits = await searchChapterContent(docId, query, Number.isFinite(limit) ? limit : 10);
    return NextResponse.json({ hits });
  } catch (error) {
    console.error("Search failed", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
