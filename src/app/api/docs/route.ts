import { listDocuments } from "@/lib/documents";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const documents = await listDocuments();
  return NextResponse.json({ documents });
}
