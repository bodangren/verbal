import path from "node:path";

export type AsrResolution =
  | { mode: "cloud"; language?: string }
  | { mode: "none"; missing: "binary" | "model" | "both" }
  | {
      mode: "local";
      binary: string;
      modelPath: string;
      modelName: string;
      language: string;
    }
  | {
      mode: "typhoon";
      modelDir: string;
      language: string;
    };

/** Every environment and file-system read is supplied by the caller. */
export type AsrResolveInput = {
  dataDir: string;
  env: Readonly<Record<string, string | undefined>>;
  exists: (filePath: string) => boolean;
  list: (dir: string) => readonly string[];
  onPath: (name: string) => boolean;
};

const MODEL_TIERS = ["large", "medium", "small", "base"];
const TYPHOON_FILES = ["encoder.onnx", "decoder.onnx", "vocab.json"] as const;

/** A complete Typhoon model directory, or undefined when any file is absent. */
function completeTyphoonModel(
  dataDir: string,
  env: Readonly<Record<string, string | undefined>>,
  exists: (filePath: string) => boolean,
): string | undefined {
  const configured = set(env.VERBAL_TYPHOON_MODEL);
  const dir = configured ?? path.join(dataDir, "models", "typhoon-asr-realtime");
  return TYPHOON_FILES.every((name) => exists(path.join(dir, name))) ? dir : undefined;
}

function set(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}

function modelNameOf(fileName: string): string {
  const stem = fileName.replace(/^ggml-/i, "").replace(/\.bin$/i, "");
  return stem.split(".")[0] ?? fileName;
}

function bestModel(files: readonly string[]): string | undefined {
  const candidates = files
    .filter((name) => /^ggml-.*\.bin$/i.test(name))
    .slice()
    .sort();

  for (const tier of MODEL_TIERS) {
    const match = candidates.find((name) => name.toLowerCase().includes(tier));
    if (match !== undefined) {
      return match;
    }
  }

  return candidates[0];
}

function missingOf(binary: string | undefined, model: string | undefined) {
  if (binary === undefined && model === undefined) {
    return "both" as const;
  }
  return binary === undefined ? ("binary" as const) : ("model" as const);
}

/**
 * Chooses the speech engine before any audio is read.
 *
 * Local first keeps audio on the machine. A cloud key is used only when the
 * user has no local engine and did not ask for local mode explicitly.
 */
export function resolveAsr(input: AsrResolveInput): AsrResolution {
  const { dataDir, env, exists, list, onPath } = input;

  const requestedLanguage = set(env.VERBAL_ASR_LANGUAGE);
  const normalizedLanguage = requestedLanguage?.toLowerCase();
  const cloudLanguage =
    normalizedLanguage === undefined || normalizedLanguage === "auto"
      ? undefined
      : normalizedLanguage;
  const cloud = (): AsrResolution => ({
    mode: "cloud",
    ...(cloudLanguage === undefined ? {} : { language: cloudLanguage }),
  });

  if (set(env.VERBAL_ASR) === "cloud") {
    return cloud();
  }

  const explicitLocal = set(env.VERBAL_ASR) === "local";
  const models = path.join(dataDir, "models");
  const language = requestedLanguage ?? "auto";
  const typhoonAllowed =
    requestedLanguage === undefined || requestedLanguage.toLowerCase() === "th";

  // Typhoon is a better Thai engine. An explicit non-Thai language needs
  // whisper, so the resolver never runs Thai on an English request.
  const typhoonDir = typhoonAllowed ? completeTyphoonModel(dataDir, env, exists) : undefined;
  if (typhoonDir !== undefined) {
    return { mode: "typhoon", modelDir: typhoonDir, language: "th" };
  }

  const configuredBinary = set(env.VERBAL_WHISPER_BIN);
  const installedBinary = path.join(dataDir, "bin", "whisper-cli");
  const binary =
    configuredBinary !== undefined && exists(configuredBinary)
      ? configuredBinary
      : exists(installedBinary)
        ? installedBinary
        : onPath("whisper-cli")
          ? "whisper-cli"
          : undefined;

  const configuredModel = set(env.VERBAL_WHISPER_MODEL);
  let modelPath: string | undefined;
  if (configuredModel !== undefined && exists(configuredModel)) {
    modelPath = configuredModel;
  } else {
    const chosen = bestModel(list(models));
    if (chosen !== undefined) {
      modelPath = path.join(models, chosen);
    }
  }

  if (binary !== undefined && modelPath !== undefined) {
    const fileName = configuredModel !== undefined && modelPath === configuredModel
      ? path.basename(configuredModel)
      : path.basename(modelPath);
    return {
      mode: "local",
      binary,
      modelPath,
      modelName: modelNameOf(fileName),
      language,
    };
  }

  if (!explicitLocal && set(env.OPENAI_API_KEY) !== undefined) {
    return cloud();
  }

  return { mode: "none", missing: missingOf(binary, modelPath) };
}
