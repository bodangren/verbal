import { useState } from "react";
import { WebcamRecorder } from "./components/WebcamRecorder";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./App.css";

function App() {
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRecordingComplete = (path: string) => {
    setError(null);
    setSavedPath(path);
  };

  return (
    <ErrorBoundary>
      <main className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto py-8">
          <h1 className="text-3xl font-bold text-center mb-8">Verbal</h1>
          <WebcamRecorder onRecordingComplete={handleRecordingComplete} />
          {savedPath && (
            <div className="mt-4 text-center text-green-400">
              Recording saved to: {savedPath}
            </div>
          )}
          {error && (
            <div className="mt-4 text-center text-red-400">
              Error: {error}
            </div>
          )}
        </div>
      </main>
    </ErrorBoundary>
  );
}

export default App;
