import { NextResponse } from "next/server";

type EvidenceInput = {
  reference: number;
  title: string;
  status: string;
  category: string;
  heading: string;
  text: string;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ answer: null, reason: "OPENAI_API_KEY is not configured." });
  }

  const { query, evidence } = (await request.json()) as { query?: string; evidence?: EvidenceInput[] };
  if (!query || !evidence?.length) {
    return NextResponse.json({ answer: null, reason: "Missing query or evidence." }, { status: 400 });
  }

  const context = evidence
    .slice(0, 8)
    .map((item) => {
      return [
        `[${item.reference}] ${item.title} / ${item.heading}`,
        `Status: ${item.status}`,
        `Category: ${item.category}`,
        item.text,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const prompt = [
    "You are GTM OS, a source-grounded strategy chat assistant for regulated GTM teams.",
    "Answer the user's question using the provided retrieved document chunks where applicable.",
    "Cite source-backed claims inline with bracket citations like [1] or [2].",
    "If the sources do not fully answer the question, say what the sources support and what would require more internal documents, external context, or web search.",
    "You may help brainstorm, but clearly separate source-grounded points from unsupported general reasoning.",
    "Keep the answer concise, useful, and business-readable.",
    "",
    `Question: ${query}`,
    "",
    "Retrieved chunks:",
    context,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: prompt,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ answer: null, reason: "Hosted model request failed." }, { status: 200 });
  }

  const data = await response.json();
  const answer =
    data.output_text ||
    data.output?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content || [])
      ?.map((item: { text?: string }) => item.text)
      ?.filter(Boolean)
      ?.join("\n");

  return NextResponse.json({
    answer,
    confidence: "Good",
    coverage: `${evidence.length} retrieved RAG chunks sent to hosted synthesis`,
    nextStep: "Review the cited source chunks before using the answer externally. Add internal documents, external context, or web search results when the workspace does not cover the question.",
  });
}
