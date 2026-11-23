type Rgb = { r: number; g: number; b: number };

function parseColour(input: string): Rgb {
  const value = input.trim().toLowerCase();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);

  if (match === null) {
    throw new Error(`invalid colour: ${input}`);
  }

  const hex = match[1] ?? "";
  const full = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  const numeric = Number.parseInt(full, 16);

  return {
    r: (numeric >> 16) & 0xff,
    g: (numeric >> 8) & 0xff,
    b: numeric & 0xff,
  };
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance for an #rgb or #rrggbb colour. */
export function relativeLuminance(colour: string): number {
  const { r, g, b } = parseColour(colour);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, from 1:1 to 21:1. */
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** AA threshold: 4.5:1 for body text, 3:1 for large text. */
export function meetsAA(foreground: string, background: string, large = false): boolean {
  return contrastRatio(foreground, background) >= (large ? 3 : 4.5);
}
