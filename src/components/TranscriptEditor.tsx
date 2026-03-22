import { useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  id: string;
  words: TranscriptWord[];
}

export interface TranscriptEditorProps {
  transcript?: TranscriptSegment[];
  currentTime?: number;
  placeholder?: string;
  showToolbar?: boolean;
  className?: string;
  onChange?: (content: string) => void;
}

function transcriptToText(transcript: TranscriptSegment[]): string {
  return transcript
    .map((segment) => segment.words.map((w) => w.word).join(" "))
    .join("\n\n");
}

export function TranscriptEditor({
  transcript,
  currentTime = 0,
  placeholder = "Start typing your transcript...",
  showToolbar = true,
  className = "",
  onChange,
}: TranscriptEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: transcript ? transcriptToText(transcript) : "",
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none min-h-[200px] p-4",
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getText());
    },
  });

  useEffect(() => {
    if (editor && transcript) {
      editor.commands.setContent(transcriptToText(transcript));
    }
  }, [editor, transcript]);

  const isWordHighlighted = useCallback(
    (_word: TranscriptWord): boolean => {
      return currentTime >= _word.start && currentTime <= _word.end;
    },
    [currentTime]
  );

  void isWordHighlighted;

  if (!editor) {
    return null;
  }

  return (
    <div className={`transcript-editor ${className}`}>
      {showToolbar && (
        <div
          role="toolbar"
          className="flex gap-2 p-2 border-b border-gray-700"
        >
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-3 py-1 rounded ${
              editor.isActive("bold")
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Bold
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-3 py-1 rounded ${
              editor.isActive("italic")
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Italic
          </button>
        </div>
      )}
      <div className="relative">
        {editor.isEmpty && (
          <div className="absolute top-4 left-4 text-gray-500 pointer-events-none">
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
