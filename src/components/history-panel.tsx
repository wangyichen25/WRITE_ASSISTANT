"use client";

import { useChapterHistory } from "@/hooks/use-chapter-history";
import { useSelectedChapterId, useSelectedDocumentId } from "@/store/editor-store";
import { ScrollArea } from "@/components/ui/scroll-area";

export function HistoryPanel() {
  const documentId = useSelectedDocumentId();
  const chapterId = useSelectedChapterId(documentId);
  const { data, isLoading, isError } = useChapterHistory(chapterId);

  if (!chapterId) {
    return (
      <div className="flex h-full w-80 flex-col border-l bg-card/60">
        <div className="border-b px-4 py-4">
          <h3 className="text-sm font-semibold">Edit history</h3>
          <p className="text-xs text-muted-foreground">Select a chapter to see applied rewrites.</p>
        </div>
      </div>
    );
  }

  const edits = data?.edits ?? [];

  return (
    <div className="flex h-full w-80 flex-col border-l bg-card/60">
      <div className="border-b px-4 py-4">
        <h3 className="text-sm font-semibold">Edit history</h3>
        <p className="text-xs text-muted-foreground">
          Latest model-assisted rewrites
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading history…</div>
          ) : isError ? (
            <div className="text-sm text-red-500">Failed to load history.</div>
          ) : edits.length === 0 ? (
            <div className="text-sm text-muted-foreground">No rewrites recorded yet.</div>
          ) : (
            edits.map((edit) => (
              <div key={edit.id} className="rounded-md border bg-background p-3 shadow-sm">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  {edit.model}
                </div>
                <div className="mt-2 text-sm font-medium">Instruction</div>
                <p className="text-sm text-muted-foreground">{edit.instruction}</p>
                <div className="mt-2 text-sm font-medium">Result</div>
                <p className="text-sm whitespace-pre-wrap text-foreground">{edit.result}</p>
                <div className="mt-2 text-[11px] uppercase text-muted-foreground">
                  {new Date(edit.createdAt).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
