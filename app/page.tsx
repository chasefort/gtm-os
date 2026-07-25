import Link from "next/link";
import { Masthead } from "./components/masthead";
import { Choreography } from "./components/choreography";
import { loadSampleDocs } from "@/lib/documents";
import { countChunks } from "@/lib/rag";
import "./home.css";

const failures = [
  "Two prices live in two docs, and the newer one is the wrong one.",
  "A number in the deck that nobody can point to a source for.",
  "Marketing writes for one buyer while sales closes another.",
  "The competitor answer sits in one rep's head.",
];

const steps = [
  {
    tag: "Step 01",
    title: "Load the documents",
    body: "Markdown or text files, or paste text straight in. Your files stay in the browser. There is no account and nothing to set up.",
  },
  {
    tag: "Step 02",
    title: "It splits them into passages",
    body: "Each passage keeps its file name, its section heading and its line numbers. That is what makes an answer traceable later.",
  },
  {
    tag: "Step 03",
    title: "Ask in plain English",
    body: "It finds the passages that match your question, writes the answer from those, and numbers every one it used.",
  },
  {
    tag: "Step 04",
    title: "Check the receipt",
    body: "Click a number. The source document opens beside the answer with the exact lines marked. If the wording is off, you see it in a second.",
  },
];

const uses = [
  {
    tag: "Use 01",
    question: "Is our pricing consistent?",
    body: "Finds every figure across the set and flags it when two of them disagree.",
    wide: true,
  },
  {
    tag: "Use 02",
    question: "Which claims would not survive review?",
    body: "Pulls the absolute wording. Guaranteed, fully automated, zero risk.",
    wide: false,
  },
  {
    tag: "Use 03",
    question: "Who are we selling to?",
    body: "Shows you where the memo and the call notes describe a different buyer.",
    wide: false,
  },
  {
    tag: "Use 04",
    question: "What do buyers push back on?",
    body: "Reads the objection notes and gives you the lines back with sources attached.",
    wide: true,
  },
];

export default function HomePage() {
  const docs = loadSampleDocs();
  const passages = countChunks(docs);

  return (
    <>
      <Choreography />
      <Masthead current="home" />

      <main>
        {/* ---------------------------------------------- hero */}
        <section className="hero shell">
          <div className="hero-copy">
            <p className="tag tag-cobalt">A working demo, not a mockup</p>
            <h1 className="display">
              Ask your company docs.
              <br />
              Get the line it came from.
            </h1>
            <p className="lede">
              Pricing notes, call notes, positioning memos, competitor research. Load them in, ask a question the way
              you would ask a coworker, and every answer shows the source text underneath it.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/tool">
                Open the tool
              </Link>
              <a className="btn" href="#how">
                See how it works
              </a>
            </div>
            <p className="hero-note">
              No login. Runs in your browser. Load the demo set in one click or bring your own files.
            </p>
          </div>

          <div className="hero-proof" aria-label="Example of an answer and its source">
            <div className="proof-ask">
              <span className="tag">You asked</span>
              <p>Is our pricing consistent?</p>
            </div>

            <div className="proof-answer">
              <span className="tag tag-cobalt">GTM OS</span>
              <p>
                No. Two figures show up across the set. Starter is listed at $999 a month, and the sales notes describe
                a $25k annual pilot for enterprise banks. <span className="cite">1</span>
              </p>
              <p className="proof-watch">
                Worth a look before either number goes in front of a customer.
              </p>
            </div>

            <div className="paper proof-paper">
              <div className="paper-head">
                <span className="tag">SRC 06 · pricing-packaging.md</span>
                <span className="pip pip-review">Needs review</span>
              </div>
              <div className="paper-body">
                <p className="paper-heading">Pricing Summary</p>
                <p>
                  The current pricing workstream contains an unresolved tension.{" "}
                  <span className="mark-band" data-sweep>
                    The early packaging model includes a $999/month Starter plan for mid-market fintech teams, but
                    recent sales notes suggest enterprise banks expect a scoped annual pilot with a $25k minimum.
                  </span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="shell">
          <div className="ticks" aria-hidden="true" />
        </div>

        {/* ---------------------------------------------- problem */}
        <section className="band shell">
          <div className="band-head">
            <span className="tag" data-reveal>
              01 · The problem
            </span>
            <h2 className="h2" data-reveal>
              The answer already exists. It is sitting in a doc nobody can find.
            </h2>
          </div>
          <div className="band-body">
            <p className="prose" data-reveal>
              Every revenue team writes the facts down somewhere. A pricing doc from March. Call notes from Tuesday. A
              positioning memo the founder wrote that three people read. When a rep needs the answer in the next ten
              minutes, they ask in Slack, guess, or reuse a deck from last quarter.
            </p>
            <ul className="failures" data-reveal>
              {failures.map((line) => (
                <li key={line}>
                  <span className="failure-tick" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------- how */}
        <section className="band shell" id="how">
          <div className="band-head">
            <span className="tag" data-reveal>
              02 · How it works
            </span>
            <h2 className="h2" data-reveal>
              Four steps. About a minute to the first answer.
            </h2>
          </div>

          <ol className="steps">
            {steps.map((step) => (
              <li className="step" key={step.tag} data-reveal>
                <span className="tag step-tag">{step.tag}</span>
                <div className="step-copy">
                  <h3 className="h3">{step.title}</h3>
                  <p className="prose">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------- counts */}
        <section className="counts shell" aria-label="What ships in the demo">
          <hr className="rule" data-draw />
          <dl className="count-row">
            <div>
              <dt className="tag">Demo documents</dt>
              <dd className="num" data-count={docs.length}>
                {docs.length}
              </dd>
            </div>
            <div>
              <dt className="tag">Indexed passages</dt>
              <dd className="num" data-count={passages}>
                {passages}
              </dd>
            </div>
            <div>
              <dt className="tag">Accounts to create</dt>
              <dd className="num" data-count={0}>
                0
              </dd>
            </div>
            <div>
              <dt className="tag">Clicks to load it</dt>
              <dd className="num" data-count={1}>
                1
              </dd>
            </div>
          </dl>
          <hr className="rule" data-draw />
        </section>

        {/* ---------------------------------------------- uses */}
        <section className="band shell" id="ask">
          <div className="band-head">
            <span className="tag" data-reveal>
              03 · What to ask it
            </span>
            <h2 className="h2" data-reveal>
              The questions that usually take three Slack threads.
            </h2>
          </div>

          <div className="uses">
            {uses.map((use) => (
              <article className={`use ${use.wide ? "use-wide" : ""}`} key={use.tag} data-reveal>
                <span className="tag">{use.tag}</span>
                <p className="use-question">{use.question}</p>
                <p className="use-body">{use.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------- build */}
        <section className="band shell" id="build">
          <div className="band-head">
            <span className="tag" data-reveal>
              04 · How it is built
            </span>
            <h2 className="h2" data-reveal>
              Retrieval in the browser. The model is optional.
            </h2>
          </div>

          <div className="build">
            <div className="build-copy" data-reveal>
              <p className="prose">
                Documents are split at their headings. Each passage is scored against the question using term frequency
                weighted by how rare each word is across the set, with a bonus when the words land in a heading. The top
                passages come back carrying their line numbers, which is how the reader knows what to highlight.
              </p>
              <p className="prose">
                Set an OpenAI key and those same passages get sent out for the write-up. Leave it unset and the answer
                is assembled from the passages directly. The tool labels which one you are looking at, every time.
              </p>
            </div>

            <div className="build-side" data-reveal>
              <div className="build-block">
                <span className="tag">Stack</span>
                <p>Next.js App Router, React 19, TypeScript, plain CSS, GSAP and Lenis for the motion on this page.</p>
              </div>
              <div className="build-block">
                <span className="tag">Not built yet</span>
                <p>
                  Accounts, a real vector store with embeddings, permissions, connectors to Drive and Notion,
                  re-indexing in the background, and scoring against a fixed question set.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------- close */}
        <section className="close shell">
          <div className="close-inner" data-reveal>
            <h2 className="h2">Load the demo set and ask it something.</h2>
            <p className="lede">
              Seven documents from a made-up software company, written to disagree with each other on purpose. Find the
              contradictions in about two minutes.
            </p>
            <Link className="btn btn-primary" href="/tool">
              Open the tool
            </Link>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="shell footer-inner">
          <span className="tag">GTM OS</span>
          <span className="tag">Built by Chase Fort</span>
        </div>
      </footer>
    </>
  );
}
