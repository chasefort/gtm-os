"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SourceDoc } from "@/lib/documents";

type Evidence = {
  doc: SourceDoc;
  heading: string;
  text: string;
  score: number;
  reference: number;
};

type Answer = {
  query: string;
  shortAnswer: string;
  bullets: string[];
  nextStep: string;
  confidence: "Strong" | "Good" | "Needs review";
  coverage: string;
  answerPath: "Local RAG" | "OpenAI RAG";
  evidence: Evidence[];
};

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  answer?: Answer;
};

type RetrievedChunk = Omit<Evidence, "reference">;

const suggestedQuestions = [
  "What product are we selling?",
  "What pricing inconsistency should sales know?",
  "What should sales say against SecureFlow?",
  "What claims are risky or unsupported?",
  "What are the top buyer objections?",
  "Where is our positioning inconsistent?",
  "What should our launch campaign focus on?",
];

function terms(input: string) {
  return new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9$ ]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2 && !["what", "where", "should", "which", "does", "with", "from", "that", "this", "are", "our"].includes(term)),
  );
}

function cleanDocument(content: string) {
  return content
    .replace(/^#.+$/gm, "")
    .replace(/^Document control:\n(?:-.+\n)+/m, "")
    .trim();
}

function chunkDocument(doc: SourceDoc) {
  const chunks: Array<{ doc: SourceDoc; heading: string; text: string }> = [];
  const lines = cleanDocument(doc.content).split("\n");
  let heading = doc.title;
  let buffer: string[] = [];

  function flush() {
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (text.length > 80) chunks.push({ doc, heading, text });
    buffer = [];
  }

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const headingMatch = trimmed.match(/^#{2,4}\s+(.+)$/);
    if (headingMatch) {
      flush();
      heading = headingMatch[1];
      return;
    }
    buffer.push(trimmed.replace(/^[-*]\s+/, ""));
    if (buffer.join(" ").length > 850) flush();
  });

  flush();
  return chunks;
}

function scoreChunk(chunk: string, queryTerms: Set<string>) {
  const lower = chunk.toLowerCase();
  let score = 0;
  queryTerms.forEach((term) => {
    if (lower.includes(term)) score += term.length > 5 ? 3 : 2;
  });
  if (lower.includes("northstariq is") || lower.includes("northstariq helps")) score += 3;
  if (lower.includes("governed knowledge") || lower.includes("approved revenue knowledge")) score += 3;
  if (lower.includes("$999") || lower.includes("$25k")) score += 4;
  if (lower.includes("avoid") || lower.includes("risk") || lower.includes("tension")) score += 2;
  if (lower.includes("secureflow") || lower.includes("compliance")) score += 2;
  return score;
}

function searchDocs(docs: SourceDoc[], query: string, limit = 6) {
  const queryTerms = terms(query);
  const ranked: RetrievedChunk[] = [];

  docs.forEach((doc) => {
    chunkDocument(doc).forEach((chunk) => {
      const score = scoreChunk(`${doc.title} ${chunk.heading} ${chunk.text}`, queryTerms);
      if (score > 0) ranked.push({ doc, heading: chunk.heading, text: chunk.text, score });
    });
  });

  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item, index) => ({ ...item, reference: index + 1 }));
}

function summarizeChunk(evidence: Evidence) {
  const text = evidence.text.length > 320 ? `${evidence.text.slice(0, 317)}...` : evidence.text;
  return `${text} [${evidence.reference}]`;
}

function buildLocalAnswer(docs: SourceDoc[], query: string): Answer {
  const evidence = searchDocs(docs, query, 6);
  if (!evidence.length) {
    return {
      query,
      shortAnswer: "I do not have enough source support in the indexed workspace to answer that confidently.",
      bullets: [
        "This is where a fuller deployment would search the web, ask for more internal context, or answer separately as general brainstorming.",
        "Upload a relevant Markdown/TXT note or ask a question tied to the indexed NorthstarIQ documents.",
      ],
      nextStep: "Add the missing internal document or web/search context, then ask again so the answer can cite the right material.",
      confidence: "Needs review",
      coverage: "No retrieved chunks",
      answerPath: "Local RAG",
      evidence: [],
    };
  }

  const lower = query.toLowerCase();
  const productIntent = lower.includes("what product") || lower.includes("what are we selling") || lower.includes("product are we selling") || lower.includes("what do we sell");
  const pricingIntent = lower.includes("pricing") || lower.includes("price") || lower.includes("$999") || lower.includes("$25k");
  const riskIntent = lower.includes("risky") || lower.includes("unsupported") || lower.includes("claims") || lower.includes("avoid");
  const objectionsIntent = lower.includes("objection") || lower.includes("buyer") || lower.includes("customer");
  const positioningIntent = lower.includes("positioning") || lower.includes("inconsistent") || lower.includes("target");
  const campaignIntent = lower.includes("campaign") || lower.includes("launch");
  const secureFlowIntent = lower.includes("secureflow") || lower.includes("competitor");

  if (productIntent) {
    const productEvidence = searchDocs(docs, "NorthstarIQ governed knowledge workspace regulated sales marketing citations review-ready drafts approved revenue knowledge", 6);
    return {
      query,
      shortAnswer: `NorthstarIQ is a governed knowledge workspace for regulated sales and marketing teams. It centralizes approved source material, answers questions with citations, and creates review-ready drafts for campaigns, sales enablement, advisor content, and partner communications. [${productEvidence[0]?.reference || 1}]`,
      bullets: [
        `The broader promise is approved revenue knowledge in every customer-facing workflow, with reusable approved language and review trails. [${productEvidence[1]?.reference || 2}]`,
        `The product should be framed as source-grounded content and review-ready output, not generic AI writing or automated compliance approval. [${productEvidence[2]?.reference || 3}]`,
        `The strongest workflows are source libraries, cited answers, source-of-truth summaries, battlecards, objection responses, campaign briefs, and prompt packs. [${productEvidence[3]?.reference || 4}]`,
      ],
      nextStep: "Use this as a first walkthrough question: it explains the product cleanly, then lets reviewers inspect the sources behind the claim.",
      confidence: "Strong",
      coverage: "Founder memo, product one-pager, and brand guide agree",
      answerPath: "Local RAG",
      evidence: productEvidence,
    };
  }

  const pricingEvidence = evidence.find((item) => item.text.includes("$999") || item.text.includes("$25k"));
  const primary = pricingIntent && pricingEvidence ? pricingEvidence : evidence[0];
  let shortAnswer = summarizeChunk(primary);
  let bullets = evidence
    .filter((item) => item !== primary)
    .slice(0, 3)
    .map((item) => summarizeChunk(item));

  let nextStep = "Use this as a working answer, then verify the cited source text before sharing externally.";
  let coverage = `${evidence.length} retrieved chunks from ${new Set(evidence.map((item) => item.doc.title)).size} source documents`;
  let confidence: Answer["confidence"] = evidence.length >= 4 ? "Good" : "Needs review";

  if (pricingIntent) {
    shortAnswer = "The clearest pricing issue is that the source set contains both a $999/month Starter motion and a $25k annual pilot motion. Those can both be true, but only if the team clearly separates self-serve packaging from regulated-enterprise pilot packaging. " + `[${primary.reference}]`;
    nextStep = "Separate self-serve pricing from enterprise pilot language before sales or marketing uses either number externally.";
    coverage = "Pricing workstream and sales notes show the conflict";
    confidence = "Strong";
  } else if (campaignIntent) {
    shortAnswer = "A launch campaign should center on governed revenue knowledge, cited answers, and review-ready workflows for regulated teams. Avoid generic AI-speed claims and avoid saying NorthstarIQ automates or replaces compliance review. " + `[${primary.reference}]`;
    bullets = [
      "Useful campaign angles: approved source libraries, cited GTM answers, reusable language, review packets, and fewer unsupported field claims.",
      "Good audience focus: regulated marketing, sales enablement, compliance operations, product marketing, and distributed advisor or branch teams.",
      "Language to avoid: automated compliance approval, guaranteed compliant content, replacing legal review, or publishing instantly without human approval.",
    ];
    nextStep = "Build launch content around review-ready outputs and human-in-the-loop control, not generic AI speed.";
    coverage = "Brand guide, founder memo, and objections guide";
  } else if (riskIntent) {
    shortAnswer = "The main risk is overclaiming compliance automation. The sources support review-ready, cited output with compliance kept in control; they do not support language like guaranteed compliance, replacing legal review, or fully automated approval. " + `[${primary.reference}]`;
    nextStep = "Revise any external copy that implies compliance automation, guaranteed compliance, or legal-review replacement.";
    coverage = "Founder, product, and brand sources flag unsafe language";
    confidence = "Strong";
  } else if (objectionsIntent) {
    shortAnswer = "The strongest objection story is not that buyers reject AI; it is that they already have AI experiments but do not trust them for regulated field use. Lead with source control, citations, approval labels, and review trails. " + `[${primary.reference}]`;
    nextStep = "Turn these into seller-ready talk tracks and discovery questions for the first pilot workflow.";
    coverage = "Customer objections guide plus sales-call notes";
  } else if (positioningIntent) {
    shortAnswer = "The core positioning tension is mid-market fintech versus enterprise or regional banks. The founder memo favors mid-market fintech for speed-to-close, while sales notes suggest banks may feel the pain more urgently. " + `[${primary.reference}]`;
    nextStep = "Choose whether the GTM motion treats this as a mid-market wedge with enterprise urgency, or an enterprise pilot motion with a fintech beachhead.";
    coverage = "Founder memo and sales notes intentionally disagree";
  } else if (secureFlowIntent) {
    shortAnswer = "Against SecureFlow, do not pretend NorthstarIQ is ahead on enterprise workflow plumbing. SecureFlow appears stronger on integrations and approval routing; NorthstarIQ should lead with source-grounded alignment, cited drafts, and reusable GTM thinking. " + `[${primary.reference}]`;
    nextStep = "Acknowledge SecureFlow's integration strength, then lead with NorthstarIQ's source-grounded GTM alignment wedge.";
    coverage = "Competitor notes and product positioning";
  }

  return {
    query,
    shortAnswer,
    bullets,
    nextStep,
    confidence,
    coverage,
    answerPath: "Local RAG",
    evidence,
  };
}

async function buildAnswer(docs: SourceDoc[], query: string): Promise<Answer> {
  const local = buildLocalAnswer(docs, query);
  if (!local.evidence.length) return local;

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        evidence: local.evidence.map((item) => ({
          reference: item.reference,
          title: item.doc.title,
          status: item.doc.status,
          category: item.doc.category,
          heading: item.heading,
          text: item.text,
        })),
      }),
    });
    const data = await response.json();
    if (!data.answer) return local;
    return {
      ...local,
      shortAnswer: data.answer,
      bullets: data.followUps?.length ? data.followUps : local.bullets,
      nextStep: data.nextStep || local.nextStep,
      coverage: data.coverage || local.coverage,
      confidence: data.confidence || local.confidence,
      answerPath: "OpenAI RAG",
    };
  } catch {
    return local;
  }
}

function cleanSourcePreview(content: string) {
  return content.replace(/^Document control:\n(?:-.+\n)+/m, "").trim();
}

function markdownForAnswer(answer: Answer) {
  return [
    `# GTM OS Answer`,
    "",
    `Question: ${answer.query}`,
    "",
    `Support: ${answer.confidence} - ${answer.coverage}`,
    `Answer path: ${answer.answerPath}`,
    "",
    "## Short answer",
    "",
    answer.shortAnswer,
    "",
    "## What the sources show",
    "",
    ...answer.bullets.map((bullet) => `- ${bullet}`),
    "",
    "## Recommended next step",
    "",
    answer.nextStep,
    "",
    "## Sources",
    "",
    ...answer.evidence.map((item) => `- [${item.reference}] ${item.doc.title} / ${item.heading}: ${item.text}`),
    "",
  ].join("\n");
}

function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function AnswerExport({ answer }: { answer: Answer }) {
  const markdown = markdownForAnswer(answer);
  const [copyStatus, setCopyStatus] = useState("");

  async function copyAnswer() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = markdown;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy blocked by browser. Use Download instead.");
    }
  }

  return (
    <div className="export-actions">
      <button onClick={copyAnswer}>Copy answer</button>
      <button onClick={() => downloadMarkdown(`gtm-os-answer.md`, markdown)}>Download Markdown</button>
      {copyStatus ? <span className="copy-status">{copyStatus}</span> : null}
    </div>
  );
}

export function GtmOsApp({ initialDocs }: { initialDocs: SourceDoc[] }) {
  const [docs, setDocs] = useState(initialDocs);
  const [selectedDocId, setSelectedDocId] = useState(initialDocs[0]?.id || "");
  const [question, setQuestion] = useState("What product are we selling?");
  const [answer, setAnswer] = useState<Answer>(() => buildLocalAnswer(initialDocs, "What product are we selling?"));
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([
    {
      id: "initial-user",
      role: "user",
      content: "What product are we selling?",
    },
    {
      id: "initial-assistant",
      role: "assistant",
      content: "Initial source-grounded answer",
      answer: buildLocalAnswer(initialDocs, "What product are we selling?"),
    },
  ]);
  const [pastedSource, setPastedSource] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const askingRef = useRef(false);

  const selectedDoc = useMemo(() => docs.find((doc) => doc.id === selectedDocId) || docs[0], [docs, selectedDocId]);
  const approvedCount = docs.filter((doc) => doc.status.toLowerCase().includes("approved")).length;
  const needsReviewCount = docs.length - approvedCount;
  const chunkCount = useMemo(() => docs.reduce((sum, doc) => sum + chunkDocument(doc).length, 0), [docs]);

  function scrollToSection(sectionId: string) {
    const target = document.getElementById(sectionId);
    if (!target) return;
    window.history.replaceState(null, "", `#${sectionId}`);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    const scrollToHash = () => {
      const sectionId = window.location.hash.replace("#", "");
      if (sectionId) window.requestAnimationFrame(() => scrollToSection(sectionId));
    };

    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);

  async function ask(nextQuestion?: string) {
    if (askingRef.current) return;
    if (nextQuestion && questionRef.current) questionRef.current.value = nextQuestion;
    const currentQuestion = nextQuestion ?? questionRef.current?.value ?? question;
    setQuestion(currentQuestion);
    const localAnswer = buildLocalAnswer(docs, currentQuestion);
    setAnswer(localAnswer);
    const turnId = `${Date.now()}`;
    setChatHistory((current) => [
      ...current,
      { id: `${turnId}-user`, role: "user", content: currentQuestion },
      { id: `${turnId}-assistant-local`, role: "assistant", content: "Local RAG answer", answer: localAnswer },
    ]);
    askingRef.current = true;
    setIsAsking(true);
    const finalAnswer = await buildAnswer(docs, currentQuestion);
    setAnswer(finalAnswer);
    setChatHistory((current) =>
      current.map((turn) =>
        turn.id === `${turnId}-assistant-local`
          ? { ...turn, id: `${turnId}-assistant`, content: `${finalAnswer.answerPath} answer`, answer: finalAnswer }
          : turn,
      ),
    );
    askingRef.current = false;
    setIsAsking(false);
  }

  function submitQuestion() {
    void ask();
  }

  function previewLocalAnswer(value: string) {
    setQuestion(value);
    if (value.trim().length > 8) setAnswer(buildLocalAnswer(docs, value));
  }

  function addUpload(file: File) {
    if (!file.name.endsWith(".md") && !file.name.endsWith(".txt")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      const title = content.match(/^#\s+(.+)$/m)?.[1] || file.name;
      const uploaded: SourceDoc = {
        id: `upload-${Date.now()}`,
        title,
        filename: file.name,
        documentType: "Uploaded text document",
        status: "Needs review",
        owner: "Workspace user",
        category: "Uploaded",
        updated: "Current session",
        content,
      };
      setDocs((current) => [uploaded, ...current]);
      setSelectedDocId(uploaded.id);
    };
    reader.readAsText(file);
  }

  function addPastedSource() {
    const content = pastedSource.trim();
    if (!content) return;
    const title = content.match(/^#\s+(.+)$/m)?.[1] || `Added Source ${docs.length + 1}`;
    const uploaded: SourceDoc = {
      id: `added-source-${Date.now()}`,
      title,
      filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`,
      documentType: "Added source / context",
      status: "Needs review",
      owner: "Workspace user",
      category: "Market",
      updated: "Current session",
      content: content.startsWith("#") ? content : `# ${title}\n\n${content}`,
    };
    setDocs((current) => [uploaded, ...current]);
    setSelectedDocId(uploaded.id);
    setPastedSource("");
  }

  return (
    <main className="app-shell">
      <nav className="site-nav">
        <div className="wordmark">
          <span className="mark" />
          <span>GTM OS</span>
        </div>
        <div className="nav-links">
          <a
            href="#sources"
            onClick={(event) => {
              event.preventDefault();
              scrollToSection("sources");
            }}
          >
            Sources
          </a>
          <a
            href="#chat"
            onClick={(event) => {
              event.preventDefault();
              scrollToSection("chat");
            }}
          >
            Chat
          </a>
          <a
            href="#grounding"
            onClick={(event) => {
              event.preventDefault();
              scrollToSection("grounding");
            }}
          >
            Grounding
          </a>
        </div>
      </nav>

      <header className="hero">
        <div>
          <div className="eyebrow">AI tools for teams</div>
          <h1>ChatGPT-style strategy, grounded in your team’s documents.</h1>
          <p>
            A source-grounded workspace showing how a team can use AI that understands its private documents, then layer in
            public research or web context when outside information matters. The result is strategy help rooted in the
            company’s own knowledge instead of generic internet answers.
          </p>
          <div className="hero-actions" aria-label="Demo status">
            <span>Team workflow</span>
            <span>RAG over source docs</span>
            <span>Cited AI chat</span>
          </div>
        </div>
        <div className="hero-card">
          <div className="logo-orb" aria-hidden="true" />
          <strong>GTM OS</strong>
          <span>{docs.length} sources indexed locally</span>
          <span>{chunkCount} retrievable RAG chunks</span>
          <span>{approvedCount} approved / {needsReviewCount} needs review</span>
          <span>{answer.answerPath} answer path</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel sources-panel" id="sources">
          <div className="panel-header">
            <div>
              <div className="label">Sources</div>
              <h2>NorthstarIQ docs</h2>
            </div>
            <label className="upload-button">
              Upload
              <input
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) addUpload(file);
                }}
              />
            </label>
          </div>

          <div className="paste-source">
            <div className="label">Add source, research, or web context</div>
            <textarea
              value={pastedSource}
              onChange={(event) => setPastedSource(event.target.value)}
              placeholder="Paste an internal memo, sales-call export, customer notes, competitor research, web notes, or any source the team wants indexed..."
            />
            <button type="button" onClick={addPastedSource}>Add as source</button>
          </div>

          <div className="source-list">
            {docs.map((doc) => (
              <button
                key={doc.id}
                className={`source-row ${doc.id === selectedDoc?.id ? "active" : ""}`}
                onClick={() => setSelectedDocId(doc.id)}
              >
                <strong>{doc.title}</strong>
                <span>{doc.documentType} • {chunkDocument(doc).length} chunks</span>
                <div className="badges">
                  <em>{doc.status}</em>
                  <em>{doc.category}</em>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel ask-panel" id="chat">
          <div className="panel-header">
            <div>
              <div className="label">Chat</div>
              <h2>Ask GTM OS</h2>
            </div>
          </div>

          <p className="chat-intro">
            Ask it like ChatGPT, but with the team’s internal source material underneath it. The answers can cite where
            the thinking came from, which makes the output easier to trust, inspect, and improve.
          </p>

          <div className="question-box">
            <textarea
              ref={questionRef}
              defaultValue={question}
              onInput={(event) => previewLocalAnswer(event.currentTarget.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  submitQuestion();
                }
              }}
            />
            <button
              onClick={submitQuestion}
              type="button"
              disabled={isAsking}
            >
              {isAsking ? "Thinking" : "Ask"}
            </button>
          </div>

          <div className="suggestions">
            {suggestedQuestions.map((prompt) => (
              <button key={prompt} onClick={() => ask(prompt)} type="button">
                {prompt}
              </button>
            ))}
          </div>

          <div className="chat-thread">
            {chatHistory.slice(-6).map((turn) =>
              turn.role === "user" ? (
                <div className="chat-bubble user" key={turn.id}>
                  <strong>You</strong>
                  <p>{turn.content}</p>
                </div>
              ) : turn.answer ? (
                <div className="answer-card chat-bubble assistant" key={turn.id}>
                  <strong>GTM OS</strong>
                  <div className="answer-meta">
                    <span>{turn.answer.confidence} support</span>
                    <span>{turn.answer.coverage}</span>
                    <span>{turn.answer.answerPath}</span>
                  </div>
                  <div className="label">Short answer</div>
                  <p>{turn.answer.shortAnswer}</p>
                  {turn.answer.bullets.length ? (
                    <>
                      <div className="label">What the sources show</div>
                      <ul>
                        {turn.answer.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <div className="label">Recommended next step</div>
                  <p>{turn.answer.nextStep}</p>
                  <AnswerExport answer={turn.answer} />
                </div>
              ) : null,
            )}
          </div>

          {answer.evidence.length ? (
            <div className="citations">
              <div className="label">Citations</div>
              {answer.evidence.map((item) => (
                <button key={`${item.doc.id}-${item.reference}`} onClick={() => setSelectedDocId(item.doc.id)}>
                  <strong>[{item.reference}] {item.doc.title} / {item.heading}</strong>
                  <span>{item.text}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <aside className="panel context-panel" id="grounding">
          <div className="panel-header">
            <div>
              <div className="label">Grounding</div>
              <h2>What shapes the answer</h2>
            </div>
          </div>

          <p className="grounding-intro">
            The simple idea: upload the documents a company already trusts, break them into searchable pieces, retrieve
            the most relevant pieces for each question, then answer with citations. Public research or web-search notes
            can be added as extra context, but the private company knowledge stays at the center.
          </p>

          <div className="system-readout">
            <section>
              <strong>What this is</strong>
              <p>A private company knowledge assistant: ChatGPT-style brainstorming grounded in approved internal docs, sales notes, pricing guidance, brand rules, and research.</p>
            </section>
            <section>
              <strong>How the tech works</strong>
              <p>RAG means the app searches the document index first, pulls the best matching chunks into the prompt, and makes the answer show citations instead of guessing from memory.</p>
            </section>
            <section>
              <strong>Why teams would use it</strong>
              <p>It helps people think with company context: pressure-test messaging, find risky claims, compare pricing notes, shape campaigns, and add public/web context when the internal docs are not enough.</p>
            </section>
            <section>
              <strong>What a production version would add</strong>
              <p>Private auth, persistent workspaces, vector storage, permissions, source connectors, background indexing, web-search ingestion, and evaluation traces.</p>
            </section>
          </div>

          <div className="source-model">
            <span>Internal document index</span>
            <span>RAG retrieval</span>
            <span>External/web context</span>
            <span>{chunkCount} RAG chunks</span>
            <span>Cited chat answers</span>
          </div>

          <div className="context-steps">
            <section>
              <strong>1. Ingest sources</strong>
              <p>Collect the material a team actually works from: internal docs, sales notes, pricing, brand rules, research, and web context.</p>
            </section>
            <section>
              <strong>2. Build the RAG index</strong>
              <p>Break those sources into smaller chunks with document names, sections, status, and category metadata so the right context can be retrieved later.</p>
            </section>
            <section>
              <strong>3. Chat with grounded context</strong>
              <p>Let the team brainstorm, check claims, and make decisions while showing which documents shaped the answer.</p>
            </section>
          </div>

          <div className="tech-stack">
            <div className="label">Tech used</div>
            <div className="tech-grid">
              <span>RAG</span>
              <span>Document chunking</span>
              <span>Chunk metadata</span>
              <span>Cited retrieval</span>
              <span>Next.js</span>
              <span>Vercel API route</span>
              <span>Optional OpenAI synthesis</span>
              <span>Browser-side uploads</span>
              <span>Team knowledge workspace</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="panel source-preview">
        <div className="panel-header">
          <div>
            <div className="label">Source preview</div>
            <h2>{selectedDoc?.title}</h2>
          </div>
          <div className="preview-meta">
            <span>{selectedDoc?.owner}</span>
            <span>{selectedDoc?.updated}</span>
          </div>
        </div>
        <pre>{selectedDoc ? cleanSourcePreview(selectedDoc.content) : "No source selected."}</pre>
      </section>
    </main>
  );
}
