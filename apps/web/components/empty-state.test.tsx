// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renders a New Project button that calls the handler", () => {
    const onClick = vi.fn();

    render(
      <EmptyState
        title="No Project Open"
        body="Pick a project in the browser, or create one in the folder you are browsing."
        action={{ label: "New Project", onClick }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New Project" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders title and body with no button when it has no action", () => {
    render(
      <EmptyState
        title="No Project Open"
        body="Pick a project in the browser, or create one in the folder you are browsing."
      />,
    );

    expect(screen.getByText("No Project Open")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
