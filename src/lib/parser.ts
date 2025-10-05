import { readFile } from "node:fs/promises";
import path from "node:path";
import iconv from "iconv-lite";
import chardet from "chardet";
import { htmlToPlainText } from "@/lib/html2text";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown"]);

type FlowItem = {
  id: string;
};

type AsyncEpub = {
  flow?: unknown[];
  getChapterRawAsync: (id: string) => Promise<string>;
  parseAsync?: () => Promise<void>;
};

export async function extractTextFromFile(
  filePath: string,
  originalName: string,
  mimeType?: string,
): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();

  if (TEXT_EXTENSIONS.has(ext)) {
    const buffer = await readFile(filePath);
    return cleanPlainText(decodeBuffer(buffer, mimeType));
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({ path: filePath });
    return cleanPlainText(htmlToPlainText(value));
  }

  if (ext === ".epub") {
    const { EPub } = await import("epub2");
    const book = (await EPub.createAsync(filePath)) as AsyncEpub;
    if (typeof book.parseAsync === "function") {
      await book.parseAsync();
    }

    const flowItems = Array.isArray(book.flow) ? book.flow.filter(isFlowItem) : [];
    const chapters = await Promise.all(
      flowItems.map(async (item) => {
        const raw = await book.getChapterRawAsync(item.id);
        return htmlToPlainText(raw);
      }),
    );

    return cleanPlainText(chapters.join("\n\n"));
  }

  if (ext === ".pdf") {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse =
      (pdfParseModule as { default?: (input: Buffer) => Promise<{ text: string }> }).default
      ?? (pdfParseModule as { pdf?: (input: Buffer) => Promise<{ text: string }> }).pdf
      ?? (pdfParseModule as unknown as (input: Buffer) => Promise<{ text: string }>);
    const buffer = await readFile(filePath);
    const data = await pdfParse(buffer);
    return cleanPlainText(data.text ?? "");
  }

  throw new Error(`Unsupported file type: ${ext || mimeType || "unknown"}`);
}

function decodeBuffer(buffer: Buffer, mimeType?: string): string {
  if (buffer.length === 0) {
    return "";
  }

  const asUtf8 = buffer.toString("utf8");
  if (!asUtf8.includes("\uFFFD")) {
    return stripBom(asUtf8);
  }

  const detected = chardet.detect(buffer);
  if (detected) {
    const normalized = normalizeEncoding(detected);
    if (iconv.encodingExists(normalized)) {
      try {
        return stripBom(iconv.decode(buffer, normalized));
      } catch (error) {
        console.warn(`Failed to decode buffer using detected encoding "${detected}"`, error);
      }
    }
  }

  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return stripBom(asUtf8);
  }

  try {
    return stripBom(iconv.decode(buffer, "utf8"));
  } catch (error) {
    console.warn("Failed to decode buffer as UTF-8", error);
    return stripBom(asUtf8);
  }
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, "");
}

function normalizeEncoding(value: string): string {
  return value.trim().toLowerCase();
}

function cleanPlainText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isFlowItem(value: unknown): value is FlowItem {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof (value as { id?: unknown }).id === "string",
  );
}
