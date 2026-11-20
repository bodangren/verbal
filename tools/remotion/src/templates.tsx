import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export type SceneProps = {
  durationSeconds: number;
  fps: number;
  width: number;
  height: number;
  title?: string;
  subtitle?: string;
  bullets?: string[];
  quote?: string;
  attribution?: string;
  code?: string;
  language?: string;
  name?: string;
  role?: string;
};

const FONT = "Inter, system-ui, -apple-system, sans-serif";
const MONO = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';
const TEXT = "#F5F5F5";
const MUTED = "#A0A0A0";
const ACCENT = "#6366F1";

function fadeIn(frame: number, fps: number, delay = 0): number {
  const progress = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return interpolate(progress, [0, 1], [0, 1], { extrapolateLeft: "clamp" });
}

function rise(frame: number, fps: number, delay = 0): string {
  const progress = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return `translateY(${interpolate(progress, [0, 1], [28, 0])}px)`;
}

/** Big centered title. No background: the frame stays transparent for keying. */
export const Title: React.FC<SceneProps> = ({ title = "Title", subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        color: TEXT,
        fontFamily: FONT,
        justifyContent: "center",
        opacity: fadeIn(frame, fps),
        transform: rise(frame, fps),
      }}
    >
      <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.02em" }}>{title}</div>
      {subtitle !== undefined && (
        <div style={{ color: MUTED, fontSize: 36, marginTop: 16 }}>{subtitle}</div>
      )}
    </AbsoluteFill>
  );
};

/** Section break: a numbered marker plus a heading. */
export const Section: React.FC<SceneProps> = ({ title = "Section", subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        alignItems: "flex-start",
        color: TEXT,
        fontFamily: FONT,
        justifyContent: "center",
        padding: "0 160px",
      }}
    >
      <div
        style={{
          background: ACCENT,
          borderRadius: 6,
          height: 6,
          marginBottom: 32,
          opacity: fadeIn(frame, fps),
          width: interpolate(fadeIn(frame, fps, 6), [0, 1], [0, 160]),
        }}
      />
      <div
        style={{
          fontSize: 72,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          opacity: fadeIn(frame, fps, 6),
          transform: rise(frame, fps, 6),
        }}
      >
        {title}
      </div>
      {subtitle !== undefined && (
        <div style={{ color: MUTED, fontSize: 32, marginTop: 16 }}>{subtitle}</div>
      )}
    </AbsoluteFill>
  );
};

/** Staggered bullet reveal. */
export const Bullets: React.FC<SceneProps> = ({ title, bullets = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        color: TEXT,
        fontFamily: FONT,
        justifyContent: "center",
        padding: "0 160px",
      }}
    >
      {title !== undefined && (
        <div style={{ fontSize: 54, fontWeight: 700, marginBottom: 40 }}>{title}</div>
      )}
      {bullets.map((bullet, index) => (
        <div
          key={bullet}
          style={{
            alignItems: "baseline",
            display: "flex",
            fontSize: 40,
            gap: 20,
            marginBottom: 20,
            opacity: fadeIn(frame, fps, 8 + index * 6),
            transform: rise(frame, fps, 8 + index * 6),
          }}
        >
          <span
            style={{
              background: ACCENT,
              borderRadius: 999,
              display: "inline-block",
              height: 12,
              width: 12,
            }}
          />
          <span>{bullet}</span>
        </div>
      ))}
    </AbsoluteFill>
  );
};

/** Large pull quote. */
export const Quote: React.FC<SceneProps> = ({ quote = "", attribution }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        color: TEXT,
        fontFamily: FONT,
        justifyContent: "center",
        padding: "0 180px",
      }}
    >
      <div style={{ color: ACCENT, fontSize: 120, lineHeight: 0.6 }}>“</div>
      <div
        style={{
          fontSize: 56,
          fontWeight: 600,
          lineHeight: 1.25,
          opacity: fadeIn(frame, fps, 4),
          transform: rise(frame, fps, 4),
        }}
      >
        {quote}
      </div>
      {attribution !== undefined && (
        <div style={{ color: MUTED, fontSize: 30, marginTop: 32 }}>— {attribution}</div>
      )}
    </AbsoluteFill>
  );
};

/** Monospace code walkthrough, one line at a time. */
export const Code: React.FC<SceneProps> = ({ code = "", language }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = code.split("\n");

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#111114",
        color: TEXT,
        fontFamily: MONO,
        justifyContent: "center",
        padding: "0 120px",
      }}
    >
      {language !== undefined && (
        <div style={{ color: MUTED, fontSize: 24, letterSpacing: "0.08em", marginBottom: 24 }}>
          {language.toUpperCase()}
        </div>
      )}
      {lines.map((line, index) => (
        <div
          key={`${index}-${line}`}
          style={{
            fontSize: 34,
            lineHeight: 1.6,
            opacity: fadeIn(frame, fps, index * 4),
            whiteSpace: "pre",
          }}
        >
          {line === "" ? " " : line}
        </div>
      ))}
    </AbsoluteFill>
  );
};

/** Bottom-left name plate. */
export const LowerThird: React.FC<SceneProps> = ({ name = "", role }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = fadeIn(frame, fps, 4);

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <div
        style={{
          background: "rgba(30, 30, 30, 0.92)",
          borderLeft: `4px solid ${ACCENT}`,
          bottom: 80,
          left: 80,
          opacity: enter,
          padding: "20px 28px",
          position: "absolute",
          transform: `translateX(${interpolate(enter, [0, 1], [-24, 0])}px)`,
        }}
      >
        <div style={{ color: TEXT, fontSize: 32, fontWeight: 600 }}>{name}</div>
        {role !== undefined && (
          <div style={{ color: MUTED, fontSize: 22, marginTop: 4 }}>{role}</div>
        )}
      </div>
    </AbsoluteFill>
  );
};
