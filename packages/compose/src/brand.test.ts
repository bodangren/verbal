import { describe, expect, it } from "vitest";
import { audioFromBrand, BrandError, validateBrandKit } from "./brand";

const KIT = {
  title: { text: "Verbal", subtitle: "Explained" },
  outro: { text: "Thanks for watching" },
  contact: { name: "Daniel", handle: "@daniel" },
  lowerThird: { name: "Daniel", role: "Host" },
  loudnessLufs: -16,
};

describe("validateBrandKit", () => {
  it("accepts a complete kit", () => {
    expect(validateBrandKit(KIT)).toEqual(KIT);
  });

  it("accepts music", () => {
    const kit = { ...KIT, music: { assetPath: "assets/music.mp3", volume: 0.25 } };

    expect(validateBrandKit(kit)).toEqual(kit);
  });

  it("accepts a project-relative music path with Unicode and spaces", () => {
    const kit = { ...KIT, music: { assetPath: "assets/bed one ✓.mp3", volume: 0.2 } };

    expect(validateBrandKit(kit)).toEqual(kit);
  });

  it.each([
    ["a parent-directory escape", "../../etc/passwd"],
    ["an absolute path", "/etc/passwd"],
    ["a null byte", "assets/music\0.mp3"],
  ])("rejects music with %s", (_label, assetPath) => {
    expect(() =>
      validateBrandKit({ ...KIT, music: { assetPath, volume: 0.25 } }),
    ).toThrow(BrandError);
  });

  it("rejects a missing title text", () => {
    expect(() => validateBrandKit({ ...KIT, title: {} })).toThrow(BrandError);
  });

  it("accepts an empty outro text", () => {
    expect(validateBrandKit({ ...KIT, outro: { text: "" } })).toMatchObject({
      outro: { text: "" },
    });
  });

  it("accepts an empty contact name", () => {
    expect(validateBrandKit({ ...KIT, contact: { name: "" } })).toMatchObject({
      contact: { name: "" },
    });
  });

  it("accepts an empty lower-third name", () => {
    expect(validateBrandKit({ ...KIT, lowerThird: { name: "" } })).toMatchObject({
      lowerThird: { name: "" },
    });
  });

  it("rejects a non-object contact", () => {
    expect(() => validateBrandKit({ ...KIT, contact: "nobody" })).toThrow(/contact/i);
  });

  it("rejects an out-of-range loudness target", () => {
    expect(() => validateBrandKit({ ...KIT, loudnessLufs: 3 })).toThrow(/loudness/i);
  });

  it("rejects an out-of-range music volume", () => {
    expect(() =>
      validateBrandKit({ ...KIT, music: { assetPath: "m.mp3", volume: 2 } }),
    ).toThrow(/volume/i);
  });

  it("rejects a non-object kit", () => {
    expect(() => validateBrandKit(null)).toThrow(BrandError);
  });
});

describe("audioFromBrand", () => {
  it("maps music and the loudness target", () => {
    const kit = validateBrandKit({
      ...KIT,
      music: { assetPath: "assets/music.mp3", volume: 0.3 },
    });

    expect(audioFromBrand(kit)).toEqual({
      musicInput: "assets/music.mp3",
      musicVolume: 0.3,
      loudnessLufs: -16,
    });
  });

  it("omits music when the kit has none", () => {
    expect(audioFromBrand(validateBrandKit(KIT))).toEqual({ loudnessLufs: -16 });
  });
});
