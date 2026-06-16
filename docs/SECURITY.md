# Security Notes

## Demo data

All seeded NorthstarIQ source material is fictional. Do not use real customer, employer, candidate, or confidential company data in the public demo.

This repository is safe to publish publicly as long as secrets, local-only notes, and real customer data are not added.

## Secrets

Keep these values out of Git:

- `OPENAI_API_KEY`
- `FIRECRAWL_API_KEY`
- `.env`
- `.streamlit/secrets.toml`

Use Streamlit secrets or hosted environment variables in production-like deployments.

## Uploads

The Vercel app supports Markdown and TXT uploads. Uploaded content is indexed in memory for the current browser session. The Python Streamlit app also has PDF parsing support. For real production use, add:

- User authentication.
- File size limits.
- Malware scanning.
- Tenant-scoped storage.
- Deletion controls.
- Audit logs.

## URL ingestion and web context

The Vercel app can ingest pasted external context or web search results as source material. The Python Streamlit Firecrawl URL ingestion should be used only for content the user has permission to process. For public deployments, consider allowlists, rate limits, and abuse protection.

## Generation

Outputs are source-grounded but should still be reviewed by a human before external use, especially for regulated industries, pricing, legal claims, or compliance language. If hosted synthesis is enabled, only send source chunks that are safe to process through the configured model provider.
