<p align="center">
  <img src="docs/banner.svg" alt="GTM OS — source-grounded workspace for GTM teams" width="100%" />
</p>

# GTM OS

**Source-grounded workspace for GTM teams.** GTM OS turns scattered go-to-market documents into cited answers, strategy checks, and reusable thinking grounded in the material a team already works from.

The demo workspace uses a fictional regulated SaaS company called **NorthstarIQ**. Its source files include the kinds of contradictions real revenue teams deal with: shifting buyer focus, unclear pricing, risky compliance language, competitor pressure, sales objections, and inconsistent brand guidance.

## What It Does

1. **Indexes source material** from seeded Markdown documents and browser-uploaded Markdown/TXT files.
2. **Chunks and retrieves context** in the browser for local, keyless cited answers.
3. **Optionally calls a hosted model** through `/api/ask` when `OPENAI_API_KEY` is configured.
4. **Answers with citations** so reviewers can inspect the source snippets behind each response.
5. **Supports GTM workflows** such as positioning checks, pricing inconsistency reviews, objection handling, claim safety, and campaign planning.

## Example Questions

```text
What product are we selling?
```

```text
What pricing inconsistency should sales know?
```

```text
Where is our positioning inconsistent?
```

Each answer should cite the relevant source chunks and explain what decision the team should make next.

## Architecture

| Layer | Implementation |
| --- | --- |
| App | Next.js App Router, React, TypeScript |
| Source material | Fictional NorthstarIQ Markdown files in `data/northstariq/` |
| Retrieval | Browser-side chunking and lightweight local RAG |
| Hosted synthesis | Optional `/api/ask` route using OpenAI |
| Review UX | Source preview, citation chips, copy/download controls |
| Python version | Streamlit implementation retained in `app.py` |

The current Vercel app works without API keys by using local retrieval over the included fictional source set. Hosted synthesis is optional.

## Run Locally

Next.js app:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Python Streamlit version:

```bash
uv sync
uv run streamlit run app.py
```

Open <http://localhost:8501>.

## Environment Variables

The Next.js app works without keys.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | No | Enables hosted synthesis through `/api/ask` |
| `OPENAI_MODEL` | No | Overrides the hosted model |
| `FIRECRAWL_API_KEY` | No | Used only by the Python Streamlit URL-ingestion path |

## Deploy

The recommended deployment path is Vercel.

```bash
npm install
npm run build
npx vercel
```

The Vercel URL serves the usable Next.js workspace. The Dockerfile is only needed if you want to deploy the Python Streamlit version.

## Engineering Notes

- **Local-first fallback.** The main app can answer grounded questions without a hosted model.
- **Citations before confidence.** Answers point back to source chunks so a reviewer can verify support.
- **Contradictions are part of the test set.** The fictional docs intentionally include inconsistent pricing, positioning, and risk language.
- **Hosted synthesis is additive.** Model-backed answers improve open-ended reasoning but do not replace the source-grounded retrieval layer.
- **Review flows matter.** The UI makes source inspection, copying, and Markdown export visible instead of hiding them behind a chat box.

## Validation

```bash
npm run build
uv run python -m py_compile app.py src/generation/rag.py
uv run pytest -q
```

## Data and Safety

All included NorthstarIQ documents are fictional. Do not add real customer, employer, candidate, or confidential company data to the public repository.

## License

MIT
