# Deployment

## Recommended Path

Deploy the current app on Vercel. The repo includes a Vercel-native Next.js implementation that reads the fictional NorthstarIQ documents at build time, chunks them for retrieval in the browser, and can optionally call a hosted model over retrieved chunks.

No environment variables are required for the local RAG experience.

Optional Vercel environment variables:

- `OPENAI_API_KEY` enables hosted synthesis through `/api/ask`.
- `OPENAI_MODEL` overrides the default hosted model.

## Vercel

1. Push the repo to GitHub.
2. Import the repo in Vercel.
3. Keep the framework preset as Next.js.
4. Deploy.

Vercel should run:

```bash
npm install
npm run build
```

The Vercel URL is the usable demo, not just a landing page.

## Python Streamlit App

The Streamlit app is still available as `app.py`. Use this only if you specifically want the Python version.

Recommended hosts for Streamlit:

- Streamlit Community Cloud
- Railway
- Render
- Fly.io

Optional Streamlit environment variables:

- `OPENAI_API_KEY`
- `FIRECRAWL_API_KEY`
- `OPENAI_MODEL`

## Railway or Render

Use the included `Dockerfile` only for the Python Streamlit app.

Required settings:

- Port: `8501`
- Start command: included in `Dockerfile`
- Health endpoint: `/_stcore/health`

## Local validation

```bash
npm install
npm run build
npm audit
uv sync
uv run python -m py_compile app.py src/generation/rag.py
uv run pytest -q
uv run streamlit run app.py
```
