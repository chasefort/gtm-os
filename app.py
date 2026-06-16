from __future__ import annotations

from pathlib import Path
import html
import os
import tempfile

from dotenv import load_dotenv
import streamlit as st
import streamlit.components.v1 as components

from src.document_processing.doc_processor import DocumentChunk, DocumentProcessor
from src.embeddings.embedding_generator import LocalEmbeddingGenerator
from src.generation.rag import RAGGenerator, RAGResult
from src.gtm_studio.templates import STUDIO_TEMPLATES, template_instructions
from src.vector_database.local_vector_db import LocalVectorDB
from src.web_scraping.firecrawl import firecrawl_available, scrape_url

load_dotenv()

ROOT = Path(__file__).parent
DEMO_DATA = ROOT / "data" / "northstariq"
LOGO_HTML = ROOT / "assets" / "gtm-os-logo.hyperframes.html"
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "10"))
CATEGORIES = ["Product", "Sales", "Customer", "Competitor", "Pricing", "Brand", "Market", "Customer Voice"]
KINDS = ["Internal", "External"]
STATUSES = ["Approved", "Needs Review"]
SUGGESTED_QUESTIONS = [
    "Where is our positioning inconsistent?",
    "What should sales say against SecureFlow?",
    "What claims are unsupported or risky?",
    "What are the top buyer objections?",
    "What should our launch campaign focus on?",
    "What does marketing say that sales should avoid?",
    "Create an LLM-ready context pack for the revenue team.",
]


def configure_hosted_secrets() -> None:
    try:
        secrets = st.secrets
    except Exception:
        return
    for key in ["OPENAI_API_KEY", "OPENAI_MODEL", "FIRECRAWL_API_KEY"]:
        if key in secrets and secrets[key] and not os.getenv(key):
            os.environ[key] = str(secrets[key])


st.set_page_config(page_title="GTM OS", layout="wide")
configure_hosted_secrets()

st.markdown(
    """
<style>
:root {
  --bg: #08090d;
  --bg-2: #0c0e14;
  --panel: rgba(17, 19, 28, 0.72);
  --panel-strong: rgba(24, 27, 39, 0.82);
  --line: rgba(255, 255, 255, 0.085);
  --line-strong: rgba(255, 255, 255, 0.16);
  --ink: #f7f8ff;
  --muted: #9ba2b5;
  --muted-2: #6f778a;
  --soft: rgba(255, 255, 255, 0.055);
  --accent: #8a8dff;
  --accent-2: #5ad7ff;
  --green: #52d6a5;
  --amber: #f0c46b;
  --red: #ff8b7d;
  --shadow: 0 24px 90px rgba(0, 0, 0, 0.42);
}

html, body, [class*="css"] {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
}

.stApp {
  background:
    radial-gradient(circle at 50% -12%, rgba(138, 141, 255, 0.28), transparent 34rem),
    radial-gradient(circle at 86% 10%, rgba(90, 215, 255, 0.13), transparent 26rem),
    linear-gradient(180deg, #0e1018 0%, #08090d 42rem),
    var(--bg) !important;
  color: var(--ink);
}

.block-container {
  max-width: 1480px;
  padding: 2.2rem 3.4rem 4rem;
}

header[data-testid="stHeader"] {
  background: transparent;
}

#MainMenu,
footer,
[data-testid="stDecoration"],
[data-testid="stToolbar"],
[data-testid="stDeployButton"],
.stDeployButton {
  display: none;
}

.topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 28px;
  align-items: end;
  padding: 26px 28px;
  border: 1px solid var(--line);
  border-radius: 18px;
  margin-bottom: 22px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.028)),
    rgba(12, 14, 21, 0.72);
  box-shadow: var(--shadow);
  position: relative;
  overflow: hidden;
}

div[data-testid="stHorizontalBlock"]:has(> div[data-testid="stColumn"] .panel-title) {
  gap: 18px;
}

div[data-testid="stHorizontalBlock"]:has(> div[data-testid="stColumn"] .panel-title) > div[data-testid="stColumn"] {
  min-height: 650px;
  padding: 22px 22px 24px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.022)),
    rgba(9, 11, 17, 0.62);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.055), 0 18px 60px rgba(0,0,0,0.2);
}

.topbar::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(138,141,255,0.18), transparent 38%),
    linear-gradient(180deg, rgba(255,255,255,0.08), transparent 40%);
  opacity: 0.75;
}

.brand-kicker {
  color: var(--accent);
  font-size: 12px;
  font-weight: 760;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.app-title {
  color: var(--ink);
  font-size: clamp(44px, 5.5vw, 72px);
  line-height: 0.95;
  font-weight: 780;
  letter-spacing: -0.045em;
  margin: 0;
  text-shadow: 0 0 28px rgba(138, 141, 255, 0.14);
}

.topbar-copy {
  color: var(--muted);
  max-width: 570px;
  font-size: 14px;
  line-height: 1.55;
  margin-top: 12px;
}

.workspace-stats {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 18px;
  align-items: end;
  color: var(--muted);
}

.stat {
  min-width: 88px;
  padding-left: 14px;
  border-left: 1px solid var(--line);
}

.stat-value {
  display: block;
  color: var(--ink);
  font-size: 24px;
  font-weight: 780;
  line-height: 1;
}

.stat-label {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.panel-title {
  color: var(--ink);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin: 0 0 12px;
}

.subtle {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.source-table {
  margin-top: 14px;
  border-top: 1px solid var(--line);
}

.source-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  transition: border-color 160ms ease, background 160ms ease;
}

.source-row:hover {
  border-bottom-color: rgba(138, 141, 255, 0.32);
  background: linear-gradient(90deg, rgba(138,141,255,0.045), transparent);
}

.source-viewer {
  margin: 16px 0 18px;
  padding: 14px 14px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.62)),
    rgba(94,106,210,0.045);
}

.source-viewer-title {
  color: var(--ink);
  font-size: 14px;
  font-weight: 760;
  line-height: 1.25;
  margin-bottom: 8px;
}

.source-viewer-meta {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.source-open-row button {
  font-size: 12px !important;
  min-height: 30px !important;
}

.source-name {
  color: var(--ink);
  font-size: 13px;
  font-weight: 760;
  line-height: 1.25;
  margin-bottom: 7px;
}

.source-meta {
  color: var(--muted);
  font-size: 12px;
}

.chunk-count {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.badge-line {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 750;
  line-height: 1.45;
  color: var(--muted);
  background: rgba(255,255,255,0.035);
  border: 1px solid var(--line);
}

.badge-internal { color: var(--green); border-color: rgba(82, 214, 165, 0.24); background: rgba(82, 214, 165, 0.075); }
.badge-external { color: var(--red); border-color: rgba(255, 139, 125, 0.24); background: rgba(255, 139, 125, 0.075); }
.badge-approved { color: var(--accent-2); border-color: rgba(90, 215, 255, 0.23); background: rgba(90, 215, 255, 0.065); }
.badge-review { color: var(--amber); border-color: rgba(240, 196, 107, 0.25); background: rgba(240, 196, 107, 0.075); }

.ask-header {
  margin: 0 0 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.ask-title {
  color: var(--ink);
  font-size: 30px;
  line-height: 1.08;
  font-weight: 760;
  letter-spacing: -0.035em;
  margin: 0 0 7px;
}

.suggested-label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 16px 0 8px;
}

.studio-list {
  margin: 10px 0 18px;
  border-top: 1px solid var(--line);
}

.studio-item {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
  color: var(--ink);
  font-size: 13px;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
}

.studio-index {
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.citation-source {
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 8px;
}

.stMarkdown h1:not(.app-title) {
  color: var(--ink);
  font-size: 26px;
  line-height: 1.08;
  letter-spacing: -0.02em;
  margin: 18px 0 12px;
}

.stMarkdown h2 {
  color: var(--ink);
  font-size: 17px;
  line-height: 1.25;
  margin: 18px 0 7px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--line);
}

.stMarkdown h3 {
  color: var(--ink);
  font-size: 14px;
  line-height: 1.35;
}

.stMarkdown p, .stMarkdown li {
  color: var(--ink);
  line-height: 1.55;
}

div[data-testid="stChatMessage"] {
  background: transparent;
  border: 0;
  padding: 0;
}

div[data-testid="stChatMessageContent"] {
  background: rgba(255,255,255,0.045);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px 16px;
}

.stChatInput {
  background: transparent;
}

[data-testid="stChatInput"] {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.045)),
    rgba(13, 15, 23, 0.86) !important;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 36px rgba(0,0,0,0.22);
}

[data-testid="stChatInput"] textarea,
[data-testid="stChatInputTextArea"] {
  color: var(--ink) !important;
  -webkit-text-fill-color: var(--ink) !important;
  caret-color: var(--ink) !important;
  background: transparent !important;
}

[data-testid="stChatInput"] textarea::placeholder,
[data-testid="stChatInputTextArea"]::placeholder {
  color: #8a8378 !important;
  opacity: 1 !important;
}

[data-testid="stChatInput"] button {
  background: linear-gradient(135deg, var(--accent), #6b6eff) !important;
  border-radius: 10px !important;
}

button[kind="primary"], .stButton > button[kind="primary"] {
  background: linear-gradient(135deg, #8a8dff, #6267ff) !important;
  color: #ffffff !important;
  border: 1px solid rgba(183,185,255,0.55) !important;
  border-radius: 12px !important;
  box-shadow: 0 14px 40px rgba(98,103,255,0.24), inset 0 1px 0 rgba(255,255,255,0.28) !important;
}

button[kind="primary"] p, .stButton > button[kind="primary"] p {
  color: #ffffff !important;
}

.stButton > button:not([kind="primary"]) {
  border-radius: 0 !important;
  border: 0 !important;
  border-bottom: 1px solid var(--line) !important;
  background: transparent !important;
  color: #fff !important;
  min-height: 38px;
  box-shadow: none !important;
  font-weight: 640 !important;
  text-align: left;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.stButton > button:not([kind="primary"]):hover {
  border-bottom-color: rgba(138,141,255,0.55) !important;
  background: transparent !important;
  color: var(--accent) !important;
}

.stDownloadButton > button {
  border-radius: 12px !important;
  border: 1px solid var(--line-strong) !important;
  background: rgba(255,255,255,0.06) !important;
  color: var(--ink) !important;
  min-height: 40px;
  box-shadow: none !important;
  font-weight: 680 !important;
  text-align: left;
}

.stDownloadButton > button:hover {
  border-color: rgba(138,141,255,0.55) !important;
  background: rgba(255,255,255,0.09) !important;
  color: var(--ink) !important;
}

div[data-testid="stSelectbox"] div[data-baseweb="select"] > div,
div[data-testid="stTextInput"] input,
div[data-testid="stFileUploader"] section {
  border-radius: 12px !important;
  border-color: var(--line-strong) !important;
  background: rgba(255,255,255,0.055) !important;
  color: var(--ink) !important;
}

details {
  border-top: 1px solid var(--line) !important;
  border-bottom: 0 !important;
  background: transparent !important;
  border-radius: 0 !important;
}

details summary {
  color: var(--ink) !important;
  font-weight: 720 !important;
}

/* Linear-inspired composition layer */
.block-container {
  max-width: 1220px;
  padding: 1.45rem 1.5rem 4rem;
}

.site-nav {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 28px;
  min-height: 44px;
  padding-bottom: 74px;
  border-bottom: 1px solid var(--line);
}

.wordmark {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  font-size: 20px;
  font-weight: 760;
  letter-spacing: -0.02em;
}

.mark {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background:
    repeating-linear-gradient(45deg, #f7f8ff 0 3px, transparent 3px 6px),
    linear-gradient(135deg, rgba(138,141,255,0.9), rgba(90,215,255,0.7));
  box-shadow: 0 0 22px rgba(138,141,255,0.28);
}

.nav-links {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 30px;
  color: var(--muted);
  font-size: 13px;
}

.nav-pill {
  color: #0a0b10;
  background: #f4f5fb;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 700;
}

.topbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 44px;
  align-items: end;
  padding: 124px 0 48px;
  border: 0;
  border-radius: 0;
  margin-bottom: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

.topbar::before {
  width: 720px;
  height: 420px;
  left: 18%;
  top: 30px;
  inset: auto;
  background: radial-gradient(circle, rgba(138,141,255,0.18), transparent 68%);
  filter: blur(16px);
  opacity: 0.8;
}

.app-title {
  font-size: clamp(56px, 6.1vw, 78px);
  line-height: 0.98;
  font-weight: 560;
  letter-spacing: -0.045em;
  max-width: 850px;
  text-shadow: none;
}

.topbar-copy {
  max-width: 440px;
  font-size: 16px;
  line-height: 1.58;
  margin-top: 28px;
}

.workspace-stats {
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  align-items: stretch;
  width: 340px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: rgba(255,255,255,0.035);
  overflow: hidden;
}

.stat {
  min-width: 0;
  padding: 18px 18px 16px;
  border-left: 1px solid var(--line);
}

.stat:first-child {
  border-left: 0;
}

div[data-testid="stHorizontalBlock"]:has(> div[data-testid="stColumn"] .panel-title) {
  gap: 0;
  border: 1px solid var(--line-strong);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018)),
    rgba(9, 11, 17, 0.84);
  box-shadow: 0 32px 120px rgba(0,0,0,0.56), inset 0 1px 0 rgba(255,255,255,0.08);
  overflow: hidden;
}

div[data-testid="stHorizontalBlock"]:has(> div[data-testid="stColumn"] .panel-title) > div[data-testid="stColumn"] {
  min-height: 650px;
  padding: 22px 22px 24px;
  border: 0;
  border-left: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

div[data-testid="stHorizontalBlock"]:has(> div[data-testid="stColumn"] .panel-title) > div[data-testid="stColumn"]:first-child {
  border-left: 0;
}

@media (max-width: 900px) {
  .block-container { padding: 1rem 1.1rem 2rem; }
  .site-nav { grid-template-columns: 1fr; padding-bottom: 48px; }
  .nav-links { display: none; }
  .topbar { grid-template-columns: 1fr; padding: 72px 0 38px; }
  .workspace-stats { grid-template-columns: repeat(3, 1fr); }
}

/* Light product-window mode */
:root {
  --bg: #f7f8fb;
  --bg-2: #eef1f8;
  --panel: rgba(255,255,255,0.82);
  --panel-strong: rgba(255,255,255,0.94);
  --line: rgba(16, 17, 20, 0.09);
  --line-strong: rgba(16, 17, 20, 0.15);
  --ink: #101114;
  --muted: #687083;
  --muted-2: #8b92a3;
  --soft: rgba(94,106,210,0.07);
  --accent: #5e6ad2;
  --accent-2: #3178c6;
  --green: #087f5b;
  --amber: #8a6116;
  --red: #b84a3a;
  --shadow: 0 30px 100px rgba(30, 35, 58, 0.16);
}

.stApp {
  background:
    radial-gradient(circle at 50% -18%, rgba(94,106,210,0.20), transparent 34rem),
    radial-gradient(circle at 86% 0%, rgba(49,120,198,0.12), transparent 28rem),
    linear-gradient(180deg, #ffffff 0%, #f7f8fb 42rem),
    var(--bg) !important;
  color: var(--ink);
}

.block-container {
  max-width: 1220px;
  padding: 2rem 1.5rem 4rem;
}

.site-nav,
.topbar {
  display: none !important;
}

div[data-testid="stHorizontalBlock"]:has(> div[data-testid="stColumn"] .panel-title) {
  gap: 0;
  border: 1px solid var(--line-strong);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.82)),
    rgba(255,255,255,0.9);
  box-shadow: var(--shadow), inset 0 1px 0 rgba(255,255,255,0.95);
  overflow: hidden;
}

div[data-testid="stHorizontalBlock"]:has(> div[data-testid="stColumn"] .panel-title)::before {
  content: "";
  display: block;
  position: absolute;
}

div[data-testid="stHorizontalBlock"]:has(> div[data-testid="stColumn"] .panel-title) > div[data-testid="stColumn"] {
  min-height: 760px;
  padding: 28px 26px 30px;
  border: 0;
  border-left: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

div[data-testid="stHorizontalBlock"]:has(> div[data-testid="stColumn"] .panel-title) > div[data-testid="stColumn"]:first-child {
  border-left: 0;
}

.panel-title,
.suggested-label,
.brand-kicker {
  color: #4f5cc8;
}

.ask-title {
  color: var(--ink);
  font-size: 30px;
  font-weight: 660;
  letter-spacing: -0.035em;
}

.source-name {
  color: var(--ink);
  font-weight: 680;
}

.badge {
  color: var(--muted);
  background: rgba(16,17,20,0.025);
  border-color: var(--line);
}

.badge-internal { color: var(--green); border-color: rgba(8,127,91,0.20); background: rgba(8,127,91,0.055); }
.badge-external { color: var(--red); border-color: rgba(184,74,58,0.20); background: rgba(184,74,58,0.055); }
.badge-approved { color: var(--accent-2); border-color: rgba(49,120,198,0.20); background: rgba(49,120,198,0.055); }
.badge-review { color: var(--amber); border-color: rgba(138,97,22,0.22); background: rgba(138,97,22,0.06); }

[data-testid="stChatInput"] {
  background: #ffffff !important;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  box-shadow: 0 12px 34px rgba(30,35,58,0.08), inset 0 1px 0 rgba(255,255,255,0.9);
}

[data-testid="stChatInput"] textarea,
[data-testid="stChatInputTextArea"] {
  color: var(--ink) !important;
  -webkit-text-fill-color: var(--ink) !important;
}

[data-testid="stChatInput"] textarea::placeholder,
[data-testid="stChatInputTextArea"]::placeholder {
  color: #7b8498 !important;
}

[data-testid="stChatInput"] button,
button[kind="primary"],
.stButton > button[kind="primary"] {
  background: linear-gradient(135deg, #6e77ee, #525bd2) !important;
  color: #ffffff !important;
  border: 1px solid rgba(82,91,210,0.45) !important;
  box-shadow: 0 14px 34px rgba(94,106,210,0.22), inset 0 1px 0 rgba(255,255,255,0.25) !important;
}

.stButton > button:not([kind="primary"]) {
  color: var(--ink) !important;
  border-bottom-color: var(--line) !important;
}

.stButton > button:not([kind="primary"]) p {
  width: 100%;
  text-align: left;
}

.stButton > button:not([kind="primary"]):hover {
  color: var(--accent) !important;
  border-bottom-color: rgba(94,106,210,0.42) !important;
}

.stDownloadButton > button,
div[data-testid="stSelectbox"] div[data-baseweb="select"] > div,
div[data-testid="stTextInput"] input,
div[data-testid="stFileUploader"] section {
  background: #ffffff !important;
  color: var(--ink) !important;
  border-color: var(--line-strong) !important;
}

details summary {
  color: var(--ink) !important;
}

div[data-testid="stExpander"] [data-testid="stMarkdownContainer"] {
  max-height: 460px;
  overflow: auto;
  padding: 0 8px 10px 0;
}

.source-document {
  margin: 0 0 18px;
  padding: 14px 16px;
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.72)),
    rgba(94,106,210,0.05);
}

.status-grid {
  display: grid;
  gap: 8px;
  margin: 10px 0 18px;
}

.status-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}

.status-name {
  color: var(--ink);
  font-size: 13px;
  font-weight: 680;
}

.status-note {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
  margin-top: 2px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 780;
  white-space: nowrap;
  border: 1px solid rgba(8,127,91,0.20);
  background: rgba(8,127,91,0.055);
  color: var(--green);
}

.status-pill-muted {
  border-color: rgba(138,97,22,0.22);
  background: rgba(138,97,22,0.06);
  color: var(--amber);
}
</style>
""",
    unsafe_allow_html=True,
)


def init_state() -> None:
    if "processor" not in st.session_state:
        st.session_state.processor = DocumentProcessor()
        embeddings = LocalEmbeddingGenerator()
        st.session_state.vector_db = LocalVectorDB(embeddings)
        st.session_state.rag = RAGGenerator(
            st.session_state.vector_db,
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        )
        st.session_state.sources = []
        st.session_state.chat = []
        st.session_state.studio_result = None
        st.session_state.selected_source = None
        load_demo_workspace()


def source_metadata_from_markdown(path: Path) -> tuple[str, str, str]:
    text = path.read_text(encoding="utf-8")
    source_kind = _metadata_value(text, "Source kind") or "Internal"
    review_status = _metadata_value(text, "Review status") or "Approved"
    category = _metadata_value(text, "Category") or "Product"
    return source_kind, review_status, category


def _metadata_value(text: str, key: str) -> str | None:
    prefix = f"- {key}:"
    for line in text.splitlines():
        if line.startswith(prefix):
            return line.split(":", 1)[1].strip()
    return None


def load_demo_workspace() -> None:
    chunks: list[DocumentChunk] = []
    sources = []
    for path in sorted(DEMO_DATA.glob("*.md")):
        source_kind, review_status, category = source_metadata_from_markdown(path)
        file_chunks = st.session_state.processor.process_path(
            path,
            source_kind=source_kind,
            category=category,
            review_status=review_status,
        )
        chunks.extend(file_chunks)
        sources.append(
            {
                "name": path.name,
                "source_kind": source_kind,
                "review_status": review_status,
                "category": category,
                "chunks": len(file_chunks),
                "path": str(path),
                "preview_content": path.read_text(encoding="utf-8"),
            }
        )
    st.session_state.vector_db.replace_chunks(chunks)
    st.session_state.sources = sources


def add_chunks(chunks: list[DocumentChunk], source: dict) -> None:
    st.session_state.vector_db.add_chunks(chunks)
    st.session_state.sources.append(source)


def render_badges(source: dict) -> str:
    kind_class = "badge-internal" if source["source_kind"] == "Internal" else "badge-external"
    status_class = "badge-approved" if source["review_status"] == "Approved" else "badge-review"
    return (
        f'<span class="badge {kind_class}">{html.escape(source["source_kind"])}</span>'
        f'<span class="badge {status_class}">{html.escape(source["review_status"])}</span>'
        f'<span class="badge">{html.escape(source["category"])}</span>'
    )


def source_card(source: dict) -> None:
    source_key = f"source_{source['name']}".replace(".", "_").replace(" ", "_").replace("/", "_")
    if st.button(source["name"], key=source_key, use_container_width=True):
        st.session_state.selected_source = source["name"]
    st.markdown(
        f"""
<div class="source-row">
  <div>
    <div class="badge-line">{render_badges(source)}</div>
  </div>
  <div class="chunk-count">{source["chunks"]} chunks</div>
</div>
""",
        unsafe_allow_html=True,
    )


def selected_source() -> dict | None:
    return next(
        (source for source in st.session_state.sources if source["name"] == st.session_state.selected_source),
        None,
    )


def render_sources() -> None:
    st.markdown('<div class="panel-title">Sources</div>', unsafe_allow_html=True)
    st.caption("Demo workspace uses fictional SaaS materials created to simulate a messy GTM knowledge base.")
    st.markdown('<div class="source-table">', unsafe_allow_html=True)
    for source in st.session_state.sources:
        source_card(source)
    st.markdown("</div>", unsafe_allow_html=True)

    with st.expander("Upload source", expanded=False):
        uploaded = st.file_uploader("PDF, TXT, or Markdown", type=["pdf", "txt", "md"])
        source_kind = st.selectbox("Source type", KINDS, key="upload_kind")
        review_status = st.selectbox("Review status", STATUSES, key="upload_status")
        category = st.selectbox("Category", CATEGORIES, key="upload_category")
        if uploaded is not None and uploaded.size > MAX_UPLOAD_MB * 1024 * 1024:
            st.error(f"Keep uploads under {MAX_UPLOAD_MB} MB for this public demo.")
            uploaded = None
        if st.button("Ingest upload", use_container_width=True, disabled=uploaded is None):
            suffix = Path(uploaded.name).suffix
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(uploaded.getbuffer())
                temp_path = tmp.name
            try:
                chunks = st.session_state.processor.process_path(
                    temp_path,
                    source_kind=source_kind,
                    category=category,
                    review_status=review_status,
                    display_name=uploaded.name,
                )
                add_chunks(
                    chunks,
                    {
                        "name": uploaded.name,
                        "source_kind": source_kind,
                        "review_status": review_status,
                        "category": category,
                        "chunks": len(chunks),
                        "preview_content": "\n\n---\n\n".join(chunk.content for chunk in chunks),
                    },
                )
                st.success(f"Indexed {len(chunks)} chunks.")
            finally:
                os.unlink(temp_path)

    with st.expander("Add external URL", expanded=False):
        url = st.text_input("URL", placeholder="https://example.com/market-report")
        category = st.selectbox("External category", ["Competitor", "Market", "Pricing", "Customer Voice"], key="url_category")
        if not firecrawl_available():
            st.info("URL ingest is disabled until `FIRECRAWL_API_KEY` is set. Seeded internal demo sources still work.")
        if st.button("Scrape and index URL", use_container_width=True, disabled=not url or not firecrawl_available()):
            try:
                title, text = scrape_url(url)
                chunks = st.session_state.processor.process_text(
                    text,
                    title,
                    "External",
                    category,
                    "Needs Review",
                    metadata={"url": url},
                )
                add_chunks(
                    chunks,
                    {
                        "name": title,
                        "source_kind": "External",
                        "review_status": "Needs Review",
                        "category": category,
                        "chunks": len(chunks),
                        "preview_content": text,
                    },
                )
                st.success(f"Indexed {len(chunks)} chunks from URL.")
            except Exception as exc:
                st.error(str(exc))


def integration_status() -> list[dict[str, str]]:
    openai_ready = bool(os.getenv("OPENAI_API_KEY"))
    firecrawl_ready = firecrawl_available()
    return [
        {
            "name": "OpenAI synthesis",
            "state": "Connected" if openai_ready else "Local fallback",
            "note": "Uses hosted model output." if openai_ready else "Runs source-grounded answers without an API key.",
            "ready": openai_ready,
        },
        {
            "name": "Firecrawl URL ingest",
            "state": "Connected" if firecrawl_ready else "Disabled",
            "note": "External URLs can be indexed." if firecrawl_ready else "Seeded sources and uploads remain available.",
            "ready": firecrawl_ready,
        },
        {
            "name": "Local vector index",
            "state": "Ready",
            "note": f"{sum(source['chunks'] for source in st.session_state.sources)} source chunks indexed in memory.",
            "ready": True,
        },
    ]


def render_system_status() -> None:
    rows = []
    for item in integration_status():
        pill_class = "status-pill" if item["ready"] else "status-pill status-pill-muted"
        rows.append(
            f"""
<div class="status-item">
  <div>
    <div class="status-name">{html.escape(item["name"])}</div>
    <div class="status-note">{html.escape(item["note"])}</div>
  </div>
  <span class="{pill_class}">{html.escape(item["state"])}</span>
</div>
"""
        )
    st.markdown(
        f"""
<div class="suggested-label">System status</div>
<div class="status-grid">{''.join(rows)}</div>
""",
        unsafe_allow_html=True,
    )


def render_animated_logo() -> None:
    if not LOGO_HTML.exists():
        st.markdown('<div class="wordmark"><span class="mark"></span><span>GTM OS</span></div>', unsafe_allow_html=True)
        return
    components.html(LOGO_HTML.read_text(encoding="utf-8"), height=180, scrolling=False)


def render_citations(result: RAGResult) -> None:
    if not result.sources_used:
        return
    st.markdown('<div class="suggested-label">Citations</div>', unsafe_allow_html=True)
    for source in result.sources_used:
        label = f'{source["reference"]} {source["source_file"]}'
        with st.expander(label):
            st.markdown(render_badges(source), unsafe_allow_html=True)
            st.write(source["content"])


def render_chat() -> None:
    st.markdown(
        """
<div class="ask-header">
  <div class="panel-title">Ask GTM OS</div>
  <div class="ask-title">Ask the messy GTM brain.</div>
  <div class="subtle">Answers stay grounded in indexed NorthstarIQ sources and surface citations for inspection.</div>
</div>
""",
        unsafe_allow_html=True,
    )
    source = selected_source()
    if source:
        st.markdown(
            f"""
<div class="source-document">
  <div class="source-viewer-title">Viewing source: {html.escape(source["name"])}</div>
  <div class="source-viewer-meta">{source["source_kind"]} / {source["review_status"]} / {source["category"]} / {source["chunks"]} chunks</div>
</div>
""",
            unsafe_allow_html=True,
        )
        if st.button("Close source preview", use_container_width=True):
            st.session_state.selected_source = None
            st.rerun()
        with st.expander("Source document", expanded=True):
            st.markdown(source.get("preview_content") or "No preview content is available for this source.")

    question = st.chat_input("Ask about positioning, objections, campaigns, pricing, or claims")
    st.markdown('<div class="suggested-label">Suggested questions</div>', unsafe_allow_html=True)
    cols = st.columns(2)
    for index, prompt in enumerate(SUGGESTED_QUESTIONS):
        if cols[index % 2].button(prompt, use_container_width=True):
            question = prompt

    if question:
        result = st.session_state.rag.answer(question)
        st.session_state.chat.append(("user", question, None))
        st.session_state.chat.append(("assistant", result.response, result))

    for role, content, result in st.session_state.chat:
        with st.chat_message(role):
            st.markdown(content)
            if result:
                render_citations(result)


def render_studio() -> None:
    st.markdown('<div class="panel-title">GTM Studio</div>', unsafe_allow_html=True)
    render_system_status()
    selected = st.selectbox("Asset type", list(STUDIO_TEMPLATES))
    st.markdown('<div class="suggested-label">Required sections</div>', unsafe_allow_html=True)
    studio_items = "\n".join(
        f'<div class="studio-item"><span class="studio-index">{index:02d}</span><span>{html.escape(item)}</span></div>'
        for index, item in enumerate(STUDIO_TEMPLATES[selected], start=1)
    )
    st.markdown(f'<div class="studio-list">{studio_items}</div>', unsafe_allow_html=True)

    if st.button(f"Generate {selected}", type="primary", use_container_width=True):
        st.session_state.studio_result = st.session_state.rag.generate_artifact(
            selected,
            template_instructions(selected),
        )

    result = st.session_state.studio_result
    if result:
        st.markdown(result.response)
        render_citations(result)
        export = build_markdown_export(result)
        st.download_button(
            "Download Markdown",
            data=export,
            file_name=f"{result.query.lower().replace(' ', '-')}.md",
            mime="text/markdown",
            use_container_width=True,
        )


def build_markdown_export(result: RAGResult) -> str:
    sources = ["\n## Sources"]
    for source in result.sources_used:
        sources.append(
            f'- {source["reference"]} {source["source_file"]} ({source["source_kind"]}, {source["review_status"]}, {source["category"]})'
        )
    return f"{result.response}\n" + "\n".join(sources) + "\n"


init_state()

approved_count = sum(1 for source in st.session_state.sources if source["review_status"] == "Approved")
external_count = sum(1 for source in st.session_state.sources if source["source_kind"] == "External")
st.markdown(
    f"""
<div class="site-nav">
  <div class="wordmark"><span class="mark"></span><span>GTM OS</span></div>
  <div class="nav-links">
    <span>Sources</span>
    <span>Ask</span>
    <span>Studio</span>
    <span>Exports</span>
  </div>
  <div class="nav-pill">Demo workspace</div>
</div>
<div class="topbar">
  <div>
    <div class="brand-kicker">NorthstarIQ Demo Workspace</div>
    <h1 class="app-title">The GTM alignment system for teams and AI agents</h1>
    <div class="topbar-copy">
      Purpose-built for organizing regulated GTM knowledge, resolving messy positioning,
      and generating cited strategy assets from approved sources.
    </div>
  </div>
  <div class="workspace-stats">
    <div class="stat"><span class="stat-value">{len(st.session_state.sources)}</span><span class="stat-label">Sources</span></div>
    <div class="stat"><span class="stat-value">{approved_count}</span><span class="stat-label">Approved</span></div>
    <div class="stat"><span class="stat-value">{external_count}</span><span class="stat-label">External</span></div>
  </div>
</div>
""",
    unsafe_allow_html=True,
)
render_animated_logo()

left, center, right = st.columns([0.9, 1.55, 1.05], gap="large")
with left:
    render_sources()
with center:
    render_chat()
with right:
    render_studio()
