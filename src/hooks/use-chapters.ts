"use client";

import { useQuery } from "@tanstack/react-query";

export function useChapters(documentId?: string) {
  return useQuery({
    queryKey: ["chapters", documentId],
    enabled: Boolean(documentId),
    queryFn: async (): Promise<{
      chapters: Array<{
        id: string;
        title: string;
        index: number;
        startOff: number;
        endOff: number;
        updatedAt: string;
      }>;
    }> => {
      const res = await fetch(`/api/docs/${documentId}/chapters`);
      if (!res.ok) throw new Error("Failed to load chapters");
      return res.json();
    },
  });
}
