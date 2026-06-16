from pathlib import Path

from src.document_processing.doc_processor import DocumentProcessor
from src.embeddings.embedding_generator import LocalEmbeddingGenerator
from src.generation.rag import RAGGenerator
from src.vector_database.local_vector_db import LocalVectorDB
from src.web_scraping.firecrawl import scrape_url


def test_seeded_workspace_answers_with_citations():
    root = Path(__file__).resolve().parents[1]
    processor = DocumentProcessor()
    chunks = []
    for path in sorted((root / "data" / "northstariq").glob("*.md")):
        chunks.extend(
            processor.process_path(
                path,
                source_kind="Internal",
                category="Product",
                review_status="Approved",
            )
        )

    vector_db = LocalVectorDB(LocalEmbeddingGenerator())
    vector_db.replace_chunks(chunks)
    result = RAGGenerator(vector_db).answer("What pricing inconsistency should sales know?")

    assert result.sources_used
    assert "### Short answer" in result.response
    assert "Source metadata" not in result.response
    assert "Source kind" not in result.response
    cited_text = "\n".join(source["content"] for source in result.sources_used)
    assert "$999/month" in cited_text or "$25k" in cited_text


def test_public_url_ingest_rejects_local_networks():
    blocked_urls = [
        "http://localhost:8501",
        "http://127.0.0.1:8501",
        "http://192.168.1.10/internal",
        "file:///etc/passwd",
    ]

    for url in blocked_urls:
        try:
            scrape_url(url)
        except ValueError:
            continue
        raise AssertionError(f"Expected {url} to be rejected")
