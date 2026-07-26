import { NextResponse } from "next/server";

type EvidenceInput = {
  reference: number;
  title: string;
  heading: string;
  text: string;
};

type Confidence = "Well supported" | "Partly supported" | "Thin";

const CONFIDENCE = new Set<Confidence>(["Well supported", "Partly supported", "Thin"]);

function citationsAreValid(text: string, allowed: Set<number>, citationRequired = true) {
  const citations = [...text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
  return (!citationRequired || citations.length > 0) && citations.every((citation) => allowed.has(citation));
}

/**
 * Optional write-up step. The retrieved passages are already chosen in the
 * browser; this only rewrites them into an answer. With no key configured the
 * client keeps its local answer and says so in the UI.
 */
export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ summary: null, reason: "No model key configured." });

  const { query, evidence } = (await request.json()) as { query?: string; evidence?: EvidenceInput[] };
  if (!query || !evidence?.length) {
    return NextResponse.json({ summary: null, reason: "Missing question or passages." }, { status: 400 });
  }

  const context = evidence
    .slice(0, 8)
    .map((item) => `[${item.reference}] ${item.title} — ${item.heading}\n${item.text}`)
    .join("\n\n---\n\n");

  const instructions = [
    "You are the reasoning step in a retrieval-augmented question-answering system.",
    "Answer the exact question directly using only the passages provided.",
    "A passage can share words with the question and still be irrelevant. Ignore passages that do not help answer it.",
    "Do not paste passage openings together or list nearby facts without explaining the conclusion.",
    'If the evidence is too thin, say: "The loaded documents do not give enough support to answer that."',
    "Write plainly, around an eighth-grade reading level. Short words. One idea per sentence.",
    "Put a citation after every factual claim. Use only the bracket numbers provided, like [2].",
    "If the passages disagree, say so and name both sides.",
    "Do not invent facts, figures, or company names that are not in the passages.",
    "Never use the words leverage, robust, seamless, streamline, unlock, or transformative.",
    "Do not use em dashes.",
    "",
    "Reply with JSON only, in this exact shape:",
    '{"summary": string, "points": string[], "watchOut": string | null, "nextStep": string, "confidence": "Well supported" | "Partly supported" | "Thin"}',
    "summary: answer the question in two sentences at most. Include citations.",
    "points: zero to three short lines that directly support the answer. Each line needs a citation.",
    "watchOut: one cited contradiction or risk that changes the answer, or null.",
    "nextStep: one specific action justified by the answer. Do not add a citation unless it contains a factual claim.",
    'confidence: "Well supported" only when several passages directly answer the question; "Partly supported" when the answer needs a caveat; "Thin" when the documents do not answer it.',
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: `Question: ${query}\n\nPassages:\n${context}` },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ summary: null, reason: "The model request failed." });
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) return NextResponse.json({ summary: null, reason: "Empty model response." });

  try {
    const parsed = JSON.parse(raw) as {
      summary?: string;
      points?: string[];
      watchOut?: string | null;
      nextStep?: string;
      confidence?: Confidence;
    };

    const allowed = new Set(evidence.map((item) => item.reference));
    const points = Array.isArray(parsed.points) ? parsed.points.slice(0, 3) : [];
    const valid =
      Boolean(parsed.summary) &&
      citationsAreValid(parsed.summary || "", allowed) &&
      points.every((point) => citationsAreValid(point, allowed)) &&
      (!parsed.watchOut || citationsAreValid(parsed.watchOut, allowed));
    if (!valid) {
      return NextResponse.json({ summary: null, reason: "Model citations failed validation." });
    }

    return NextResponse.json({
      summary: parsed.summary,
      points,
      watchOut: parsed.watchOut ?? null,
      nextStep: parsed.nextStep || "",
      confidence: parsed.confidence && CONFIDENCE.has(parsed.confidence) ? parsed.confidence : "Thin",
    });
  } catch {
    return NextResponse.json({ summary: null, reason: "Model returned something unreadable." });
  }
}
