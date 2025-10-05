import { listEdits } from "@/lib/documents";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ chapterId: string }> },
) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const { chapterId } = await context.params;
  const edits = await listEdits(chapterId, Number.isFinite(limit) ? limit : 20);
  return NextResponse.json({ edits });
}
