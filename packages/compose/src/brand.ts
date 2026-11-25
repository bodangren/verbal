import type { CompositeAudio } from "./composite";

export type BrandTitle = {
  text: string;
  subtitle?: string;
};

export type BrandContact = {
  name: string;
  handle?: string;
  url?: string;
};

export type BrandLowerThird = {
  name: string;
  role?: string;
};

export type BrandMusic = {
  /** Project-relative path to the music bed. */
  assetPath: string;
  /** 0..1. */
  volume: number;
};

export type BrandKit = {
  title: BrandTitle;
  outro: BrandTitle;
  contact: BrandContact;
  lowerThird: BrandLowerThird;
  music?: BrandMusic;
  /** Integrated loudness target in LUFS. */
  loudnessLufs: number;
};

export type BrandErrorCode = "invalid-brand";

/** Error raised when a brand kit is incomplete or out of range. */
export class BrandError extends Error {
  readonly code: BrandErrorCode = "invalid-brand";

  constructor(message: string) {
    super(message);
    this.name = "BrandError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BrandError(`${field} is required`);
  }
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function parseTitle(value: unknown, field: string, required = true): BrandTitle {
  if (!isRecord(value)) {
    throw new BrandError(`${field} must be an object`);
  }

  const text = required
    ? requireText(value.text, `${field}.text`)
    : (optionalText(value.text) ?? "");
  const title: BrandTitle = { text };
  const subtitle = optionalText(value.subtitle);
  if (subtitle !== undefined) {
    title.subtitle = subtitle;
  }
  return title;
}

/**
 * Validates a brand kit.
 *
 * The title stays required. The outro, contact and lower third may be empty.
 */
export function validateBrandKit(value: unknown): BrandKit {
  if (!isRecord(value)) {
    throw new BrandError("brand kit must be an object");
  }

  const title = parseTitle(value.title, "title");
  const outro = parseTitle(value.outro, "outro", false);

  if (!isRecord(value.contact)) {
    throw new BrandError("contact must be an object");
  }
  const contact: BrandContact = { name: optionalText(value.contact.name) ?? "" };
  const handle = optionalText(value.contact.handle);
  const url = optionalText(value.contact.url);
  if (handle !== undefined) {
    contact.handle = handle;
  }
  if (url !== undefined) {
    contact.url = url;
  }

  if (!isRecord(value.lowerThird)) {
    throw new BrandError("lowerThird must be an object");
  }
  const lowerThird: BrandLowerThird = {
    name: optionalText(value.lowerThird.name) ?? "",
  };
  const role = optionalText(value.lowerThird.role);
  if (role !== undefined) {
    lowerThird.role = role;
  }

  const loudness = value.loudnessLufs;
  if (
    typeof loudness !== "number" ||
    !Number.isFinite(loudness) ||
    loudness < -40 ||
    loudness > 0
  ) {
    throw new BrandError("loudnessLufs must be between -40 and 0");
  }

  const kit: BrandKit = { title, outro, contact, lowerThird, loudnessLufs: loudness };

  if (value.music !== undefined && value.music !== null) {
    if (!isRecord(value.music)) {
      throw new BrandError("music must be an object");
    }
    const volume = value.music.volume;
    if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new BrandError("music.volume must be between 0 and 1");
    }
    kit.music = {
      assetPath: requireText(value.music.assetPath, "music.assetPath"),
      volume,
    };
  }

  return kit;
}

/**
 * Maps the brand's audio settings onto the composite builder's audio input.
 *
 * Keeping this in one function means the music bed and loudness target reach
 * every scene composite by construction.
 */
export function audioFromBrand(brand: BrandKit): CompositeAudio {
  return {
    ...(brand.music === undefined
      ? {}
      : { musicInput: brand.music.assetPath, musicVolume: brand.music.volume }),
    loudnessLufs: brand.loudnessLufs,
  };
}
