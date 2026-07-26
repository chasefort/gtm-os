import type { Metadata } from "next";
import Link from "next/link";
import { Masthead } from "../components/masthead";
import { Choreography } from "../components/choreography";
import { loadSampleDocs } from "@/lib/documents";
import { countChunks } from "@/lib/rag";
import "../pages.css";

export const metadata: Metadata = {
  title: "GTM OS — tech",
  description:
    "Retrieval runs in the browser: heading-aware chunking, BM25 scoring, line-range provenance, and an optional model step.",
};

const pipeline = [
  {
    tag: "Stage 01",
    title: "Split at the headings",
    body: "Documents are cut at every heading below the title. The document control block is skipped so metadata does not pollute the text. A passage flushes at roughly 780 characters so nothing gets long enough to dilute its own score.",
    file: "chunkDocument()\nlib/rag.ts",
  },
  {
    tag: "Stage 02",
    title: "Keep the line numbers",
    body: "Every passage records the first and last line it came from. This is the smallest decision on the page and the one everything else depends on: without it, a citation can only quote a snippet back at you instead of opening the file at the right place.",
    file: "lineStart, lineEnd\nlib/rag.ts",
  },
  {
    tag: "Stage 03",
    title: "Score with BM25",
    body: "Term frequency weighted by how rare each word is across the set, divided by how long the passage is. Words that land in a heading get a bonus, and adjacent query words appearing together get another.",
    file: "retrieve()\nlib/rag.ts",
  },
  {
    tag: "Stage 04",
    title: "Read what came back",
    body: "The question picks a lens. Money questions pull every figure out of the retrieved text and key them on the amount alone, so $999 and $999/month are not counted as two prices. Risk questions scan for absolute wording. Both are computed from the loaded documents, so uploads behave the same way the demo does.",
    file: "moneyFigures()\nriskyPhrases()",
  },
  {
    tag: "Stage 05",
    title: "Write the answer",
    body: "With no key, the summary is assembled from what stage four found and the passages it came from. With a key, those same passages go to the model with instructions to cite only the numbers it was given. The header says which one you are looking at.",
    file: "buildLocalAnswer()\napp/api/ask/route.ts",
  },
];

const calls = [
  {
    title: "BM25 rather than embeddings",
    body: "Embeddings need an API key, a vector store, and an indexing step before the tool does anything at all. BM25 runs on the documents you just dropped in, with no key and no wait, which is what makes the demo openable by someone who has 30 seconds.",
    cost: "Loses on synonyms. Ask about \"cost\" when the docs say \"price\" and it will do worse than a vector search would.",
  },
  {
    title: "Line ranges rather than quoted snippets",
    body: "Most RAG demos print the retrieved chunk under the answer. That still asks you to trust that the chunk is what the file says. Carrying line numbers means a citation opens the real document, scrolled and marked.",
    cost: "Chunking has to survive contact with the raw file, so the reader renders from source lines instead of cleaned text.",
  },
  {
    title: "IntersectionObserver rather than ScrollTrigger",
    body: "Anchor jumps, restored scroll positions, and find-in-page all move the page without a normal scroll sequence. A scroll-driven trigger can miss those and leave a section stuck at opacity zero. The observer fires on any of them.",
    cost: "No scroll-linked scrubbing. Fine here, since nothing on the page is tied to scroll progress.",
  },
  {
    title: "The motion script sets the hidden state",
    body: "If CSS hides content and JavaScript reveals it, a script that fails to run leaves a blank page. Here the start state is set on mount, so the worst case is a page that appears without animating.",
    cost: "Elements already in view when the script mounts animate immediately rather than on entry.",
  },
];

const stack = [
  "Next.js App Router",
  "React 19",
  "TypeScript",
  "Plain CSS, no framework",
  "OKLCH colour",
  "GSAP",
  "Lenis",
  "OpenAI (optional)",
  "Vercel",
];

export default function TechPage() {
  const docs = loadSampleDocs();
  const passages = countChunks(docs);

  return (
    <>
      <Choreography />
      <Masthead current="tech" />

      <main className="shell">
        <section className="page-head">
          <p className="tag tag-cobalt">Tech</p>
          <h1 className="display">Retrieval in the browser. The model is optional.</h1>
          <p className="lede">
            No key, no vector database, no indexing job. The documents you drop in are chunked and scored in the tab you
            are sitting in, and the answer is built from what came back. A hosted model improves the write-up when a key
            is set, and the tool works without one.
          </p>
        </section>

        <section className="stack-section">
          <div className="stack-head">
            <span className="tag" data-reveal>
              01 · Pipeline
            </span>
            <h2 className="h2" data-reveal>
              Five stages, one file doing most of the work.
            </h2>
          </div>

          <div className="stack-body">
            <ol className="pipeline">
              {pipeline.map((stage) => (
                <li className="stage" key={stage.tag} data-reveal>
                  <span className="tag stage-tag tag-cobalt">{stage.tag}</span>
                  <div>
                    <h3>{stage.title}</h3>
                    <p>{stage.body}</p>
                  </div>
                  <span className="stage-file">
                    {stage.file.split("\n").map((part) => (
                      <span key={part} style={{ display: "block" }}>
                        {part}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="stack-section">
          <div className="stack-head">
            <span className="tag" data-reveal>
              02 · Scoring
            </span>
            <h2 className="h2" data-reveal>
              Why the long passage stopped winning.
            </h2>
          </div>

          <div className="stack-body">
            <p className="prose" data-reveal>
              The first version counted how often a query word appeared and weighted it by how rare the word was. Ask
              &ldquo;Is our pricing consistent?&rdquo; and it returned a product-marketing passage, because that passage
              was long and said &ldquo;pricing&rdquo; several times. Length normalisation was the fix.
            </p>

            <div className="slab" data-reveal>
              score(passage, query) = Σ idf(term) × (f × (k₁ + 1)) ÷ (f + k₁ × (1 − b + b × len ÷ avglen))
              <br />
              idf(term) = log(1 + (N − n + 0.5) ÷ (n + 0.5))
              <br />
              k₁ = 1.4 b = 0.72
            </div>

            <div className="slab-legend" data-reveal>
              <div>
                <span>f</span>
                <span>how often the term appears in this passage</span>
              </div>
              <div>
                <span>n</span>
                <span>how many passages contain the term at all</span>
              </div>
              <div>
                <span>N</span>
                <span>total passages in the loaded set, {passages} for the demo</span>
              </div>
              <div>
                <span>b</span>
                <span>how hard length is punished, 0 for none and 1 for full</span>
              </div>
            </div>

            <p className="prose" data-reveal>
              Same question after the change: the two conflicting figures come back first, from the pricing notes and
              the sales call notes.
            </p>
          </div>
        </section>

        <section className="stack-section">
          <div className="stack-head">
            <span className="tag" data-reveal>
              03 · Two paths
            </span>
            <h2 className="h2" data-reveal>
              The same passages either way.
            </h2>
          </div>

          <div className="stack-body">
            <div className="paths">
              <div className="path path-live" data-reveal>
                <span className="tag tag-cobalt">Local · no key needed</span>
                <ol>
                  <li>
                    <span>01</span> Chunk and score in the browser
                  </li>
                  <li>
                    <span>02</span> Pull figures and risky wording from the top passages
                  </li>
                  <li>
                    <span>03</span> Assemble the summary from what was found
                  </li>
                  <li>
                    <span>04</span> Label the answer &ldquo;Local&rdquo;
                  </li>
                </ol>
              </div>

              <div className="path" data-reveal>
                <span className="tag">Model · OPENAI_API_KEY set</span>
                <ol>
                  <li>
                    <span>01</span> Chunk and score in the browser, identically
                  </li>
                  <li>
                    <span>02</span> Post those passages to /api/ask
                  </li>
                  <li>
                    <span>03</span> Model writes it up, citing only the given numbers
                  </li>
                  <li>
                    <span>04</span> Label the answer &ldquo;Model&rdquo;
                  </li>
                </ol>
              </div>
            </div>

            <p className="prose" data-reveal>
              Retrieval is the same in both paths, so the citations point at the same lines either way. Your files never
              leave the browser. Only the matched passages are sent, and only when a key is configured.
            </p>
          </div>
        </section>

        <section className="stack-section">
          <div className="stack-head">
            <span className="tag" data-reveal>
              04 · Calls made
            </span>
            <h2 className="h2" data-reveal>
              Decisions worth defending, and what each one costs.
            </h2>
          </div>

          <div className="stack-body">
            <div className="calls">
              {calls.map((call) => (
                <article className="call" key={call.title} data-reveal>
                  <h3>{call.title}</h3>
                  <p>{call.body}</p>
                  <p className="call-cost">
                    <strong>Cost</strong>
                    <br />
                    {call.cost}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="stack-section">
          <div className="stack-head">
            <span className="tag" data-reveal>
              05 · Stack and numbers
            </span>
            <h2 className="h2" data-reveal>
              What it is made of.
            </h2>
          </div>

          <div className="stack-body">
            <div className="stack-chips" data-reveal>
              {stack.map((item) => (
                <span className="stack-chip" key={item}>
                  {item}
                </span>
              ))}
            </div>

            <ul className="plain-list" data-reveal>
              <li>
                <span aria-hidden="true" />
                Landing page: 139 kB first load, including GSAP and Lenis. The tool: 113 kB. Both prerender as static.
              </li>
              <li>
                <span aria-hidden="true" />
                Demo set: {docs.length} documents, {passages} passages, indexed on click with no network request.
              </li>
              <li>
                <span aria-hidden="true" />
                Type and colour are one system. Every neutral is OKLCH tinted toward the cobalt brand hue, so surfaces
                and accent agree instead of fighting.
              </li>
              <li>
                <span aria-hidden="true" />
                Still missing for production: accounts, a real vector store, permissions, connectors to Drive and
                Notion, background re-indexing, and scoring against a fixed question set.
              </li>
            </ul>
          </div>
        </section>

        <div className="page-next">
          <Link className="btn btn-primary" href="/tool">
            Open the tool
          </Link>
          <Link className="btn" href="/how-it-works">
            See how it works
          </Link>
        </div>
      </main>
    </>
  );
}
