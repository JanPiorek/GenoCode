// Colours written out in the text, for editors to show swatches and colour pickers beside them:
// `hsv(…)` and `rgb(…)` with plain numbers, hex colours and colour names (section 13.1).

import { hexColour, hsv, NAMED_COLOURS, rgb, toRgb } from "./colour.js";
import { lex, type Token } from "./lexer.js";
import type { Span } from "./source.js";
import type { Colour } from "./values.js";

export type ColourForm = "hsv" | "rgb" | "hex" | "name";

export interface ColourLiteral {
  span: Span;
  colour: Colour;
  /** How it's written, so a picked colour can be written back the same way. */
  form: ColourForm;
  /** Written with an alpha: a fourth number, or eight hex digits. */
  alpha: boolean;
}

/** Every colour in the text that's written out in full. */
export function colourLiterals(text: string): ColourLiteral[] {
  const tokens = lex(text).tokens.filter((t) => t.kind !== "newline");
  const out: ColourLiteral[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const after = tokens[i - 1]?.text === ".";
    if (t.kind === "hex") {
      try {
        out.push({
          span: t.span,
          colour: hexColour(t.text),
          form: "hex",
          alpha: t.text.length === 9,
        });
      } catch {
        // Not 6 or 8 digits: the checker reports it.
      }
    } else if (t.kind === "name" && !after && NAMED_COLOURS.has(t.text)) {
      out.push({ span: t.span, colour: NAMED_COLOURS.get(t.text)!, form: "name", alpha: false });
    } else if (t.kind === "name" && !after && (t.text === "hsv" || t.text === "rgb")) {
      const numbers = callOfNumbers(tokens, i);
      if (!numbers) continue;
      const { values, end } = numbers;
      if (values.length !== 3 && values.length !== 4) continue;
      const [x, y, z, a] = values as [number, number, number, number | undefined];
      out.push({
        span: { start: t.span.start, end },
        colour: t.text === "hsv" ? hsv(x, y, z, a) : rgb(x, y, z, a),
        form: t.text,
        alpha: values.length === 4,
      });
    }
  }
  return out;
}

/** `name(1, 0.5, -2)` at `tokens[i]`: the numbers and where the `)` ends, if it's only numbers. */
function callOfNumbers(
  tokens: readonly Token[],
  i: number,
): { values: number[]; end: number } | undefined {
  if (tokens[i + 1]?.text !== "(") return undefined;
  const values: number[] = [];
  let k = i + 2;
  for (;;) {
    const minus = tokens[k]?.text === "-";
    if (minus) k++;
    const n = tokens[k];
    if (n?.kind !== "number") return undefined;
    values.push(minus ? -n.value! : n.value!);
    const next = tokens[k + 1];
    if (next?.text === ")") return { values, end: next.span.end };
    if (next?.text !== ",") return undefined;
    k += 2;
  }
}

const round = (x: number, places: number) => Number(x.toFixed(places));

/** A colour written in a form, with its alpha if `alpha` is set or it isn't fully opaque. */
export function writeColour(colour: Colour, form: ColourForm, alpha = false): string | undefined {
  const withAlpha = alpha || colour.a < 1;
  const a = withAlpha ? `, ${round(colour.a, 3)}` : "";
  switch (form) {
    case "hsv":
      return `hsv(${round(colour.h, 1)}, ${round(colour.s, 3)}, ${round(colour.v, 3)}${a})`;
    case "rgb":
      return `rgb(${toRgb(colour)
        .map((c) => round(c, 3))
        .join(", ")}${a})`;
    case "hex": {
      const bytes = [...toRgb(colour), ...(withAlpha ? [colour.a] : [])];
      return (
        "#" +
        bytes
          .map((c) =>
            Math.round(c * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")
      );
    }
    case "name": {
      const hex = writeColour(colour, "hex", true);
      for (const [name, c] of NAMED_COLOURS) {
        if (writeColour(c, "hex", true) === hex) return name;
      }
      return undefined;
    }
  }
}
