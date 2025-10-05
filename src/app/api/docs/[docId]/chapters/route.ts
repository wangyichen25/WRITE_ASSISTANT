import { listChapters } from "@/lib/documents";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ docId: string }> },
) {
  try {
    const { docId } = await context.params;
    const chapters = await listChapters(docId);
    return NextResponse.json({ chapters });
  } catch (error) {
    console.error("Failed to list chapters", error);
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
}
