import { StudioOverlay } from "./StudioOverlay";
import { useStudio, type StudioDeps } from "../hooks/use-studio";

/**
 * Mounts the Studio subtree: `useStudio` owns every piece of capture and
 * prompter state, so a prompter tick re-renders only this subtree, never Home.
 * Home stays mounted regardless; this returns null until the Studio opens.
 */
export function StudioHost({ deps }: { deps: StudioDeps }) {
  const studio = useStudio(deps);

  if (!deps.open) {
    return null;
  }

  return (
    <StudioOverlay
      projectName={deps.projectName}
      script={deps.script}
      words={deps.words}
      readTime={deps.readTime}
      offsetWords={studio.prompter.offsetWords}
      wpm={studio.prompter.wpm}
      fontSize={studio.prompter.fontSize}
      mirror={studio.prompter.mirror}
      playing={studio.prompter.playing}
      reducedMotion={deps.reducedMotion}
      videoRef={studio.videoRef}
      capture={studio.capture}
      review={studio.review}
      reviewing={studio.reviewing}
      reviewLlm={studio.reviewLlm}
      dimmedBeatIds={studio.dimmedBeatIds}
      cut={studio.cut ?? undefined}
      onBuildCut={studio.onBuildCut}
      rendering={studio.rendering}
      onRenderCut={studio.onRenderCut}
      error={deps.paneError?.copy ?? null}
      onDismissError={deps.onDismissError}
      takeUrl={`/api/media/file?root=${encodeURIComponent(deps.root)}`}
      onReview={studio.onReview}
      onReread={studio.onReread}
      onStatusChange={studio.onStatusChange}
      onSeek={studio.onSeek}
      onClose={studio.close}
      onScriptChange={deps.onScriptChange}
      onUseTranscript={deps.onUseTranscript}
      onTogglePlay={studio.onTogglePlay}
      onWpmChange={studio.onWpmChange}
      onFontSizeChange={studio.onFontSizeChange}
      onToggleMirror={studio.onToggleMirror}
      onReset={studio.onReset}
    />
  );
}
