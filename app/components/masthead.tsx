import Link from "next/link";

type Page = "home" | "how" | "tech" | "tool";

const links: Array<{ key: Page; href: string; label: string }> = [
  { key: "how", href: "/how-it-works", label: "How it works" },
  { key: "tech", href: "/tech", label: "Tech" },
];

export function Masthead({ current }: { current: Page }) {
  return (
    <header className="masthead">
      <div className="shell masthead-inner">
        <Link href="/" className="wordmark" aria-label="GTM OS home">
          <span className="sheets" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          GTM OS
        </Link>

        <nav className="mast-nav">
          {links.map((link) => (
            <Link
              key={link.key}
              className="mast-link mast-link-optional"
              href={link.href}
              aria-current={current === link.key ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}

          {current === "tool" ? (
            <span className="mast-link" aria-current="page">
              Tool
            </span>
          ) : (
            <Link className="btn btn-primary btn-sm" href="/tool">
              Open the tool
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
