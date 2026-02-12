import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PollMarkdownContent } from "./poll-markdown-content";

describe("PollMarkdownContent", () => {
  test("renders markdown content with formatting", () => {
    render(<PollMarkdownContent content="**Bold** [Docs](https://example.com)" />);
    expect(screen.getByText("Bold").tagName).toBe("STRONG");
    const link = screen.getByRole("link", { name: "Docs" });
    expect(link.getAttribute("href")).toBe("https://example.com");
  });

  test("renders fallback when content is empty", () => {
    render(<PollMarkdownContent content="" fallback="_No description_" />);
    expect(screen.getByText("No description")).toBeTruthy();
  });

  test("returns nothing when both content and fallback are empty", () => {
    const { container } = render(<PollMarkdownContent content="   " fallback="" />);
    expect(container.innerHTML).toBe("");
  });
});
