import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

function loadRagModule() {
  const filename = path.join(process.cwd(), "lib", "rag.ts");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = { exports: {} };
  Function("exports", "module", output)(loaded.exports, loaded);
  return loaded.exports;
}

function loadDemoDocs() {
  const directory = path.join(process.cwd(), "data", "demo-workspace");
  return fs
    .readdirSync(directory)
    .filter((filename) => filename.endsWith(".md"))
    .sort()
    .map((filename) => {
      const content = fs.readFileSync(path.join(directory, filename), "utf8");
      return {
        id: filename,
        title: content.match(/^#\s+(.+)$/m)?.[1] || filename,
        filename,
        documentType: "Demo",
        status: "Needs review",
        owner: "Demo",
        updated: "Demo",
        content,
        origin: "sample",
      };
    });
}

const { buildLocalAnswer } = loadRagModule();
const docs = loadDemoDocs();

for (const question of [
  "Which claims would not survive review?",
  "What should our launch campaign focus on?",
]) {
  test(`retrieval fallback does not pretend to answer: ${question}`, () => {
    const answer = buildLocalAnswer(docs, question);

    assert.equal(answer.mode, "Retrieval");
    assert.equal(answer.confidence, "Thin");
    assert.ok(answer.evidence.length > 0);
    assert.match(answer.summary, /retrieval alone cannot answer this question reliably/i);
    assert.deepEqual(answer.points, []);
  });
}
