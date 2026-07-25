import Link from "next/link";

export function Masthead({ current }: { current: "home" | "tool" }) {
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
          {current === "home" ? (
            <>
              <a className="mast-link mast-link-optional" href="#how">
                How it works
              </a>
              <a className="mast-link mast-link-optional" href="#ask">
                What to ask it
              </a>
              <a className="mast-link mast-link-optional" href="#build">
                How it is built
              </a>
              <Link className="btn btn-primary btn-sm" href="/tool">
                Open the tool
              </Link>
            </>
          ) : (
            <>
              <Link className="mast-link" href="/">
                Overview
              </Link>
              <span className="mast-link" aria-current="page">
                Tool
              </span>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
