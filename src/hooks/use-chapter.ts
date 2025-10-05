"use client";

import { useQuery } from "@tanstack/react-query";
import { useSelectedChapterId, useSelectedDocumentId } from "@/store/editor-store";

export function useChapter(chapterId?: string) {
  const documentId = useSelectedDocumentId();
  const storeChapterId = useSelectedChapterId(documentId);
  const resolvedChapterId = chapterId ?? storeChapterId;

  return useQuery({
    queryKey: ["chapter", resolvedChapterId],
    enabled: Boolean(resolvedChapterId),
    queryFn: async (): Promise<{
      chapter: {
        id: string;
        content: string;
        title: string;
        index: number;
        documentId: string;
        updatedAt: string;
        document: {
          id: string;
          lang: string;
          originalName: string;
        };
      };
    }> => {
      const targetId = resolvedChapterId;
      const res = await fetch(`/api/chapters/${targetId}`);
      if (!res.ok) throw new Error("Failed to load chapter");
      return res.json();
    },
  });
}
