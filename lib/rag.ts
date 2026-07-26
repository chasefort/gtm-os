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
  mode: "Retrieval" | "Model";
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

const HAS_MONEY = /\$\s?\d/;

const ABSOLUTE_CLAIMS = [
  "guarantee", "guaranteed", "guarantees", "100%", "fully automated", "eliminates", "never fails",
  "always compliant", "risk-free", "zero risk", "ensures compliance", "replaces legal", "instantly approved",
];

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
    mode: "Retrieval",
    evidence: [],
  };
}

export function buildLocalAnswer(docs: SourceDoc[], query: string): Answer {
  const evidence = retrieve(docs, query, 6);
  if (!evidence.length) return emptyAnswer(query);

  const docTitles = [...new Set(evidence.map((passage) => passage.docTitle))];

  return {
    query,
    summary: `I found ${evidence.length} related passages, but retrieval alone cannot answer this question reliably.`,
    points: [],
    watchOut: "The passages may share words with the question without supporting a useful conclusion.",
    nextStep: "Configure the model step to turn these passages into a cited answer.",
    confidence: "Thin",
    passageCount: evidence.length,
    docCount: docTitles.length,
    mode: "Retrieval",
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
      confidence?: Confidence;
    };
    if (!data.summary) return local;
    return {
      ...local,
      summary: data.summary,
      points: data.points?.length ? data.points : local.points,
      watchOut: data.watchOut ?? local.watchOut,
      nextStep: data.nextStep || local.nextStep,
      confidence:
        data.confidence === "Well supported" ||
        data.confidence === "Partly supported" ||
        data.confidence === "Thin"
          ? data.confidence
          : "Thin",
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
