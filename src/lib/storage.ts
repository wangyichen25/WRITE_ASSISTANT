import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const storageRoot = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "storage");

export function getDocumentDir(documentId: string) {
  return path.join(storageRoot, documentId);
}

export function getOriginalPath(documentId: string, originalName: string) {
  return path.join(getDocumentDir(documentId), `original${path.extname(originalName)}`);
}

export function getChapterDir(documentId: string) {
  return path.join(getDocumentDir(documentId), "chapters");
}

export function getChapterPath(documentId: string, chapterId: string) {
  return path.join(getChapterDir(documentId), `${chapterId}.txt`);
}

export function getSnapshotDir(documentId: string) {
  return path.join(getDocumentDir(documentId), "snapshots");
}

export async function ensureDocumentStorage(documentId: string) {
  await mkdir(getDocumentDir(documentId), { recursive: true });
  await mkdir(getChapterDir(documentId), { recursive: true });
  await mkdir(getSnapshotDir(documentId), { recursive: true });
}

export async function persistFile(targetPath: string, data: Buffer | string) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, data);
}

export async function removeChapterStorage(documentId: string, chapterId: string) {
  const chapterPath = getChapterPath(documentId, chapterId);
  await rm(chapterPath, { force: true }).catch(() => {});
}

export async function removeDocumentStorage(documentId: string) {
  const dir = getDocumentDir(documentId);
  await rm(dir, { force: true, recursive: true }).catch(() => {});
}
