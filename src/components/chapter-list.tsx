"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChapters } from "@/hooks/use-chapters";
import { useEditorStore, useSelectedChapterId } from "@/store/editor-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSearch } from "@/hooks/use-search";

export function ChapterList() {
  const documentId = useEditorStore((state) => state.selectedDocumentId);
  const selectedChapterId = useSelectedChapterId(documentId);
  const setSelectedChapterId = useEditorStore((state) => state.setSelectedChapterId);
  const [query, setQuery] = useState("");
  const { data, isLoading, isError } = useChapters(documentId);
  const searchEnabled = query.trim().length > 2;
  const { data: searchResults } = useSearch(documentId, query);
  const chapters = useMemo(() => data?.chapters ?? [], [data?.chapters]);

  const lastDocIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!documentId) {
      lastDocIdRef.current = undefined;
      return;
    }

    const hasSelection = selectedChapterId && chapters.some((chapter) => chapter.id === selectedChapterId);
    const docChanged = lastDocIdRef.current && lastDocIdRef.current !== documentId;

    if (!hasSelection || docChanged) {
      const fallbackChapter = chapters[0];
      if (fallbackChapter) {
        setSelectedChapterId(fallbackChapter.id, documentId);
      }
    }

    lastDocIdRef.current = documentId;
  }, [documentId, chapters, selectedChapterId, setSelectedChapterId]);

  if (!documentId) {
    return (
      <div className="flex h-full flex-col border-r bg-card/40">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Chapters</h2>
          <p className="text-xs text-muted-foreground">Select a document to view chapters.</p>
        </div>
      </div>
    );
  }

  const hits = searchEnabled ? searchResults?.hits ?? [] : [];
  const hitChapterIds = new Set(hits.map((hit) => hit.chapterId));

  return (
    <div className="flex h-full w-72 flex-col border-r bg-card/40">
      <div className="space-y-2 border-b px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold">Chapters</h2>
          <p className="text-xs text-muted-foreground">Choose a chapter to edit</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="chapter-search" className="text-xs text-muted-foreground">
            Search inside chapters
          </Label>
          <Input
            id="chapter-search"
            placeholder="Search (min 3 characters)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 text-sm"
          />
        </div>
        {searchEnabled && hits.length > 0 && (
          <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
            Showing results in {hits.length} chapters.
          </div>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Loading chapters…</div>
          ) : isError ? (
            <div className="p-3 text-sm text-red-500">Failed to load chapters.</div>
          ) : chapters.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No chapters detected.</div>
          ) : (
            chapters.map((chapter) => (
              <button
                key={chapter.id}
                type="button"
                onClick={() => setSelectedChapterId(chapter.id, documentId)}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left text-sm transition",
                  chapter.id === selectedChapterId
                    ? "border-primary bg-primary/10"
                    : hitChapterIds.has(chapter.id)
                      ? "border-amber-400 bg-amber-50 text-amber-900"
                      : "hover:border-border hover:bg-muted",
                )}
              >
                <div className="font-medium">
                  {chapter.index + 1}. {chapter.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  Updated {new Date(chapter.updatedAt).toLocaleDateString()}
                </div>
                {hitChapterIds.has(chapter.id) && (
                  <div className="mt-1 line-clamp-2 text-xs text-amber-800">
                    {hits.find((hit) => hit.chapterId === chapter.id)?.snippet}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
