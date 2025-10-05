# Write Assistant

Write Assistant is a local-first manuscript editor built with Next.js 15, SQLite, and Prisma. Upload long-form novels, auto-chapterize them, and iteratively rewrite selections with OpenRouter-powered LLMs.

## Features

- **Multi-format ingestion**: Upload `.txt`, `.md`, `.docx`, `.epub`, or `.pdf` files. Each upload is stored on disk and chapterized via deterministic heuristics (English and Chinese heading rules plus length fallbacks).
- **SQLite persistence**: Documents, chapters, and edit operations are persisted with Prisma. Chapter content is stored as UTF-8 plain text, and an FTS5 virtual table powers fast search.
- **Rich editor**: Tiptap-based editor with autosave, inline selection bubble for rewrite instructions, and per-chapter history of applied edits.
- **LLM rewrites**: Select any passage, provide instructions, choose a model, and trigger a rewrite via OpenRouter. Optional `:online` mode fetches lightweight web context to improve factual grounding.
- **Context repair loop**: An optional, precise second-pass LLM call can surgically fix continuity issues around the rewritten text. Enable or disable it globally from Settings, or flip the switch on the hover bubble for one-off edits.
- **Modern UI stack**: App Router, Tailwind CSS v4, shadcn/ui, Zustand for UI state, and React Query for data fetching.

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Prepare environment variables**

   Copy `.env.example` to `.env` and fill in your values:

   ```bash
   cp .env.example .env
   ```

   - `OPENROUTER_API_KEY` – required to call OpenRouter models.
   - `DATABASE_URL` – SQLite location (defaults to `file:./storage/write-assistant.db`).
   - `NODE_TLS_REJECT_UNAUTHORIZED=0` is included per the project brief to disable TLS verification in local/dev. **Remove or set to `1` for production.**

3. **Initialize the database**

   ```bash
   npm run prisma:push
   ```

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   The app runs on [http://localhost:3000](http://localhost:3000).

5. **Tune defaults in Settings**

   Open the cog menu in the top-right corner to set:

   - Default rewrite model (with support for custom slugs).
   - Whether rewrites request online context by default.
   - Context window, temperature, and max tokens.
   - The new **Context repair default**, which controls whether the continuity pass runs automatically after each rewrite.

## Project Structure

```
src/
  app/          # App Router routes & API handlers
  components/   # UI building blocks (editor, sidebar, bubble menu, etc.)
  hooks/        # React Query hooks for data fetching
  lib/          # Server utilities (chapterize, OpenRouter, search, storage)
  store/        # Zustand stores for UI state
prisma/         # Prisma schema
storage/        # Uploaded files & chapter snapshots (git-ignored)
```

## Key API Routes

- `POST /api/upload` – multipart upload, auto-ingest, and chapterize a manuscript.
- `GET /api/docs` – list documents.
- `GET /api/docs/:docId/chapters` – chapters for a document.
- `GET|PUT /api/chapters/:chapterId` – fetch or update chapter text.
- `GET /api/chapters/:chapterId/history` – recent rewrite operations.
- `POST /api/llm/rewrite` – call OpenRouter to rewrite a selection.
- `GET /api/search` – full-text search across chapters via SQLite FTS5.
- `GET /api/models` – available model list (supports `:online` suffix).

## Deployment

A production-ready `Dockerfile` is included. It builds the Next.js app, runs `prisma generate`, and exposes the application on port 3000. Mount `/app/storage` to persist uploads and SQLite data.

```bash
docker build -t write-assistant .
docker run -p 3000:3000 -v $(pwd)/storage:/app/storage write-assistant
```

Remember to harden TLS settings (remove `NODE_TLS_REJECT_UNAUTHORIZED=0`) and supply production-grade environment variables before deploying.

## Notes & Caveats

- PDF extraction relies on `pdf-parse` and may be imperfect for multi-column layouts.
- `.docx` and `.epub` ingestion converts to HTML before normalizing to plain text; some rich formatting may be simplified.
- `:online` mode uses DuckDuckGo HTML search plus direct fetches for snippets. These requests are best-effort and may fail silently.
- Streaming responses from OpenRouter are currently buffered server-side; the UI applies the rewrite after the full completion returns.
- The storage directory is git-ignored but must exist (created automatically on demand).

## License & Notices

This project lists model providers in `NOTICE.md` and disables TLS verification in development per the original specification. Review and update before production use.
