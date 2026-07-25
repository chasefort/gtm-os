import fs from "node:fs";
import path from "node:path";

export type SourceDoc = {
  id: string;
  title: string;
  filename: string;
  documentType: string;
  status: string;
  owner: string;
  updated: string;
  content: string;
  origin: "sample" | "added";
};

const DATA_DIR = path.join(process.cwd(), "data", "demo-workspace");

function slugFromFilename(filename: string) {
  return filename.replace(/^\d+-/, "").replace(/\.md$/, "");
}

function firstMatch(content: string, pattern: RegExp, fallback: string) {
  return content.match(pattern)?.[1]?.trim() || fallback;
}

export function loadSampleDocs(): SourceDoc[] {
  return fs
    .readdirSync(DATA_DIR)
    .filter((filename) => filename.endsWith(".md"))
    .sort()
    .map((filename) => {
      const content = fs.readFileSync(path.join(DATA_DIR, filename), "utf8");
      return {
        id: slugFromFilename(filename),
        title: firstMatch(content, /^#\s+(.+)$/m, slugFromFilename(filename)),
        filename,
        documentType: firstMatch(content, /^-\s+Document type:\s+(.+)$/m, "Business document"),
        status: firstMatch(content, /^-\s+Status:\s+(.+)$/m, "Needs review"),
        owner: firstMatch(content, /^-\s+Functional owner:\s+(.+)$/m, "Unassigned"),
        updated: firstMatch(content, /^-\s+Last updated:\s+(.+)$/m, "Undated"),
        content,
        origin: "sample" as const,
      };
    });
}
