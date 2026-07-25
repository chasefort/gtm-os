import type { Metadata } from "next";
import { Masthead } from "../components/masthead";
import { Workspace } from "./workspace";
import { loadSampleDocs } from "@/lib/documents";
import "./tool.css";

export const metadata: Metadata = {
  title: "GTM OS — the tool",
  description: "Load documents, ask a question, read the source lines behind the answer.",
};

export default function ToolPage() {
  return (
    <>
      <Masthead current="tool" />
      <Workspace sampleDocs={loadSampleDocs()} />
    </>
  );
}
