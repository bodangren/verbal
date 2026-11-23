// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";

afterEach(cleanup);

function setup(overrides: Partial<Parameters<typeof TopBar>[0]> = {}) {
  const props = {
    projectName: "Alpha" as string | null,
    projectRoot: "/home/me/alpha",
    mode: "edit" as const,
    saveState: "saved" as const,
    onMode: vi.fn(),
    onExport: vi.fn(),
    ...overrides,
  };

  render(<TopBar {...props} />);
  return props;
}

describe("TopBar", () => {
  it("shows the project, save state and Export", () => {
    setup();

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("marks the current mode and switches on click", () => {
    const props = setup();

    expect(
      screen.getByRole("button", { name: "Edit" }).getAttribute("aria-current"),
    ).toBe("page");

    fireEvent.click(screen.getByRole("button", { name: "Deliver" }));
    expect(props.onMode).toHaveBeenCalledWith("deliver");
  });

  it("exports from the bar", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(props.onExport).toHaveBeenCalledTimes(1);
  });
});
