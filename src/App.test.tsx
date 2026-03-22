import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

vi.mock("./components/WebcamRecorder", () => ({
  WebcamRecorder: () => <div data-testid="webcam-recorder">Webcam Recorder</div>,
}));

vi.mock("./api/video", () => ({
  saveVideoRecording: vi.fn(),
}));

describe("App", () => {
  it("renders the app without crashing", () => {
    render(<App />);
    expect(screen.getByText("Verbal")).toBeDefined();
  });

  it("renders the webcam recorder component", () => {
    render(<App />);
    expect(screen.getByTestId("webcam-recorder")).toBeDefined();
  });
});
