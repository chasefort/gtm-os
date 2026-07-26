"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SourceDoc } from "@/lib/documents";
import { type Answer, type Passage, answerToMarkdown, buildAnswer, buildLocalAnswer, chunkDocument, countChunks } from "@/lib/rag";

type Turn =
  | { id: string; role: "you"; text: string }
  | { id: string; role: "tool"; answer: Answer; pending: boolean };

type Focus = { docId: string; lineStart: number; lineEnd: number; reference: number } | null;

const OWN_QUESTIONS = [
  "What are we selling?",
  "Is anything in here inconsistent?",
  "Which claims would not survive review?",
  "What do buyers push back on?",
];

/* ------------------------------------------------------------------ helpers */

function srcLabel(index: number) {
  return `SRC ${String(index + 1).padStart(2, "0")}`;
}

function statusTone(status: string) {
  return /approved|final|signed/i.test(status) ? "pip-ok" : "pip-review";
}

/** Source files write status however they like. The rail needs one short word. */
function statusLabel(status: string) {
  if (/approved|final|signed/i.test(status)) return "Approved";
  if (/not reviewed|unreviewed/i.test(status)) return "Not reviewed";
  return "Needs review";
}

/** Splits "…the set [1] and the notes [2]." into text and citation buttons. */
function withCitations(text: string, onCite: (reference: number) => void, keyPrefix: string) {
  return text.split(/(\[\d+\])/g).map((part, index) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (!match) return <span key={`${keyPrefix}-${index}`}>{part}</span>;
    const reference = Number(match[1]);
    return (
      <button
        key={`${keyPrefix}-${index}`}
        type="button"
        className="cite"
        onClick={() => onCite(reference)}
        title={`Open source ${reference}`}
      >
        {reference}
      </button>
    );
  });
}

/* ------------------------------------------------------------------ reader */

const CONTROL_LINE = /^-\s+(Document type|Status|Functional owner|Audience|Last updated):/i;

function DocumentReader({ doc, index, focus }: { doc: SourceDoc; index: number; focus: Focus }) {
  const markRef = useRef<HTMLParagraphElement | null>(null);
  const focused = focus && focus.docId === doc.id ? focus : null;

  useEffect(() => {
    if (focused && markRef.current) {
      markRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focused, doc.id]);

  const lines = doc.content.split("\n");
  let firstMarked = true;

  return (
    <article className="paper reader-paper">
      <div className="paper-head">
        <span className="tag">{srcLabel(index)}</span>
        <span className={`pip ${statusTone(doc.status)}`} title={doc.status}>
          {statusLabel(doc.status)}
        </span>
      </div>

      <div className="reader-meta">
        <span className="reader-file">{doc.filename}</span>
        <span>{doc.owner}</span>
        <span>{doc.updated}</span>
      </div>

      <div className="paper-body reader-body">
        {lines.map((raw, position) => {
          const line = raw.trim();
          if (!line) return null;
          if (/^document control:/i.test(line) || CONTROL_LINE.test(line)) return null;

          const heading = line.match(/^(#{1,6})\s+(.+)$/);
          if (heading) {
            if (heading[1].length === 1) return null;
            return (
              <h4 className="doc-heading" key={position}>
                {heading[2]}
              </h4>
            );
          }

          const inFocus = Boolean(focused && position >= focused.lineStart && position <= focused.lineEnd);
          const isAnchor = inFocus && firstMarked;
          if (isAnchor) firstMarked = false;

          const body = line.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "");
          const bulleted = line !== body;

          return (
            <p
              className={`doc-line ${bulleted ? "doc-bullet" : ""}`}
              key={position}
              ref={isAnchor ? markRef : undefined}
            >
              {inFocus ? <span className="mark-band">{body}</span> : body}
            </p>
          );
        })}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ workspace */

export function Workspace({ sampleDocs }: { sampleDocs: SourceDoc[] }) {
  const [docs, setDocs] = useState<SourceDoc[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [focus, setFocus] = useState<Focus>(null);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);

  const threadRef = useRef<HTMLDivElement | null>(null);
  const busyRef = useRef(false);

  const passages = useMemo(() => countChunks(docs), [docs]);
  const docIndex = useMemo(() => new Map(docs.map((doc, index) => [doc.id, index])), [docs]);
  const openDoc = docs.find((doc) => doc.id === openDocId) || docs[0] || null;
  const lastAnswer = [...turns].reverse().find((turn): turn is Extract<Turn, { role: "tool" }> => turn.role === "tool");
  const questions = workspaceName === "Demo workspace" ? sampleQuestions : OWN_QUESTIONS;

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openEvidence = useCallback(
    (passage: Passage) => {
      setOpenDocId(passage.docId);
      setFocus({
        docId: passage.docId,
        lineStart: passage.lineStart,
        lineEnd: passage.lineEnd,
        reference: passage.reference,
      });
      setReaderOpen(true);
    },
    [],
  );

  function citeFrom(answer: Answer) {
    return (reference: number) => {
      const passage = answer.evidence.find((item) => item.reference === reference);
      if (passage) openEvidence(passage);
    };
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busyRef.current || !docs.length) return;

    const stamp = String(Date.now());
    const local = buildLocalAnswer(docs, text);

    setDraft("");
    setTurns((current) => [
      ...current,
      { id: `${stamp}-you`, role: "you", text },
      { id: `${stamp}-tool`, role: "tool", answer: local, pending: true },
    ]);

    busyRef.current = true;
    setBusy(true);

    const finalAnswer = await buildAnswer(docs, text);

    setTurns((current) =>
      current.map((turn) =>
        turn.id === `${stamp}-tool` && turn.role === "tool" ? { ...turn, answer: finalAnswer, pending: false } : turn,
      ),
    );
    if (finalAnswer.evidence.length) openEvidence(finalAnswer.evidence[0]);

    busyRef.current = false;
    setBusy(false);
  }

  function loadSample() {
    setDocs(sampleDocs);
    setWorkspaceName("Demo workspace");
    setOpenDocId(sampleDocs[0]?.id || null);
    setTurns([]);
    setFocus(null);
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = [...fileList].filter((file) => /\.(md|txt|markdown)$/i.test(file.name));
    if (!files.length) {
      setNotice("Markdown and text files only for now.");
      return;
    }

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = String(reader.result || "");
        if (!content.trim()) return;
        const doc: SourceDoc = {
          id: `file-${file.name}-${Date.now()}`,
          title: content.match(/^#\s+(.+)$/m)?.[1] || file.name.replace(/\.[^.]+$/, ""),
          filename: file.name,
          documentType: "Uploaded file",
          status: "Not reviewed",
          owner: "You",
          updated: "This session",
          content,
          origin: "added",
        };
        setDocs((current) => {
          const next = [...current, doc];
          setOpenDocId((open) => open ?? doc.id);
          return next;
        });
      };
      reader.readAsText(file);
    });

    if (!workspaceName) setWorkspaceName("Your workspace");
    setNotice(`Added ${files.length} file${files.length > 1 ? "s" : ""}.`);
  }

  function addPasted() {
    const content = pasted.trim();
    if (!content) return;
    const title = content.match(/^#\s+(.+)$/m)?.[1] || `Pasted note ${docs.length + 1}`;
    const doc: SourceDoc = {
      id: `paste-${Date.now()}`,
      title,
      filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.md`,
      documentType: "Pasted text",
      status: "Not reviewed",
      owner: "You",
      updated: "This session",
      content: content.startsWith("#") ? content : `# ${title}\n\n${content}`,
      origin: "added",
    };
    setDocs((current) => [...current, doc]);
    setOpenDocId(doc.id);
    setPasted("");
    setPasteOpen(false);
    if (!workspaceName) setWorkspaceName("Your workspace");
    setNotice("Added to the workspace.");
  }

  function reset() {
    setDocs([]);
    setTurns([]);
    setWorkspaceName("");
    setFocus(null);
    setOpenDocId(null);
    setReaderOpen(false);
  }

  async function copyAnswer(answer: Answer) {
    try {
      await navigator.clipboard.writeText(answerToMarkdown(answer));
      setNotice("Answer copied as Markdown.");
    } catch {
      setNotice("The browser blocked the copy. Use download instead.");
    }
  }

  function downloadAnswer(answer: Answer) {
    const blob = new Blob([answerToMarkdown(answer)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "gtm-os-answer.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /* ----------------------------------------------------- empty state */

  if (!docs.length) {
    return (
      <div className="start">
        <div className="start-card">
          <span className="tag tag-cobalt">Nothing loaded yet</span>
          <h1 className="h2">Give it something to read.</h1>
          <p className="prose">
            Everything happens in this browser tab. Nothing is stored, and there is no account. Start with the demo
            set if you just want to see how it behaves.
          </p>

          <div className="start-actions">
            <button type="button" className="btn btn-primary" onClick={loadSample}>
              Load demo data
            </button>
            <label className="btn">
              Add your own files
              <input
                type="file"
                multiple
                accept=".md,.txt,.markdown,text/markdown,text/plain"
                onChange={(event) => addFiles(event.target.files)}
              />
            </label>
            <button type="button" className="btn btn-quiet" onClick={() => setPasteOpen((open) => !open)}>
              Paste text instead
            </button>
          </div>

          {pasteOpen ? (
            <div className="paste">
              <label className="tag" htmlFor="start-paste">
                Paste a memo, call notes, anything
              </label>
              <textarea
                id="start-paste"
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                placeholder="Paste here. Markdown headings help it split the text into cleaner passages."
              />
              <button type="button" className="btn btn-sm" onClick={addPasted} disabled={!pasted.trim()}>
                Add to workspace
              </button>
            </div>
          ) : null}

          <p className="start-foot">
            The demo set is {sampleDocs.length} documents from a made-up software company. They contradict each other
            on purpose, so there is something to find.
          </p>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------- loaded */

  return (
    <div className={`tool ${readerOpen ? "reader-open" : ""}`}>
      {/* ---------------- sources rail ---------------- */}
      <aside className="rail">
        <div className="pane-head">
          <span className="tag">Sources</span>
          <span className="tag num">
            {docs.length} · {passages} passages
          </span>
        </div>

        <div className="rail-list">
          {docs.map((doc, index) => {
            const active = openDoc?.id === doc.id;
            return (
              <button
                type="button"
                key={doc.id}
                className={`src ${active ? "src-active" : ""}`}
                onClick={() => {
                  setOpenDocId(doc.id);
                  setFocus(null);
                  setReaderOpen(true);
                }}
              >
                <span className="tag src-tag">{srcLabel(index)}</span>
                <span className="src-title">{doc.title}</span>
                <span className="src-meta">
                  {doc.documentType} · <span className="num">{chunkDocument(doc).length}</span> passages
                </span>
                <span className={`pip ${statusTone(doc.status)}`} title={doc.status}>
                  {statusLabel(doc.status)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="rail-foot">
          {pasteOpen ? (
            <div className="paste">
              <textarea
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                placeholder="Paste a memo, call notes, competitor research…"
              />
              <div className="paste-actions">
                <button type="button" className="btn btn-sm" onClick={addPasted} disabled={!pasted.trim()}>
                  Add
                </button>
                <button type="button" className="btn btn-sm btn-quiet" onClick={() => setPasteOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="rail-actions">
              <label className="btn btn-sm">
                Add files
                <input
                  type="file"
                  multiple
                  accept=".md,.txt,.markdown,text/markdown,text/plain"
                  onChange={(event) => addFiles(event.target.files)}
                />
              </label>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setPasteOpen(true)}>
                Paste
              </button>
              <button type="button" className="btn btn-sm btn-quiet" onClick={reset}>
                Clear
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ---------------- thread ---------------- */}
      <section className="thread-pane">
        <div className="pane-head">
          <span className="tag">{workspaceName}</span>
          <span className="tag">{lastAnswer ? `${lastAnswer.answer.mode} mode` : "Ready"}</span>
        </div>

        <div className="thread" ref={threadRef}>
          {!turns.length ? (
            <div className="thread-empty">
              <p className="prose">Ask it anything the documents might cover. These work well on this set:</p>
              <div className="prompts">
                {questions.map((question) => (
                  <button type="button" key={question} className="prompt" onClick={() => ask(question)}>
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {turns.map((turn) =>
            turn.role === "you" ? (
              <div className="said" key={turn.id}>
                <span className="tag">You asked</span>
                <p>{turn.text}</p>
              </div>
            ) : (
              <article className={`answer ${turn.pending ? "answer-pending" : ""}`} key={turn.id}>
                <div className="answer-head">
                  <span className="tag tag-cobalt">GTM OS</span>
                  <span className="answer-meta">
                    <span className={`pip ${turn.answer.confidence === "Well supported" ? "pip-ok" : "pip-review"}`}>
                      {turn.answer.confidence}
                    </span>
                    <span className="tag num">
                      {turn.answer.passageCount} passages · {turn.answer.docCount} docs
                    </span>
                  </span>
                </div>

                <p className="answer-summary">{withCitations(turn.answer.summary, citeFrom(turn.answer), turn.id)}</p>

                {turn.answer.points.length ? (
                  <ul className="answer-points">
                    {turn.answer.points.map((point, index) => (
                      <li key={`${turn.id}-p${index}`}>
                        <span>{withCitations(point, citeFrom(turn.answer), `${turn.id}-p${index}`)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {turn.answer.watchOut ? (
                  <div className="watch">
                    <span className="tag">Watch out</span>
                    <p>{withCitations(turn.answer.watchOut, citeFrom(turn.answer), `${turn.id}-w`)}</p>
                  </div>
                ) : null}

                <div className="next">
                  <span className="tag">Do this next</span>
                  <p>{turn.answer.nextStep}</p>
                </div>

                {turn.answer.evidence.length ? (
                  <div className="sources-strip">
                    <span className="tag">Sources</span>
                    <div className="chips">
                      {turn.answer.evidence.map((passage) => (
                        <button
                          type="button"
                          key={`${turn.id}-${passage.reference}`}
                          className="chip"
                          onClick={() => openEvidence(passage)}
                          title={`${passage.docTitle} — ${passage.heading}`}
                        >
                          <span className="cite">{passage.reference}</span>
                          {passage.heading}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {!turn.pending ? (
                  <div className="answer-actions">
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => copyAnswer(turn.answer)}>
                      Copy
                    </button>
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => downloadAnswer(turn.answer)}>
                      Download
                    </button>
                  </div>
                ) : (
                  <p className="pending-note">Checking whether a model is configured…</p>
                )}
              </article>
            ),
          )}
        </div>

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(draft);
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(draft);
              }
            }}
            placeholder="Ask about pricing, positioning, objections, risky claims…"
            rows={2}
          />
          <div className="composer-foot">
            <span className="composer-hint">Enter to send. Shift and Enter for a new line.</span>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !draft.trim()}>
              {busy ? "Reading…" : "Ask"}
            </button>
          </div>
        </form>
      </section>

      {/* ---------------- reader ---------------- */}
      <aside className="reader">
        <div className="pane-head">
          <span className="tag">
            {focus ? `Source ${focus.reference}` : "Source"}
          </span>
          <button type="button" className="btn btn-sm btn-quiet reader-close" onClick={() => setReaderOpen(false)}>
            Close
          </button>
        </div>

        <div className="reader-scroll">
          {openDoc ? (
            <DocumentReader doc={openDoc} index={docIndex.get(openDoc.id) ?? 0} focus={focus} />
          ) : (
            <p className="prose">Pick a source to read it here.</p>
          )}
        </div>
      </aside>

      {notice ? <p className="notice">{notice}</p> : null}
    </div>
  );
}

/** Questions tuned to the demo set. Replaced by generic ones for your own files. */
const sampleQuestions = [
  "Is our pricing consistent?",
  "Who are we selling to, and do the docs agree?",
  "Which claims would not survive review?",
  "What do buyers push back on?",
];
