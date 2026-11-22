import { Composition } from "remotion";
import { Walkthrough } from "./Walkthrough";
import { DURATION_IN_FRAMES, FPS } from "./data";

export const WalkthroughRoot: React.FC = () => (
  <Composition
    id="Walkthrough"
    component={Walkthrough}
    durationInFrames={DURATION_IN_FRAMES}
    fps={FPS}
    width={1280}
    height={800}
  />
);
