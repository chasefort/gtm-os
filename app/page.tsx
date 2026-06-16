import { GtmOsApp } from "./ui";
import { loadSourceDocs } from "@/lib/documents";

export default function Page() {
  const docs = loadSourceDocs();
  return <GtmOsApp initialDocs={docs} />;
}
