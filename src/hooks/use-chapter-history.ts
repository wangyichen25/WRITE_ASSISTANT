"use client";

import { useQuery } from "@tanstack/react-query";

export function useChapterHistory(chapterId?: string) {
  return useQuery({
    queryKey: ["chapter-history", chapterId],
    enabled: Boolean(chapterId),
    queryFn: async (): Promise<{
      edits: Array<{
        id: string;
        instruction: string;
        original: string;
        result: string;
        model: string;
        createdAt: string;
      }>;
    }> => {
      const res = await fetch(`/api/chapters/${chapterId}/history`);
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
  });
}
