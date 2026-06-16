import fs from "node:fs";
import path from "node:path";

export type SourceDoc = {
  id: string;
  title: string;
  filename: string;
  documentType: string;
  status: string;
  owner: string;
  category: string;
  updated: string;
  content: string;
};

const DATA_DIR = path.join(process.cwd(), "data", "northstariq");

function slugFromFilename(filename: string) {
  return filename.replace(/^\d+-/, "").replace(/\.md$/, "");
}

function firstMatch(content: string, pattern: RegExp, fallback: string) {
  return content.match(pattern)?.[1]?.trim() || fallback;
}

function inferCategory(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("pricing")) return "Pricing";
  if (lower.includes("competitor")) return "Competitor";
  if (lower.includes("objection")) return "Customer";
  if (lower.includes("sales")) return "Sales";
  if (lower.includes("brand")) return "Brand";
  return "Product";
}

export function loadSourceDocs(): SourceDoc[] {
  return fs
    .readdirSync(DATA_DIR)
    .filter((filename) => filename.endsWith(".md"))
    .sort()
    .map((filename) => {
      const filePath = path.join(DATA_DIR, filename);
      const content = fs.readFileSync(filePath, "utf8");
      const title = firstMatch(content, /^#\s+(.+)$/m, slugFromFilename(filename));
      return {
        id: slugFromFilename(filename),
        title,
        filename,
        documentType: firstMatch(content, /^-\s+Document type:\s+(.+)$/m, "Business document"),
        status: firstMatch(content, /^-\s+Status:\s+(.+)$/m, "Needs review"),
        owner: firstMatch(content, /^-\s+Functional owner:\s+(.+)$/m, "NorthstarIQ"),
        category: inferCategory(title),
        updated: firstMatch(content, /^-\s+Last updated:\s+(.+)$/m, "2026"),
        content,
      };
    });
}
