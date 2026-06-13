import type { ReactNode } from "react";
import { pages, type PageId } from "../app/navigation";

type AppShellProps = {
  children: ReactNode;
  currentPage: PageId;
};

export function AppShell({ children, currentPage }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#characters" aria-label="D&D Character Vault home">
          <span className="brand-mark">V</span>
          <span>
            <strong>Character Vault</strong>
            <small>Local campaign companion</small>
          </span>
        </a>

        <nav className="primary-nav" aria-label="Main navigation">
          {pages.map((page) => (
            <a
              className={currentPage === page.id ? "nav-link active" : "nav-link"}
              href={`#${page.id}`}
              key={page.id}
            >
              <span className="nav-icon" aria-hidden="true">{page.icon}</span>
              {page.label}
            </a>
          ))}
        </nav>

        <div className="local-status">
          <span className="status-dot" />
          <span><strong>Local only</strong><small>Your data stays on this device.</small></span>
        </div>
      </aside>

      <main className="main-content">{children}</main>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {pages.map((page) => (
          <a
            className={currentPage === page.id ? "bottom-nav-link active" : "bottom-nav-link"}
            href={`#${page.id}`}
            key={page.id}
          >
            <span aria-hidden="true">{page.icon}</span>
            {page.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
