<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
# Agents in this repo

- **Creative Director** (Codex, or Claude's game-creative-director agent until Codex is available): owns all creative work. Full instructions: `docs/collab/CREATIVE_DIRECTOR.md`. Writes only inside `docs/collab/`. Never edits `src/`, `scripts/`, build config or dependencies.
- **Engineering** (Claude Code): owns implementation. Reads `docs/collab/CREATIVE/` and `FEEDBACK.md`, files requests in `docs/collab/REQUESTS.md`, implements, records work in `docs/collab/LOG.md`.

Communication happens only through the markdown files in `docs/collab/`.
