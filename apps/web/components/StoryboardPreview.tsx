import type {
  PreviewPlan,
  PreviewSceneSource,
  PreviewTier,
} from "@verbal/compose";

const SOURCE_LABEL: Record<PreviewSceneSource, string> = {
  cached: "Cached",
  render: "Rendering",
  placeholder: "Placeholder",
  asset: "Asset",
  talk: "Speaker",
};

export type StoryboardPreviewProps = {
  plan: PreviewPlan;
  tier: PreviewTier;
  onTierChange: (tier: PreviewTier) => void;
};

/**
 * Shows which scenes a preview will use and at which tier.
 *
 * This is the request surface, not the player: it makes the cheap/expensive
 * distinction visible before a render is started.
 */
export function StoryboardPreview({ plan, tier, onTierChange }: StoryboardPreviewProps) {
  return (
    <section className="preview" aria-label="Storyboard preview">
      <header className="preview__header">
        <span className="preview__version">v{plan.version}</span>
        <div className="preview__tiers" role="group" aria-label="Preview tier">
          <button
            type="button"
            className="preview__tier"
            aria-pressed={tier === "fast"}
            onClick={() => onTierChange("fast")}
          >
            Fast
          </button>
          <button
            type="button"
            className="preview__tier"
            aria-pressed={tier === "full"}
            onClick={() => onTierChange("full")}
          >
            Full
          </button>
        </div>
      </header>

      <ol className="preview__scenes">
        {plan.scenes.map((scene) => (
          <li key={scene.sceneId} className="preview__scene" data-source={scene.source}>
            <span className="preview__scene-id">{scene.sceneId}</span>
            <span className="preview__scene-source">{SOURCE_LABEL[scene.source]}</span>
            <span className="preview__scene-time">
              {scene.startSeconds.toFixed(2)}–{scene.endSeconds.toFixed(2)}s
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
