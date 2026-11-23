// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaneAlert, type PaneAlertProps } from "./PaneAlert";

afterEach(cleanup);

function setup(overrides: Partial<PaneAlertProps> = {}) {
  const props: PaneAlertProps = {
    message: "That folder could not be opened. Use Home or Up to keep browsing.",
    detail: "no folder at /tmp/gone",
    onDismiss: vi.fn(),
    ...overrides,
  };

  render(<PaneAlert {...props} />);
  return props;
}

describe("PaneAlert", () => {
  it("shows the next step and the raw detail", () => {
    setup();

    expect(screen.getByRole("alert").textContent).toContain("Home or Up");
    expect(screen.getByText("no folder at /tmp/gone")).toBeTruthy();
  });

  it("dismisses", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("repeats the failed action when one is given", () => {
    const retry = vi.fn();
    setup({ action: { label: "Try Again", onClick: retry } });

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
