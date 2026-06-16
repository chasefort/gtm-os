from __future__ import annotations

from ipaddress import ip_address
from urllib.parse import urlparse
import os

import requests


def firecrawl_available() -> bool:
    return bool(os.getenv("FIRECRAWL_API_KEY"))


def scrape_url(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("Enter a full URL including https://")
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only http and https URLs are supported.")
    if _is_blocked_host(parsed.hostname or ""):
        raise ValueError("Private, local, and internal network URLs are not allowed in the public demo.")

    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        raise RuntimeError("FIRECRAWL_API_KEY is not configured.")

    response = requests.post(
        "https://api.firecrawl.dev/v1/scrape",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={"url": url, "formats": ["markdown"]},
        timeout=45,
    )
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data", payload)
    markdown = data.get("markdown") or data.get("content") or ""
    title = (data.get("metadata") or {}).get("title") or parsed.netloc
    if not markdown.strip():
        raise RuntimeError("Firecrawl returned no markdown content.")
    return title, markdown


def _is_blocked_host(hostname: str) -> bool:
    host = hostname.lower().strip("[]")
    if host in {"localhost", "0.0.0.0"} or host.endswith(".local"):
        return True
    try:
        address = ip_address(host)
    except ValueError:
        return False
    return address.is_private or address.is_loopback or address.is_link_local or address.is_reserved
