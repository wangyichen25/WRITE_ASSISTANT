import { ingestDocument } from "@/lib/ingest";
import { NextResponse } from "next/server";
import os from "node:os";
import path from "node:path";
import { unlink, writeFile } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const tempFilePath = path.join(os.tmpdir(), `write-assistant-${Date.now()}-${file.name}`);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(tempFilePath, buffer);

    try {
      const result = await ingestDocument({
        tempFilePath,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
      });

      return NextResponse.json({
        docId: result.documentId,
        stats: {
          lang: result.lang,
          chars: result.charCount,
          chapters: result.chapters,
        },
      });
    } finally {
      await unlink(tempFilePath).catch(() => {});
    }
  } catch (error) {
    console.error("Upload failed", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
