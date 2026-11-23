// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { splitBeats } from "@verbal/takes";
import { Teleprompter, type TeleprompterProps } from "./Teleprompter";

afterEach(cleanup);

function setup(overrides: Partial<TeleprompterProps> = {}) {
  const props: TeleprompterProps = {
    beats: splitBeats("First line. Second line. Third line."),
    offsetWords: 0,
    wpm: 150,
    fontSize: 40,
    mirror: false,
    playing: false,
    onTogglePlay: vi.fn(),
    onWpmChange: vi.fn(),
    onFontSizeChange: vi.fn(),
    onToggleMirror: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };

  render(<Teleprompter {...props} />);
  return props;
}

describe("Teleprompter", () => {
  it("renders the beats in a decorative scrolling view", () => {
    setup();

    expect(screen.getByRole("region", { name: "Teleprompter" }).textContent).toContain(
      "First line.",
    );
    expect(screen.getByTestId("prompter-viewport").getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("toggles play", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(props.onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it("changes speed and size within bounds", () => {
    const props = setup({ wpm: 150, fontSize: 40 });

    fireEvent.click(screen.getByRole("button", { name: "Slower" }));
    expect(props.onWpmChange).toHaveBeenCalledWith(140);

    fireEvent.click(screen.getByRole("button", { name: "Faster" }));
    expect(props.onWpmChange).toHaveBeenCalledWith(160);

    fireEvent.click(screen.getByRole("button", { name: "Smaller" }));
    expect(props.onFontSizeChange).toHaveBeenCalledWith(36);

    fireEvent.click(screen.getByRole("button", { name: "Larger" }));
    expect(props.onFontSizeChange).toHaveBeenCalledWith(44);
  });

  it("mirrors and resets", () => {
    const props = setup({ mirror: false });
    const mirror = screen.getByRole("button", { name: "Mirror" });

    expect(mirror.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(mirror);
    expect(props.onToggleMirror).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  it("handles scoped keys", () => {
    const props = setup();
    const region = screen.getByRole("region", { name: "Teleprompter" });

    fireEvent.keyDown(region, { key: " " });
    expect(props.onTogglePlay).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(region, { key: "ArrowUp" });
    expect(props.onWpmChange).toHaveBeenCalledWith(160);

    fireEvent.keyDown(region, { key: "ArrowDown" });
    expect(props.onWpmChange).toHaveBeenCalledWith(140);

    fireEvent.keyDown(region, { key: "m" });
    expect(props.onToggleMirror).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(region, { key: "Home" });
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  it("dims marked beats", () => {
    setup({ dimmedBeatIds: ["b1"] });

    const beats = screen
      .getByTestId("prompter-beats")
      .querySelectorAll("[data-beat-id]");

    expect(beats[0]?.getAttribute("data-dimmed")).toBe("false");
    expect(beats[1]?.getAttribute("data-dimmed")).toBe("true");
  });
});
