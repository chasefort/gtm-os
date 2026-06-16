from __future__ import annotations

from dataclasses import dataclass

from src.document_processing.doc_processor import DocumentChunk
from src.embeddings.embedding_generator import LocalEmbeddingGenerator


@dataclass
class SearchResult:
    chunk: DocumentChunk
    score: float


class LocalVectorDB:
    def __init__(self, embedding_generator: LocalEmbeddingGenerator) -> None:
        self.embedding_generator = embedding_generator
        self.chunks: list[DocumentChunk] = []
        self.vectors: list[dict[str, float]] = []

    def replace_chunks(self, chunks: list[DocumentChunk]) -> None:
        self.chunks = chunks
        self.embedding_generator.fit([chunk.content for chunk in chunks])
        self.vectors = [self.embedding_generator.embed(chunk.content) for chunk in chunks]

    def add_chunks(self, chunks: list[DocumentChunk]) -> None:
        self.replace_chunks([*self.chunks, *chunks])

    def search(self, query: str, limit: int = 8) -> list[SearchResult]:
        if not self.chunks:
            return []
        query_vector = self.embedding_generator.embed(query)
        scored = [
            SearchResult(chunk=chunk, score=self._cosine(query_vector, vector))
            for chunk, vector in zip(self.chunks, self.vectors)
        ]
        scored.sort(key=lambda result: result.score, reverse=True)
        return [result for result in scored[:limit] if result.score > 0]

    def get_chunk(self, chunk_id: str) -> DocumentChunk | None:
        return next((chunk for chunk in self.chunks if chunk.chunk_id == chunk_id), None)

    @staticmethod
    def _cosine(left: dict[str, float], right: dict[str, float]) -> float:
        if len(left) > len(right):
            left, right = right, left
        return sum(value * right.get(token, 0.0) for token, value in left.items())
