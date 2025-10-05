"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChapters } from "@/hooks/use-chapters";
import { useEditorStore, useSelectedChapterId } from "@/store/editor-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useSearch } from "@/hooks/use-search";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function ChapterList() {
  const documentId = useEditorStore((state) => state.selectedDocumentId);
  const selectedChapterId = useSelectedChapterId(documentId);
  const setSelectedChapterId = useEditorStore((state) => state.setSelectedChapterId);
  const [query, setQuery] = useState("");
  const { data, isLoading, isError } = useChapters(documentId);
  const searchEnabled = query.trim().length > 2;
  const { data: searchResults } = useSearch(documentId, query);
  const chapters = useMemo(() => data?.chapters ?? [], [data?.chapters]);
  const queryClient = useQueryClient();

  const deleteChapterMutation = useMutation<unknown, Error, string>({
    mutationFn: async (chapterId) => {
      const res = await fetch(`/api/chapters/${chapterId}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to delete chapter" }));
        throw new Error(error.error ?? "Failed to delete chapter");
      }
      return res.json();
    },
  });

  const lastDocIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!documentId) {
      lastDocIdRef.current = undefined;
      return;
    }

    if (chapters.length === 0) {
      return;
    }

    const hasSelection = Boolean(
      selectedChapterId && chapters.some((chapter) => chapter.id === selectedChapterId),
    );
    const docChanged = lastDocIdRef.current && lastDocIdRef.current !== documentId;

    if (!hasSelection) {
      const fallbackChapter = chapters[0];
      if (fallbackChapter) {
        setSelectedChapterId(fallbackChapter.id, documentId);
      }
    }

    if (docChanged && hasSelection) {
      // ensure scroll restoration runs when returning to a document with a saved chapter
      setSelectedChapterId(selectedChapterId, documentId);
    }

    lastDocIdRef.current = documentId;
  }, [documentId, chapters, selectedChapterId, setSelectedChapterId]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !selectedChapterId) return;
    const node = container.querySelector<HTMLElement>(
      `[data-chapter-id="${selectedChapterId}"]`,
    );
    if (!node) return;
    const containerRect = container.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const currentScroll = container.scrollTop;
    const nodeTop = nodeRect.top - containerRect.top + currentScroll;
    const target = nodeTop - container.clientHeight / 2 + nodeRect.height / 2;
    container.scrollTo({ top: Math.max(target, 0) });
  }, [selectedChapterId, chapters.length]);

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

  const handleDeleteChapter = async (chapter: { id: string; title: string }) => {
    if (!documentId) return;
    const confirmed = window.confirm(`Delete chapter "${chapter.title}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteChapterMutation.mutateAsync(chapter.id);
      toast.success(`Deleted ${chapter.title}`);
      if (selectedChapterId === chapter.id) {
        setSelectedChapterId(undefined, documentId);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chapters"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] }),
        queryClient.invalidateQueries({ queryKey: ["documents"] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete chapter";
      toast.error(message);
    }
  };

  const deletingChapterId = deleteChapterMutation.isPending ? deleteChapterMutation.variables : null;

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
      <ScrollArea ref={scrollRef} className="flex-1">
        <div className="space-y-1 p-2">
          {isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Loading chapters…</div>
          ) : isError ? (
            <div className="p-3 text-sm text-red-500">Failed to load chapters.</div>
          ) : chapters.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No chapters detected.</div>
          ) : (
            chapters.map((chapter) => {
              const isSelected = chapter.id === selectedChapterId;
              const isHit = hitChapterIds.has(chapter.id);
              const isDeleting = deletingChapterId === chapter.id;
              const snippet = hits.find((hit) => hit.chapterId === chapter.id)?.snippet;
              return (
                <div
                  key={chapter.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedChapterId(chapter.id, documentId!)}
                  onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedChapterId(chapter.id, documentId!);
                    }
                  }}
                  className={cn(
                    "group cursor-pointer rounded-md border px-3 py-2 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    isSelected
                      ? "border-primary bg-primary/10"
                      : isHit
                        ? "border-amber-400 bg-amber-50 text-amber-900"
                        : "border-border/60 hover:border-border hover:bg-muted",
                  )}
                  data-chapter-id={chapter.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-medium">
                        {chapter.index + 1}. {chapter.title}
                      </div>
                      <div className={cn("text-xs", isHit ? "text-amber-800" : "text-muted-foreground")}>
                        Updated {new Date(chapter.updatedAt).toLocaleDateString()}
                      </div>
                      {snippet && (
                        <div className="mt-1 line-clamp-2 text-xs text-amber-800">
                          {snippet}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={cn(
                        "text-xs text-red-500 transition hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 opacity-0",
                        isDeleting && "opacity-100",
                        "disabled:opacity-50",
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteChapter(chapter);
                      }}
                      onKeyDown={(event) => event.stopPropagation()}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
