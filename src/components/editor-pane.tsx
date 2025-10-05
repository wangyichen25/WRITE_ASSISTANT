"use client";

import dynamic from "next/dynamic";
import { useSelectedChapterId, useSelectedDocumentId } from "@/store/editor-store";

const ChapterEditor = dynamic(
  () => import("@/components/chapter-editor").then((mod) => mod.ChapterEditor),
  { ssr: false },
);

export function EditorPane() {
  const documentId = useSelectedDocumentId();
  const chapterId = useSelectedChapterId(documentId);
  return <ChapterEditor chapterId={chapterId} />;
}
