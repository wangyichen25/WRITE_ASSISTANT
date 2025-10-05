import { DocumentSidebar } from "@/components/document-sidebar";
import { ChapterList } from "@/components/chapter-list";
import { EditorPane } from "@/components/editor-pane";
import { HistoryPanel } from "@/components/history-panel";
import { SettingsButton } from "@/components/settings-button";
import { PromptPresetsButton } from "@/components/prompt-presets-button";

export default function Home() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <DocumentSidebar />
      <div className="flex flex-1 flex-col bg-muted/20">
        <header className="flex items-center justify-end gap-3 border-b px-6 py-3">
          <PromptPresetsButton />
          <SettingsButton />
        </header>
        <div className="flex flex-1 overflow-hidden">
          <ChapterList />
          <EditorPane />
          <HistoryPanel />
        </div>
      </div>
    </div>
  );
}
