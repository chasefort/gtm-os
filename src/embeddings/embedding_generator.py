from __future__ import annotations

from collections import Counter
from math import log, sqrt
import re

TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9$'-]+")


class LocalEmbeddingGenerator:
    def __init__(self) -> None:
        self.document_frequency: Counter[str] = Counter()
        self.document_count = 0

    def fit(self, texts: list[str]) -> None:
        self.document_count = len(texts)
        self.document_frequency.clear()
        for text in texts:
            self.document_frequency.update(set(self.tokenize(text)))

    def embed(self, text: str) -> dict[str, float]:
        tokens = self.tokenize(text)
        counts = Counter(tokens)
        vector: dict[str, float] = {}
        for token, count in counts.items():
            idf = log((1 + self.document_count) / (1 + self.document_frequency[token])) + 1
            vector[token] = count * idf
        norm = sqrt(sum(value * value for value in vector.values())) or 1.0
        return {token: value / norm for token, value in vector.items()}

    @staticmethod
    def tokenize(text: str) -> list[str]:
        return [match.group(0).lower() for match in TOKEN_RE.finditer(text)]
