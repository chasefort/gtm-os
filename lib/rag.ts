import type { SourceDoc } from "./documents";

/* ------------------------------------------------------------------
   Retrieval and answer building.

   Everything here reads from whatever documents are loaded. No demo
   company, no hard-coded facts. Load your own files and it behaves the
   same way it does on the sample set.
   ------------------------------------------------------------------ */

export type Passage = {
  docId: string;
  docTitle: string;
  heading: string;
  text: string;
  lineStart: number;
  lineEnd: number;
  score: number;
  reference: number;
};

export type Confidence = "Well supported" | "Partly supported" | "Thin";

export type Answer = {
  query: string;
  summary: string;
  points: string[];
  watchOut: string | null;
  nextStep: string;
  confidence: Confidence;
  passageCount: number;
  docCount: number;
  mode: "Local" | "Model";
  evidence: Passage[];
};

const STOPWORDS = new Set([
  "the", "and", "for", "are", "was", "were", "our", "this", "that", "with", "from", "what", "which",
  "when", "where", "should", "would", "could", "does", "did", "have", "has", "had", "how", "why",
  "you", "your", "they", "them", "their", "its", "about", "into", "than", "then", "there", "here",
  "can", "will", "just", "any", "all", "not", "but", "get", "got", "who", "whom", "some", "most",
]);

function tokenize(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9$%.\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[-.]+|[-.]+$/g, ""))
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z$"'(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** First one or two sentences, capped so cards stay even. */
function lead(text: string, limit = 300) {
  const parts = sentences(text);
  let out = parts[0] || text;
  if (out.length < limit * 0.55 && parts[1]) out = `${out} ${parts[1]}`;
  return out.length > limit ? `${out.slice(0, limit - 1).trimEnd()}…` : out;
}

/* ---------------------------------- chunking ---------------------------------- */

export type Chunk = {
  heading: string;
  text: string;
  lineStart: number;
  lineEnd: number;
};

const CONTROL_BLOCK = /^document control:/i;

/**
 * Chunks by heading, keeping the source line numbers so the reader can
 * highlight the exact lines an answer used.
 */
export function chunkDocument(doc: SourceDoc): Chunk[] {
  const lines = doc.content.split("\n");
  const chunks: Chunk[] = [];

  let heading = doc.title;
  let buffer: string[] = [];
  let start = -1;
  let end = -1;
  let inControlBlock = false;

  const flush = () => {
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (text.length > 70) chunks.push({ heading, text, lineStart: start, lineEnd: end });
    buffer = [];
    start = -1;
    end = -1;
  };

  lines.forEach((raw, index) => {
    const line = raw.trim();

    if (CONTROL_BLOCK.test(line)) {
      inControlBlock = true;
      return;
    }
    if (inControlBlock) {
      if (!line || !line.startsWith("-")) inControlBlock = false;
      else return;
    }

    if (!line) return;

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flush();
      if (headingMatch[1].length > 1) heading = headingMatch[2];
      return;
    }

    if (start < 0) start = index;
    end = index;
    buffer.push(line.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, ""));
    if (buffer.join(" ").length > 780) flush();
  });

  flush();
  return chunks;
}

/* ---------------------------------- retrieval ---------------------------------- */

type Indexed = Chunk & { docId: string; docTitle: string };

function buildIndex(docs: SourceDoc[]): Indexed[] {
  return docs.flatMap((doc) =>
    chunkDocument(doc).map((chunk) => ({ ...chunk, docId: doc.id, docTitle: doc.title })),
  );
}

export function countChunks(docs: SourceDoc[]) {
  return docs.reduce((total, doc) => total + chunkDocument(doc).length, 0);
}

const K1 = 1.4;
const B = 0.72;

/**
 * BM25. The length normalisation matters here: without it a long passage that
 * happens to repeat a common word outranks the short passage that actually
 * answers the question.
 */
export function retrieve(docs: SourceDoc[], query: string, limit = 6): Passage[] {
  const index = buildIndex(docs);
  if (!index.length) return [];

  const queryTerms = [...new Set(tokenize(query))];
  if (!queryTerms.length) return [];

  const haystacks = index.map((chunk) => `${chunk.docTitle} ${chunk.heading} ${chunk.text}`.toLowerCase());
  const lengths = haystacks.map((text) => text.split(/\s+/).length);
  const averageLength = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;

  const documentFrequency = new Map<string, number>();
  queryTerms.forEach((term) => {
    documentFrequency.set(term, haystacks.filter((text) => text.includes(term)).length);
  });

  const lens = readLens(query);

  const scored = index.map((chunk, position) => {
    const haystack = haystacks[position];
    const headingText = `${chunk.docTitle} ${chunk.heading}`.toLowerCase();
    const norm = 1 - B + B * (lengths[position] / averageLength);
    let score = 0;

    queryTerms.forEach((term) => {
      const hits = documentFrequency.get(term) || 0;
      if (!hits) return;
      const frequency = haystack.split(term).length - 1;
      if (!frequency) return;
      const idf = Math.log(1 + (index.length - hits + 0.5) / (hits + 0.5));
      score += idf * ((frequency * (K1 + 1)) / (frequency + K1 * norm));
      if (headingText.includes(term)) score += idf * 0.6;
    });

    if (!score) return { chunk, score };

    // Reward adjacent query words appearing together.
    for (let i = 0; i < queryTerms.length - 1; i += 1) {
      if (haystack.includes(`${queryTerms[i]} ${queryTerms[i + 1]}`)) score += 1.2;
    }

    // Ask about money, get the passages carrying figures. Same idea for claims.
    if (lens === "numbers" && HAS_MONEY.test(chunk.text)) score *= 1.5;
    if (lens === "risk" && ABSOLUTE_CLAIMS.some((phrase) => haystack.includes(phrase))) score *= 1.4;

    return { chunk, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item, position) => ({
      docId: item.chunk.docId,
      docTitle: item.chunk.docTitle,
      heading: item.chunk.heading,
      text: item.chunk.text,
      lineStart: item.chunk.lineStart,
      lineEnd: item.chunk.lineEnd,
      score: item.score,
      reference: position + 1,
    }));
}

/* ---------------------------------- reading the evidence ---------------------------------- */

const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn)?(?:\s?(?:\/|per\s)\s?(?:mo|month|yr|year|seat|user|record))?/gi;
const HAS_MONEY = /\$\s?\d/;

const ABSOLUTE_CLAIMS = [
  "guarantee", "guaranteed", "guarantees", "100%", "fully automated", "eliminates", "never fails",
  "always compliant", "risk-free", "zero risk", "ensures compliance", "replaces legal", "instantly approved",
];

/**
 * Distinct money figures, keyed on the amount alone so "$999" and "$999/month"
 * are not counted as two different prices.
 */
function moneyFigures(passages: Passage[]) {
  const found = new Map<string, { display: string; refs: Set<number>; docs: Set<string> }>();
  passages.forEach((passage) => {
    (passage.text.match(MONEY) || []).forEach((raw) => {
      const amount = raw.match(/\$\s?[\d,.]+\s?(?:k|m|bn)?/i)?.[0] || raw;
      const key = amount.replace(/[\s,]/g, "").toLowerCase();
      const display = raw.trim();
      const entry = found.get(key);
      if (entry) {
        entry.refs.add(passage.reference);
        entry.docs.add(passage.docTitle);
        if (display.length > entry.display.length) entry.display = display;
      } else {
        found.set(key, { display, refs: new Set([passage.reference]), docs: new Set([passage.docTitle]) });
      }
    });
  });
  return found;
}

function riskyPhrases(passages: Passage[]) {
  const hits: Array<{ phrase: string; reference: number; docTitle: string }> = [];
  passages.forEach((passage) => {
    const lower = passage.text.toLowerCase();
    ABSOLUTE_CLAIMS.forEach((phrase) => {
      if (lower.includes(phrase) && !hits.some((hit) => hit.phrase === phrase)) {
        hits.push({ phrase, reference: passage.reference, docTitle: passage.docTitle });
      }
    });
  });
  return hits;
}

type Lens = "numbers" | "risk" | "conflict" | "objections" | "plan" | "general";

function readLens(query: string): Lens {
  const q = query.toLowerCase();
  if (/(pric|cost|discount|\$|budget|rate|fee|packag)/.test(q)) return "numbers";
  if (/(risk|claim|unsupported|legal|complian|safe|overclaim|avoid say)/.test(q)) return "risk";
  if (/(inconsist|conflict|disagree|contradict|misalign|position|icp|target|segment)/.test(q)) return "conflict";
  if (/(objection|pushback|competitor|against|versus|vs\b|buyer|concern)/.test(q)) return "objections";
  if (/(campaign|launch|plan|next quarter|roadmap|strategy|messag)/.test(q)) return "plan";
  return "general";
}

const NEXT_STEP: Record<Lens, string> = {
  numbers: "Confirm which figure is current with whoever owns pricing before either number goes in front of a customer.",
  risk: "Rewrite any line that promises more than the sources actually support, then get it reviewed.",
  conflict: "Pick which version is right, write it down in one place, and retire the other one.",
  objections: "Turn the strongest source lines into a talk track and test it on the next three calls.",
  plan: "Draft the plan straight from the cited lines so every claim already has a source behind it.",
  general: "Open the cited sources and check the wording before you reuse any of this externally.",
};

/* ---------------------------------- answer ---------------------------------- */

export function emptyAnswer(query: string): Answer {
  return {
    query,
    summary: "Nothing in the loaded documents covers that. The tool only answers from what you give it.",
    points: [
      "Add a document that talks about it, then ask again.",
      "Or reword the question using terms that appear in your sources.",
    ],
    watchOut: null,
    nextStep: "Load a source that covers this topic, or ask about something the current set actually discusses.",
    confidence: "Thin",
    passageCount: 0,
    docCount: 0,
    mode: "Local",
    evidence: [],
  };
}

export function buildLocalAnswer(docs: SourceDoc[], query: string): Answer {
  const evidence = retrieve(docs, query, 6);
  if (!evidence.length) return emptyAnswer(query);

  const lens = readLens(query);
  const docTitles = [...new Set(evidence.map((passage) => passage.docTitle))];
  const top = evidence[0];

  let summary = `${lead(top.text)} [${top.reference}]`;

  // When the passages carry something checkable, lead with that instead of an extract.
  if (lens === "numbers") {
    const figures = moneyFigures(evidence);
    if (figures.size > 1) {
      const cited = [...figures.values()]
        .slice(0, 3)
        .map((figure) => `${figure.display} [${[...figure.refs][0]}]`)
        .join(", ");
      summary = `The documents do not line up. ${figures.size} different figures show up across the set: ${cited}.`;
    } else if (figures.size === 1) {
      const figure = [...figures.values()][0];
      summary = `One figure shows up across the set: ${figure.display} [${[...figure.refs][0]}]. Nothing here contradicts it.`;
    }
  }

  if (lens === "risk") {
    const risky = riskyPhrases(evidence);
    if (risky.length) {
      const cited = risky.slice(0, 3).map((hit) => `"${hit.phrase}" [${hit.reference}]`).join(", ");
      summary = `${risky.length} line${risky.length > 1 ? "s" : ""} here promise${risky.length > 1 ? "" : "s"} more than the sources back up: ${cited}.`;
    }
  }

  // One point per document, so the answer spans the set instead of repeating one file.
  const seen = new Set([top.docId]);
  const points: string[] = [];
  evidence.forEach((passage) => {
    if (seen.has(passage.docId) || points.length >= 3) return;
    seen.add(passage.docId);
    points.push(`${lead(passage.text, 220)} [${passage.reference}]`);
  });
  if (points.length < 2) {
    evidence.slice(1).forEach((passage) => {
      if (points.length >= 2) return;
      const line = `${lead(passage.text, 220)} [${passage.reference}]`;
      if (!points.includes(line) && line !== summary) points.push(line);
    });
  }

  let watchOut: string | null = null;

  if (lens === "numbers") {
    const figures = moneyFigures(evidence);
    const split = [...figures.values()].filter((figure) => figure.docs.size > 0);
    if (figures.size > 1) {
      const where = [...new Set(split.flatMap((figure) => [...figure.docs]))].slice(0, 2).join(" and ");
      watchOut = `These figures come from different places, including ${where}. Check which one is current before quoting either.`;
    }
  }

  if (!watchOut && (lens === "risk" || lens === "plan")) {
    const risky = riskyPhrases(evidence);
    if (risky.length) {
      const list = risky.slice(0, 3).map((hit) => `"${hit.phrase}" [${hit.reference}]`).join(", ");
      watchOut = `These sources use absolute wording: ${list}. That is the kind of line that gets pulled apart in review.`;
    }
  }

  if (!watchOut && lens === "conflict" && docTitles.length > 1) {
    watchOut = `${docTitles.slice(0, 2).join(" and ")} both speak to this and they do not say the same thing. Read them side by side.`;
  }

  const spread = top.score / (evidence[evidence.length - 1]?.score || top.score);
  const confidence: Confidence =
    evidence.length >= 4 && docTitles.length >= 3 && spread < 6
      ? "Well supported"
      : evidence.length >= 3 && docTitles.length >= 2
        ? "Partly supported"
        : "Thin";

  return {
    query,
    summary,
    points,
    watchOut,
    nextStep: NEXT_STEP[lens],
    confidence,
    passageCount: evidence.length,
    docCount: docTitles.length,
    mode: "Local",
    evidence,
  };
}

export async function buildAnswer(docs: SourceDoc[], query: string): Promise<Answer> {
  const local = buildLocalAnswer(docs, query);
  if (!local.evidence.length) return local;

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        evidence: local.evidence.map((passage) => ({
          reference: passage.reference,
          title: passage.docTitle,
          heading: passage.heading,
          text: passage.text,
        })),
      }),
    });
    if (!response.ok) return local;
    const data = (await response.json()) as {
      summary?: string;
      points?: string[];
      watchOut?: string | null;
      nextStep?: string;
    };
    if (!data.summary) return local;
    return {
      ...local,
      summary: data.summary,
      points: data.points?.length ? data.points : local.points,
      watchOut: data.watchOut ?? local.watchOut,
      nextStep: data.nextStep || local.nextStep,
      mode: "Model",
    };
  } catch {
    return local;
  }
}

/* ---------------------------------- export ---------------------------------- */

export function answerToMarkdown(answer: Answer) {
  return [
    `# ${answer.query}`,
    "",
    `${answer.confidence} · ${answer.passageCount} passages from ${answer.docCount} documents · ${answer.mode} mode`,
    "",
    answer.summary,
    "",
    ...(answer.points.length ? ["## Also in the sources", "", ...answer.points.map((point) => `- ${point}`), ""] : []),
    ...(answer.watchOut ? ["## Watch out", "", answer.watchOut, ""] : []),
    "## Next step",
    "",
    answer.nextStep,
    "",
    "## Sources",
    "",
    ...answer.evidence.map((passage) => `[${passage.reference}] ${passage.docTitle} — ${passage.heading}\n${passage.text}\n`),
  ].join("\n");
}
