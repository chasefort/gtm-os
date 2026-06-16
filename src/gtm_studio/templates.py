STUDIO_TEMPLATES = {
    "GTM Source of Truth": [
        "What we sell",
        "Who we sell to",
        "Why now",
        "Core pains",
        "Messaging pillars",
        "Proof points",
        "Objections",
        "Competitive positioning",
        "Sales guidance",
        "Marketing dos and don'ts",
    ],
    "Sales Battlecard": [
        "Target buyer",
        "Discovery questions",
        "Objections and responses",
        "Competitor comparison",
        "Proof points",
        "Talk tracks",
    ],
    "Objection Handler": [
        "Objection",
        "What it really means",
        "Best response",
        "Source support",
        "Follow-up question",
    ],
    "Campaign Brief": [
        "Audience",
        "Campaign thesis",
        "Key message",
        "Channels",
        "Offers and assets",
        "Risks",
        "Source-backed claims",
    ],
    "LLM Prompt Pack": [
        "Reusable company context",
        "Sales prompt",
        "Marketing prompt",
        "CS prompt",
        "Exec briefing prompt",
        "Guardrails",
    ],
    "Alignment Check": [
        "Conflicting positioning",
        "Unsupported claims",
        "Pricing inconsistencies",
        "Buyer mismatch",
        "Sales-vs-marketing language gaps",
        "External market pressure",
    ],
}


def template_instructions(name: str) -> str:
    return "\n".join(f"- {section}" for section in STUDIO_TEMPLATES[name])
