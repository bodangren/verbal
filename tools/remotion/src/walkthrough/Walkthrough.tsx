import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { DURATION_IN_FRAMES, FPS, SECTIONS } from "./data";

const ACCENT = "#7c6cf0";

const LowerThird: React.FC<{
  index: number;
  total: number;
  title: string;
  caption: string;
}> = ({ index, total, title, caption }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const appear = spring({ frame, fps, config: { damping: 200 } });
  const leave = interpolate(
    frame,
    [durationInFrames - 14, durationInFrames - 3],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(appear, leave);
  const offset = interpolate(appear, [0, 1], [26, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        bottom: 52,
        display: "flex",
        gap: 16,
        alignItems: "stretch",
        opacity,
        transform: `translateY(${offset}px)`,
        fontFamily: "Inter, Ubuntu, sans-serif",
      }}
    >
      <div style={{ width: 5, borderRadius: 3, background: ACCENT }} />
      <div
        style={{
          background: "rgba(16, 16, 20, 0.84)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: "16px 24px 18px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
          maxWidth: 720,
        }}
      >
        <div
          style={{
            color: ACCENT,
            fontSize: 15,
            letterSpacing: 2.4,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          {String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
        <div style={{ color: "#f4f4f7", fontSize: 30, fontWeight: 650, lineHeight: 1.15 }}>
          {title}
        </div>
        <div style={{ color: "#a9a9b8", fontSize: 18, marginTop: 8, lineHeight: 1.35 }}>
          {caption}
        </div>
      </div>
    </div>
  );
};

const IntroCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 200 } });
  const exit = interpolate(
    frame,
    [durationInFrames - 26, durationInFrames - 6],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(enter, exit);
  const lift = interpolate(enter, [0, 1], [18, 0]);

  return (
    <AbsoluteFill
      style={{
        background: "rgba(8, 8, 12, 0.72)",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        fontFamily: "Inter, Ubuntu, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", transform: `translateY(${lift}px)` }}>
        <div style={{ color: ACCENT, fontSize: 18, letterSpacing: 5, fontWeight: 700 }}>
          VERBAL
        </div>
        <div style={{ color: "#ffffff", fontSize: 68, fontWeight: 700, marginTop: 10 }}>
          A walkthrough
        </div>
        <div style={{ color: "#a9a9b8", fontSize: 23, marginTop: 14 }}>
          Edit the video by editing its transcript — all local
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 4,
        background: "rgba(255,255,255,0.10)",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${(frame / DURATION_IN_FRAMES) * 100}%`,
          background: ACCENT,
        }}
      />
    </div>
  );
};

export const Walkthrough: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#08080c" }}>
      <OffthreadVideo src={staticFile("walkthrough/screen.mp4")} muted />

      {SECTIONS.map((section, index) => (
        <Sequence
          key={section.id}
          from={section.from}
          durationInFrames={section.frames}
          name={`${section.id} ${section.title}`}
        >
          <Audio
            src={staticFile(`walkthrough/vo/${section.id}.mp3`)}
            playbackRate={section.tempo}
          />
          {index > 0 && (
            <LowerThird
              index={index + 1}
              total={SECTIONS.length}
              title={section.title}
              caption={section.caption}
            />
          )}
        </Sequence>
      ))}

      <Sequence from={0} durationInFrames={Math.round(3.6 * FPS)} name="Intro">
        <IntroCard />
      </Sequence>

      <ProgressBar />
    </AbsoluteFill>
  );
};
