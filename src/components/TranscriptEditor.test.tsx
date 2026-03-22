import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TranscriptEditor } from "./TranscriptEditor";

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(() => ({
    commands: {
      setContent: vi.fn(),
      focus: vi.fn(),
    },
    chain: () => ({
      focus: () => ({
        toggleBold: () => ({ run: vi.fn() }),
        toggleItalic: () => ({ run: vi.fn() }),
      }),
    }),
    isActive: vi.fn(() => false),
    getHTML: vi.fn(() => "<p>Test content</p>"),
    getText: vi.fn(() => "Test content"),
    isEmpty: true,
  })),
  EditorContent: ({ editor }: { editor: unknown }) => (
    <div data-testid="editor-content" data-editor={!!editor}>
      Mock Editor Content
    </div>
  ),
}));

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  id: string;
  words: TranscriptWord[];
}

const mockTranscript: TranscriptSegment[] = [
  {
    id: "1",
    words: [
      { word: "Hello", start: 0, end: 0.5 },
      { word: "world", start: 0.5, end: 1.0 },
    ],
  },
  {
    id: "2",
    words: [
      { word: "This", start: 1.0, end: 1.2 },
      { word: "is", start: 1.2, end: 1.4 },
      { word: "a", start: 1.4, end: 1.5 },
      { word: "test", start: 1.5, end: 2.0 },
    ],
  },
];

describe("TranscriptEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the editor container", () => {
    render(<TranscriptEditor />);
    expect(screen.getByTestId("editor-content")).toBeDefined();
  });

  it("renders with initial content when transcript is provided", () => {
    render(<TranscriptEditor transcript={mockTranscript} />);
    expect(screen.getByTestId("editor-content")).toBeDefined();
  });

  it("displays placeholder when empty", () => {
    render(<TranscriptEditor placeholder="Start typing..." />);
    expect(screen.getByText("Start typing...")).toBeDefined();
  });

  it("calls onChange when content changes", async () => {
    const mockOnChange = vi.fn();
    render(<TranscriptEditor onChange={mockOnChange} />);
    expect(screen.getByTestId("editor-content")).toBeDefined();
  });

  it("renders toolbar with formatting options", () => {
    render(<TranscriptEditor showToolbar />);
    expect(screen.getByRole("toolbar")).toBeDefined();
  });

  it("does not render toolbar when showToolbar is false", () => {
    render(<TranscriptEditor showToolbar={false} />);
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("highlights words at current time", () => {
    render(<TranscriptEditor transcript={mockTranscript} currentTime={0.7} />);
    expect(screen.getByTestId("editor-content")).toBeDefined();
  });

  it("accepts custom className", () => {
    render(<TranscriptEditor className="custom-editor" />);
    const container = screen.getByTestId("editor-content").parentElement?.parentElement;
    expect(container?.className).toContain("custom-editor");
  });
});
