import { deleteDocument } from "@/lib/documents";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ docId: string }> },
) {
  try {
    const { docId } = await context.params;
    await deleteDocument(docId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "DOCUMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    console.error("Failed to delete document", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
