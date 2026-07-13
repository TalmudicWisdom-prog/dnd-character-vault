import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsPage } from "./SettingsPage";

describe("content source settings", () => {
  it("renders the clearly labelled Final Fantasy Companion Guide toggle", () => {
    const markup = renderToStaticMarkup(createElement(SettingsPage));

    expect(markup).toContain("Optional content sources");
    expect(markup).toContain("Final Fantasy Companion Guide");
    expect(markup).toContain("Homebrew · Optional · Version 2025-02-18");
    expect(markup).toContain('aria-label="Enable Final Fantasy Companion Guide"');
  });
});
