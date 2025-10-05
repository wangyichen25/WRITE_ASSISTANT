"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChapter } from "@/hooks/use-chapter";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEditorStore } from "@/store/editor-store";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { plainTextToHtml } from "@/lib/text-utils";
import { HoverRewrite } from "@/components/hover-rewrite";
import { ScrollArea } from "@/components/ui/scroll-area";

function docToPlainText(editor: Editor | null) {
  if (!editor) return "";
  const doc = editor.state.doc;
  return doc.textBetween(0, doc.content.size, "\n\n", "\n").trimEnd();
}

type ChapterEditorProps = {
  chapterId?: string;
};

type ChapterQueryResult = {
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
};

export function ChapterEditor({ chapterId }: ChapterEditorProps) {
  const { data, isLoading, isError } = useChapter(chapterId);
  const queryClient = useQueryClient();
  const defaultModel = useEditorStore((state) => state.defaultModel);
  const onlineMode = useEditorStore((state) => state.onlineMode);
  const contextWindow = useEditorStore((state) => state.contextWindow);
  const temperature = useEditorStore((state) => state.temperature);
  const maxTokens = useEditorStore((state) => state.maxTokens);
  const [localText, setLocalText] = useState("");
  const lastSaved = useRef<string>("");

  const updateChapterCache = useCallback(
    (nextContent: string, updatedAt?: string) => {
      if (!chapterId) return;
      queryClient.setQueryData<ChapterQueryResult>(["chapter", chapterId], (existing) => {
        if (!existing?.chapter) return existing;
        return {
          chapter: {
            ...existing.chapter,
            content: nextContent,
            updatedAt: updatedAt ?? existing.chapter.updatedAt,
          },
        };
      });
    },
    [chapterId, queryClient],
  );

  const saveMutation = useMutation<{ updatedAt?: string } | undefined, Error, string>({
    mutationFn: async (content) => {
      if (!chapterId) return undefined;
      const res = await fetch(`/api/chapters/${chapterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to save chapter");
      return (await res.json()) as { updatedAt?: string } | undefined;
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: chapterId ? "Start editing the chapter..." : "Select a chapter to edit",
      }),
    ],
    editable: Boolean(chapterId),
    content: chapterId ? "" : "",
    immediatelyRender: false,
    onUpdate({ editor: instance }) {
      const text = docToPlainText(instance);
      setLocalText(text);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(Boolean(chapterId));
  }, [editor, chapterId]);

  // Sync editor with loaded chapter
  useEffect(() => {
    if (!editor) return;
    if (!chapterId || !data?.chapter) {
      editor.commands.setContent("<p></p>");
      setLocalText("");
      lastSaved.current = "";
      return;
    }
    const html = plainTextToHtml(data.chapter.content);
    editor.commands.setContent(html, { emitUpdate: false });
    const text = docToPlainText(editor);
    setLocalText(text);
    lastSaved.current = text;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, chapterId, data?.chapter?.id]);

  // Autosave when content changes
  useEffect(() => {
    if (!chapterId) return;
    if (localText === lastSaved.current || !localText.trim()) return;
    const timeout = setTimeout(() => {
      saveMutation.mutate(localText, {
        onSuccess: (response) => {
          lastSaved.current = localText;
          updateChapterCache(localText, response?.updatedAt);
        },
        onError: () => {
          toast.error("Failed to save chapter");
        },
      });
    }, 1600);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localText, chapterId]);

  const lang = data?.chapter?.document?.lang ?? "en";

  const bubbleProps = useMemo(() => {
    if (!editor || !chapterId) return null;
    return {
      editor,
      chapterId,
      lang,
      defaultModel,
      onlineMode,
      contextWindow,
      temperature,
      maxTokens,
      onApply: async (nextContent: string) => {
        lastSaved.current = nextContent;
        setLocalText(nextContent);
        updateChapterCache(nextContent);
        await queryClient.invalidateQueries({ queryKey: ["chapter", chapterId] });
        await queryClient.invalidateQueries({ queryKey: ["chapter-history", chapterId] });
      },
    } as const;
  }, [
    editor,
    chapterId,
    lang,
    defaultModel,
    onlineMode,
    contextWindow,
    temperature,
    maxTokens,
    queryClient,
    updateChapterCache,
  ]);

  if (!chapterId) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-muted-foreground">
        Select a chapter to begin editing.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-muted-foreground">
        Loading chapter…
      </div>
    );
  }

  if (isError || !data?.chapter) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-red-500">
        Failed to load chapter.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">{data.chapter.title}</h2>
        <p className="text-xs text-muted-foreground">
          Last updated {new Date(data.chapter.updatedAt).toLocaleString()}
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="relative px-6 py-4">
          {bubbleProps && <HoverRewrite {...bubbleProps} />}
          <EditorContent editor={editor} className="max-w-none" />
        </div>
      </ScrollArea>
    </div>
  );
}
