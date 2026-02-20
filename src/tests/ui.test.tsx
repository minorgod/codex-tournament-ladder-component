import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { DemoApp } from "@/demo/DemoApp";

describe("UI smoke", () => {
  it("opens match details on match click", async () => {
    render(<DemoApp />);
    const buttons = await screen.findAllByRole("button");
    const matchButton = buttons.find((b) => b.getAttribute("aria-label")?.includes("Status"));
    expect(matchButton).toBeDefined();
    if (!matchButton) {
      return;
    }

    fireEvent.click(matchButton);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("supports keyboard navigation", async () => {
    render(<DemoApp />);
    const navSurface = await screen.findByLabelText("Bracket graph keyboard navigation");
    navSurface.focus();
    fireEvent.keyDown(navSurface, { key: "ArrowRight" });
    fireEvent.keyDown(navSurface, { key: "Enter" });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("toggles theme", async () => {
    render(<DemoApp />);
    const button = await screen.findByRole("button", { name: /Theme:/i });
    const themeRoot = button.closest("[data-theme]");
    const before = themeRoot?.getAttribute("data-theme");
    fireEvent.click(button);
    const after = themeRoot?.getAttribute("data-theme");
    expect(before).not.toEqual(after);
  });

  it("supports zoom/pan interactions", async () => {
    render(<DemoApp />);
    const navSurface = await screen.findByLabelText("Bracket graph keyboard navigation");
    const surface = navSurface.querySelector(".tlc-surface") as HTMLDivElement;
    expect(surface).toBeTruthy();

    fireEvent.wheel(surface, { deltaY: -100 });
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { clientX: 140, clientY: 130 });
    fireEvent.pointerUp(surface, { clientX: 140, clientY: 130 });

    expect(surface).toBeInTheDocument();
  });

  it("renders without exploding for large counts (virtualization smoke)", async () => {
    render(<DemoApp />);
    expect(await screen.findByText(/Admin/i)).toBeInTheDocument();
    expect(await screen.findByLabelText("Bracket graph keyboard navigation")).toBeInTheDocument();
  });
});
