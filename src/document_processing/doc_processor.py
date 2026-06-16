from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
import hashlib

import fitz


@dataclass
class DocumentChunk:
    content: str
    source_file: str
    source_kind: str
    category: str
    review_status: str
    page_number: int | None = None
    chunk_index: int = 0
    start_char: int | None = None
    end_char: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    chunk_id: str = ""

    def __post_init__(self) -> None:
        if not self.chunk_id:
            digest = hashlib.md5(
                f"{self.source_file}:{self.chunk_index}:{self.content}".encode("utf-8")
            ).hexdigest()[:10]
            self.chunk_id = f"{self.source_file}:{self.chunk_index}:{digest}"

    def citation(self) -> dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "source_file": self.source_file,
            "source_kind": self.source_kind,
            "category": self.category,
            "review_status": self.review_status,
            "page_number": self.page_number,
            "chunk_index": self.chunk_index,
            "start_char": self.start_char,
            "end_char": self.end_char,
            **self.metadata,
        }


class DocumentProcessor:
    def __init__(self, chunk_size: int = 900, chunk_overlap: int = 140) -> None:
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def process_path(
        self,
        file_path: str | Path,
        source_kind: str = "Internal",
        category: str = "Product",
        review_status: str = "Approved",
        display_name: str | None = None,
    ) -> list[DocumentChunk]:
        path = Path(file_path)
        if path.suffix.lower() == ".pdf":
            return self._process_pdf(path, source_kind, category, review_status, display_name)
        if path.suffix.lower() in {".txt", ".md"}:
            text = path.read_text(encoding="utf-8")
            return self.process_text(
                text,
                display_name or path.name,
                source_kind,
                category,
                review_status,
                metadata={"file_size": path.stat().st_size},
            )
        raise ValueError(f"Unsupported file type: {path.suffix}")

    def process_text(
        self,
        text: str,
        source_file: str,
        source_kind: str,
        category: str,
        review_status: str,
        metadata: dict[str, Any] | None = None,
    ) -> list[DocumentChunk]:
        return self._chunk_text(
            text=text,
            source_file=source_file,
            source_kind=source_kind,
            category=category,
            review_status=review_status,
            page_number=None,
            metadata=metadata or {},
        )

    def _process_pdf(
        self,
        path: Path,
        source_kind: str,
        category: str,
        review_status: str,
        display_name: str | None,
    ) -> list[DocumentChunk]:
        chunks: list[DocumentChunk] = []
        doc = fitz.open(path)
        for page_index in range(len(doc)):
            page_text = doc.load_page(page_index).get_text().strip()
            if page_text:
                chunks.extend(
                    self._chunk_text(
                        text=page_text,
                        source_file=display_name or path.name,
                        source_kind=source_kind,
                        category=category,
                        review_status=review_status,
                        page_number=page_index + 1,
                        metadata={"total_pages": len(doc)},
                    )
                )
        doc.close()
        return chunks

    def _chunk_text(
        self,
        text: str,
        source_file: str,
        source_kind: str,
        category: str,
        review_status: str,
        page_number: int | None,
        metadata: dict[str, Any],
    ) -> list[DocumentChunk]:
        chunks: list[DocumentChunk] = []
        clean_text = text.strip()
        start = 0
        while start < len(clean_text):
            end = min(start + self.chunk_size, len(clean_text))
            if end < len(clean_text):
                newline = clean_text.rfind("\n\n", start, end)
                period = clean_text.rfind(". ", start, end)
                boundary = max(newline, period)
                if boundary > start + self.chunk_size * 0.45:
                    end = boundary + 1
            chunk_text = clean_text[start:end].strip()
            if chunk_text:
                chunks.append(
                    DocumentChunk(
                        content=chunk_text,
                        source_file=source_file,
                        source_kind=source_kind,
                        category=category,
                        review_status=review_status,
                        page_number=page_number,
                        chunk_index=len(chunks),
                        start_char=start,
                        end_char=end,
                        metadata=metadata.copy(),
                    )
                )
            if end >= len(clean_text):
                break
            start = max(end - self.chunk_overlap, start + 1)
        return chunks
