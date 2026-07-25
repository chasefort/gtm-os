import { NextResponse } from "next/server";

type EvidenceInput = {
  reference: number;
  title: string;
  heading: string;
  text: string;
};

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
    "You answer questions about a company using only the passages provided.",
    "Write plainly, around an eighth-grade reading level. Short words. One idea per sentence.",
    "Cite with bracket numbers that match the passages, like [2]. Never cite a number you were not given.",
    "If the passages disagree, say so and name both sides.",
    "Do not invent facts, figures, or company names that are not in the passages.",
    "Never use the words leverage, robust, seamless, streamline, unlock, or transformative.",
    "Do not use em dashes.",
    "",
    "Reply with JSON only, in this exact shape:",
    '{"summary": string, "points": string[], "watchOut": string | null, "nextStep": string}',
    "summary: two sentences at most, with citations.",
    "points: up to three short lines, each with a citation.",
    "watchOut: one line naming a contradiction or a risky claim, or null if there is none.",
    "nextStep: one line telling the reader what to do with this.",
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
    };
    return NextResponse.json({
      summary: parsed.summary || null,
      points: Array.isArray(parsed.points) ? parsed.points.slice(0, 3) : [],
      watchOut: parsed.watchOut ?? null,
      nextStep: parsed.nextStep || "",
    });
  } catch {
    return NextResponse.json({ summary: null, reason: "Model returned something unreadable." });
  }
}
