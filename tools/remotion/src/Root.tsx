import { Composition } from "remotion";
import {
  Bullets,
  Code,
  LowerThird,
  Quote,
  Section,
  Title,
  type SceneProps,
} from "./templates";

const DEFAULT_PROPS: SceneProps = {
  durationSeconds: 3,
  fps: 30,
  width: 1920,
  height: 1080,
};

const TEMPLATES = {
  title: Title,
  section: Section,
  bullets: Bullets,
  quote: Quote,
  code: Code,
  "lower-third": LowerThird,
} as const;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {Object.entries(TEMPLATES).map(([id, Component]) => (
        <Composition
          key={id}
          id={id}
          component={Component}
          durationInFrames={90}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={DEFAULT_PROPS}
        />
      ))}
    </>
  );
};
