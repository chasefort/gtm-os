from __future__ import annotations

from dataclasses import dataclass
import os
import re

from src.vector_database.local_vector_db import LocalVectorDB, SearchResult


@dataclass
class RAGResult:
    query: str
    response: str
    sources_used: list[dict]


class RAGGenerator:
    def __init__(self, vector_db: LocalVectorDB, model: str = "gpt-4o-mini") -> None:
        self.vector_db = vector_db
        self.model = model

    def answer(self, query: str, top_k: int = 8) -> RAGResult:
        results = self.vector_db.search(query, limit=top_k)
        if not results:
            return RAGResult(
                query=query,
                response="I do not have enough indexed source material to answer that yet.",
                sources_used=[],
            )

        sources = self._sources(results)
        response = self._openai_answer(query, results) or self._extractive_answer(query, results)
        return RAGResult(query=query, response=response, sources_used=sources)

    def generate_artifact(self, title: str, instructions: str, top_k: int = 12) -> RAGResult:
        query = f"{title}. {instructions}"
        results = self.vector_db.search(query, limit=top_k)
        if not results:
            return RAGResult(query=title, response="No indexed sources are available.", sources_used=[])
        sources = self._sources(results)
        response = self._openai_artifact(title, instructions, results) or self._template_artifact(
            title, instructions, results
        )
        return RAGResult(query=title, response=response, sources_used=sources)

    def _openai_answer(self, query: str, results: list[SearchResult]) -> str | None:
        return self._call_openai(
            system=(
                "You are GTM OS, writing for a non-technical business reader. "
                "Answer only from the supplied source excerpts. Use clean Markdown with short sections, "
                "plain-language bullets, and citations like [1]. Do not dump raw excerpts or metadata. "
                "Flag weak support or contradictions clearly."
            ),
            user=f"Question: {query}\n\nSource excerpts:\n{self._context(results)}",
            max_tokens=900,
        )

    def _openai_artifact(self, title: str, instructions: str, results: list[SearchResult]) -> str | None:
        return self._call_openai(
            system=(
                "You create polished, client-facing GTM assets for business operators and non-technical reviewers. "
                "Use clean Markdown, short sections, readable bullets, and plain language. "
                "Every factual claim needs citations like [1]. Do not dump raw excerpts or metadata. "
                "Flag contradictions and unsupported claims clearly."
            ),
            user=f"Create: {title}\n\nRequired structure:\n{instructions}\n\nSource excerpts:\n{self._context(results)}",
            max_tokens=1600,
        )

    def _call_openai(self, system: str, user: str, max_tokens: int) -> str | None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        try:
            from openai import OpenAI

            client = OpenAI(api_key=api_key)
            completion = client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                temperature=0.1,
                max_tokens=max_tokens,
            )
            return completion.choices[0].message.content or None
        except Exception:
            return None

    def _extractive_answer(self, query: str, results: list[SearchResult]) -> str:
        query_terms = self._terms(query)
        if {"objection", "objections"} & query_terms:
            objection_answer = self._objection_answer(results)
            if objection_answer:
                return objection_answer

        evidence = self._ranked_evidence(query, results, limit=5)
        if not evidence:
            return (
                "### Short answer\n"
                "I found related source material, but it was not clean enough to summarize confidently.\n\n"
                "### Recommended next step\n"
                "Open the citations below and review the source snippets directly."
            )

        primary = evidence[0]
        lines = [
            "### Short answer",
            f"{primary['sentence']} {primary['reference']}",
            "",
            "### What the sources show",
        ]
        for item in evidence[1:4]:
            lines.append(f"- {item['sentence']} {item['reference']}")

        lines.extend(
            [
                "",
                "### Recommended next step",
                f"Use this as the working answer, then verify the exact language in the citations below before sharing it externally.",
            ]
        )
        if len({item["source_file"] for item in evidence}) > 1:
            lines.extend(
                [
                    "",
                    "### Source coverage",
                    "This answer combines multiple internal source files, so it is useful for alignment but should be treated as a synthesized view.",
                ]
            )
        return "\n".join(lines)

    def _objection_answer(self, results: list[SearchResult]) -> str | None:
        categories = []
        category_pattern = re.compile(
            r"(AI trust|Compliance control|Workflow adoption|ROI):\s*([^?]+\?)",
            re.IGNORECASE,
        )
        for index, result in enumerate(results, start=1):
            for label, question in category_pattern.findall(result.chunk.content):
                clean_label = {"ai trust": "AI Trust", "roi": "ROI"}.get(label.lower(), label.title())
                categories.append((clean_label, question.strip(), f"[{index}]"))

        if not categories:
            return None

        seen = set()
        unique_categories = []
        for label, question, reference in categories:
            if label.lower() in seen:
                continue
            unique_categories.append((label, question, reference))
            seen.add(label.lower())

        evidence = self._ranked_evidence("buyer objections", results, limit=4)
        lines = [
            "### Short answer",
            "The top buyer objections cluster around trust, compliance control, workflow adoption, and ROI.",
            "",
            "### What buyers are really asking",
        ]
        for label, question, reference in unique_categories:
            lines.append(f"- **{label}:** {question} {reference}")

        if evidence:
            lines.extend(["", "### How to respond"])
            for item in evidence[:3]:
                lines.append(f"- {item['sentence']} {item['reference']}")

        lines.extend(
            [
                "",
                "### Recommended next step",
                "Turn these into a short objection-handling one-pager for sales, with approved language and citations for each response.",
            ]
        )
        return "\n".join(lines)

    def _template_artifact(self, title: str, instructions: str, results: list[SearchResult]) -> str:
        sections = [line.strip("- ") for line in instructions.splitlines() if line.strip()]
        evidence = self._ranked_evidence(f"{title} {instructions}", results, limit=max(10, len(sections)))
        output = [f"# {title}", "", "A source-grounded draft built from the indexed GTM workspace.", ""]
        for offset, section in enumerate(sections[:10]):
            item = evidence[offset % len(evidence)] if evidence else None
            section_copy = (
                f"- {item['sentence']} {item['reference']}"
                if item
                else "- No strong source-backed point found for this section."
            )
            output.extend([f"## {section}", section_copy, ""])
        output.append("## Review Notes")
        output.append(
            "This draft is generated without an LLM API key, so it stays conservative and source-led. "
            "Review the citations before using it as final client-facing copy."
        )
        return "\n".join(output)

    def _context(self, results: list[SearchResult]) -> str:
        parts = []
        for index, result in enumerate(results, start=1):
            chunk = result.chunk
            parts.append(
                f"[{index}] {chunk.source_file} | {chunk.source_kind} | {chunk.review_status} | {chunk.category}\n{chunk.content}"
            )
        return "\n\n".join(parts)

    def _sources(self, results: list[SearchResult]) -> list[dict]:
        sources = []
        for index, result in enumerate(results, start=1):
            citation = result.chunk.citation()
            citation.update({"reference": f"[{index}]", "score": result.score, "content": result.chunk.content})
            sources.append(citation)
        return sources

    @staticmethod
    def _first_sentence(text: str) -> str:
        clean = " ".join(RAGGenerator._clean_source_text(text).split())
        for marker in [". ", "\n"]:
            if marker in clean:
                return clean.split(marker, 1)[0].strip() + "."
        return clean[:280].strip()

    def _ranked_evidence(self, query: str, results: list[SearchResult], limit: int) -> list[dict]:
        query_terms = self._terms(query)
        evidence = []
        for index, result in enumerate(results, start=1):
            for sentence in self._business_sentences(result.chunk.content):
                terms = self._terms(sentence)
                overlap = len(query_terms & terms)
                score = overlap + self._topic_boost(query_terms, sentence) + min(len(sentence), 220) / 1000
                evidence.append(
                    {
                        "sentence": sentence,
                        "reference": f"[{index}]",
                        "source_file": result.chunk.source_file,
                        "score": score,
                    }
                )
        evidence.sort(key=lambda item: item["score"], reverse=True)

        selected = []
        seen = set()
        for item in evidence:
            normalized = item["sentence"].lower()
            if normalized in seen:
                continue
            selected.append(item)
            seen.add(normalized)
            if len(selected) >= limit:
                break
        return selected

    @staticmethod
    def _clean_source_text(text: str) -> str:
        return " ".join(RAGGenerator._clean_paragraphs(text))

    @staticmethod
    def _clean_paragraphs(text: str) -> list[str]:
        paragraphs = []
        current = []
        cleaned_lines = []
        skip_prefixes = (
            "source metadata",
            "source kind:",
            "review status:",
            "category:",
            "owner:",
            "last updated:",
            "file size:",
        )
        section_labels = {
            "summary",
            "details",
            "objection framework",
            "what it really means",
            "best response",
            "follow-up questions",
            "proof points",
            "source support",
            "review notes",
        }

        def flush() -> None:
            if current:
                paragraph = " ".join(current).strip()
                if paragraph:
                    paragraphs.append(paragraph)
                current.clear()

        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                flush()
                continue
            if line.startswith("#"):
                flush()
                continue
            is_bullet = line.startswith(("-", "*"))
            line = line.lstrip("-* ").strip()
            if any(line.lower().startswith(prefix) for prefix in skip_prefixes):
                flush()
                continue
            if line.lower() in section_labels:
                flush()
                continue
            if line.endswith(":") and len(line) < 90:
                flush()
                continue
            if is_bullet:
                flush()
                cleaned = RAGGenerator._polish_sentence(line)
                if cleaned:
                    paragraphs.append(cleaned)
                continue
            current.append(line)
        flush()
        for paragraph in paragraphs:
            cleaned = RAGGenerator._polish_sentence(paragraph)
            if cleaned:
                cleaned_lines.append(cleaned)
        return cleaned_lines

    @classmethod
    def _business_sentences(cls, text: str) -> list[str]:
        fragments = []
        for paragraph in cls._clean_paragraphs(text):
            fragments.extend(re.split(r"(?<=[.!?])\s+|;\s+", paragraph))
        sentences = []
        for fragment in fragments:
            sentence = cls._polish_sentence(fragment)
            if not sentence:
                continue
            sentence = sentence.lstrip(":,; ").strip()
            first_word = sentence.split(" ", 1)[0] if sentence else ""
            if len(first_word) <= 2 and first_word.islower():
                continue
            if len(sentence) < 35:
                continue
            if len(sentence) > 260:
                sentence = sentence[:257].rsplit(" ", 1)[0].rstrip(",;:") + "..."
            if sentence.endswith(('"', "”")) and len(sentence) > 1 and sentence[-2] in ".!?":
                pass
            elif not sentence.endswith((".", "!", "?")):
                sentence += "."
            sentences.append(sentence)
        return sentences

    @staticmethod
    def _polish_sentence(text: str) -> str:
        sentence = " ".join(text.split()).strip(" -")
        sentence = re.sub(r"^Objection:\s*[\"“](.*?)[\"”]\s*", r'Buyer objection: "\1." ', sentence)
        sentence = sentence.replace(" What It Really Means ", " ")
        sentence = sentence.replace(" Best Response ", " ")
        sentence = sentence.replace(" Follow-Up Questions ", " ")
        sentence = sentence.replace(" Proof Points ", " ")
        sentence = re.sub(r"\s+", " ", sentence).strip()
        sentence = re.sub(r'^[\"“](.*?)[\"”]$', r"\1", sentence)
        return sentence

    @staticmethod
    def _topic_boost(query_terms: set[str], sentence: str) -> float:
        lower = sentence.lower()
        boost = 0.0
        topic_terms = {
            "pricing": {"$", "price", "pricing", "pilot", "starter", "growth", "enterprise", "annual", "monthly", "month", "offer", "packaging"},
            "objection": {"objection", "worried", "concern", "lacks", "anxiety", "block", "trust", "adoption", "roi"},
            "objections": {"objection", "worried", "concern", "lacks", "anxiety", "block", "trust", "adoption", "roi"},
            "competitor": {"competitor", "against", "secureflow", "marketsignal", "comparison", "differentiated"},
            "compliance": {"compliance", "review", "approval", "approved", "restricted", "citations", "source"},
            "sales": {"sales", "seller", "enablement", "buyer", "discovery", "pipeline", "pilot"},
            "positioning": {"positioning", "message", "claim", "target", "buyer", "market", "wedge"},
        }
        for term in query_terms:
            for marker in topic_terms.get(term, set()):
                if marker in lower:
                    boost += 0.75
        if "$" in sentence and {"pricing", "price", "sales", "pilot"} & query_terms:
            boost += 2.5
        return boost

    @staticmethod
    def _terms(text: str) -> set[str]:
        stop_words = {
            "about",
            "after",
            "against",
            "also",
            "because",
            "before",
            "being",
            "below",
            "between",
            "could",
            "from",
            "have",
            "into",
            "more",
            "should",
            "that",
            "their",
            "there",
            "these",
            "this",
            "what",
            "when",
            "where",
            "which",
            "with",
            "would",
        }
        return {
            token
            for token in re.findall(r"[a-zA-Z0-9$]+", text.lower())
            if len(token) > 2 and token not in stop_words
        }
