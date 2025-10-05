"use client";

import { useDocuments } from "@/hooks/use-documents";
import { useEditorStore } from "@/store/editor-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DocumentSidebar() {
  const { data, isLoading, isError } = useDocuments();
  const documents = useMemo(() => data?.documents ?? [], [data?.documents]);
  const selectedDocumentId = useEditorStore((state) => state.selectedDocumentId);
  const setSelectedDocumentId = useEditorStore((state) => state.setSelectedDocumentId);
  const setSelectedChapterId = useEditorStore((state) => state.setSelectedChapterId);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(error.error ?? "Upload failed");
      }
      return response.json() as Promise<{
        docId: string;
        stats: { lang: string; chars: number; chapters: number };
      }>;
    },
  });

  const handleSelectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadMutation.mutateAsync(file);
      toast.success(`Uploaded ${file.name}`);
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSelectedDocumentId(result.docId);
      setSelectedChapterId(undefined, result.docId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      toast.error(message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.originalName.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    if (!documents.length) return;
    const hasSelection = selectedDocumentId && documents.some((doc) => doc.id === selectedDocumentId);
    if (!hasSelection) {
      setSelectedDocumentId(documents[0].id);
    }
  }, [documents, selectedDocumentId, setSelectedDocumentId]);

  return (
    <div className="flex h-full w-72 flex-col border-r bg-card">
      <div className="space-y-3 border-b px-4 py-4">
        <div>
          <h1 className="text-base font-semibold">Write Assistant</h1>
          <p className="text-xs text-muted-foreground">Upload and manage manuscripts</p>
        </div>
        <div className="space-y-2">
          <Input
            type="file"
            accept=".txt,.md,.docx,.epub,.pdf"
            ref={fileRef}
            onChange={handleSelectFile}
            disabled={uploading}
          />
          {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="search" className="text-xs text-muted-foreground">
            Filter documents
          </Label>
          <Input
            id="search"
            placeholder="Search uploads"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading documents…</div>
          ) : isError ? (
            <div className="p-4 text-sm text-red-500">Failed to load documents.</div>
          ) : filteredDocuments.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No documents uploaded yet.</div>
          ) : (
            <div className="space-y-1">
              {filteredDocuments.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDocumentId(doc.id)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left text-sm transition",
                    doc.id === selectedDocumentId
                      ? "border-primary bg-primary/10"
                      : "hover:border-border hover:bg-muted",
                  )}
                >
                  <div className="font-medium">{doc.originalName}</div>
                  <div className="text-xs text-muted-foreground">
                    {doc.lang.toUpperCase()} · {(doc.charCount / 1000).toFixed(1)}k chars
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
