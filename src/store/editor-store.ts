import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { clampContextWindow, clampMaxTokens, clampTemperature, DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from "@/lib/rewrite-config";

export type RewriteMode = "replace" | "insert";

export type PromptPreset = {
  id: string;
  name: string;
  content: string;
};

type EditorState = {
  selectedDocumentId?: string;
  selectedChapterIdByDoc: Record<string, string | undefined>;
  defaultModel: string;
  customModels: string[];
  onlineMode: boolean;
  contextRepairEnabled: boolean;
  contextWindow: number;
  rewriteMode: RewriteMode;
  temperature: number;
  maxTokens: number;
  promptPresets: PromptPreset[];
  setSelectedDocumentId: (id?: string) => void;
  setSelectedChapterId: (chapterId?: string, documentId?: string) => void;
  setDefaultModel: (model: string) => void;
  setCustomModels: (models: string[]) => void;
  setOnlineMode: (value: boolean) => void;
  setContextRepairEnabled: (value: boolean) => void;
  setContextWindow: (value: number) => void;
  setRewriteMode: (mode: RewriteMode) => void;
  setTemperature: (value: number) => void;
  setMaxTokens: (value: number) => void;
  addPromptPreset: (preset: { name: string; content: string }) => void;
  updatePromptPreset: (preset: PromptPreset) => void;
  removePromptPreset: (presetId: string) => void;
};

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  get length() {
    return 0;
  },
} as Storage;

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      selectedDocumentId: undefined,
      selectedChapterIdByDoc: {},
      defaultModel: DEFAULT_MODEL,
      customModels: [],
      onlineMode: false,
      contextRepairEnabled: false,
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      rewriteMode: "replace",
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
      promptPresets: [],
      setSelectedDocumentId: (id) => {
        const current = get().selectedDocumentId;
        if (current === id) return;
        set({ selectedDocumentId: id });
        if (id) {
          const chapterId = get().selectedChapterIdByDoc[id];
          if (!chapterId) {
            set((state) => ({
              selectedChapterIdByDoc: { ...state.selectedChapterIdByDoc, [id]: undefined },
            }));
          }
        }
      },
      setSelectedChapterId: (chapterId, documentId) =>
        set((state) => {
          if (!documentId) {
            const docId = state.selectedDocumentId;
            if (!docId) return state;
            if (state.selectedChapterIdByDoc[docId] === chapterId) return state;
            return {
              selectedChapterIdByDoc: {
                ...state.selectedChapterIdByDoc,
                [docId]: chapterId,
              },
            };
          }
          if (state.selectedChapterIdByDoc[documentId] === chapterId) {
            return state;
          }
          return {
            selectedChapterIdByDoc: {
              ...state.selectedChapterIdByDoc,
              [documentId]: chapterId,
            },
          };
        }),
      setDefaultModel: (model) => set({ defaultModel: model }),
      setCustomModels: (models) =>
        set(() => ({
          customModels: Array.from(new Set(models.filter((item) => item.trim().length > 0))),
        })),
      setOnlineMode: (value) => set({ onlineMode: value }),
      setContextRepairEnabled: (value) => set({ contextRepairEnabled: value }),
      setContextWindow: (value) =>
        set((state) => {
          const next = clampContextWindow(value);
          if (next === state.contextWindow) return state;
          return { contextWindow: next };
        }),
      setRewriteMode: (mode) => set({ rewriteMode: mode }),
      setTemperature: (value) =>
        set((state) => {
          const next = clampTemperature(value);
          if (next === state.temperature) return state;
          return { temperature: next };
        }),
      setMaxTokens: (value) =>
        set((state) => {
          const next = clampMaxTokens(value);
          if (next === state.maxTokens) return state;
          return { maxTokens: next };
        }),
      addPromptPreset: (preset) =>
        set((state) => {
          const id = `preset-${Math.random().toString(36).slice(2, 10)}`;
          const trimmedName = preset.name.trim();
          const trimmedContent = preset.content.trim();
          if (!trimmedName || !trimmedContent) return state;
          return {
            promptPresets: [
              ...state.promptPresets,
              { id, name: trimmedName, content: trimmedContent },
            ],
          };
        }),
      updatePromptPreset: (preset) =>
        set((state) => {
          const trimmedName = preset.name.trim();
          const trimmedContent = preset.content.trim();
          if (!trimmedContent) return state;
          return {
            promptPresets: state.promptPresets.map((entry) =>
              entry.id === preset.id
                ? {
                    ...entry,
                    name: trimmedName || entry.name,
                    content: trimmedContent,
                  }
                : entry,
            ),
          };
        }),
      removePromptPreset: (presetId) =>
        set((state) => ({
          promptPresets: state.promptPresets.filter((entry) => entry.id !== presetId),
        })),
    }),
    {
      name: "write-assistant-settings",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? noopStorage : window.localStorage,
      ),
      partialize: (state) => ({
        defaultModel: state.defaultModel,
        customModels: state.customModels,
        onlineMode: state.onlineMode,
        contextRepairEnabled: state.contextRepairEnabled,
        contextWindow: state.contextWindow,
        rewriteMode: state.rewriteMode,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
        selectedDocumentId: state.selectedDocumentId,
        selectedChapterIdByDoc: state.selectedChapterIdByDoc,
        promptPresets: state.promptPresets,
      }),
    },
  ),
);

export function useSelectedChapterId(documentId?: string) {
  return useEditorStore((state) =>
    documentId ? state.selectedChapterIdByDoc[documentId] : state.selectedChapterIdByDoc[state.selectedDocumentId ?? ""],
  );
}

export function useSelectedDocumentId() {
  return useEditorStore((state) => state.selectedDocumentId);
}

export function useCustomModels() {
  return useEditorStore((state) => state.customModels);
}
