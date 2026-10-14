// Positions in source text, and the problems reported against them.

/** A range of the source text, as character offsets: `start` is included, `end` is not. */
export interface Span {
  start: number;
  end: number;
}

export type Severity = "error" | "warning";

export interface Diagnostic {
  severity: Severity;
  message: string;
  span: Span;
}

/** A 1-based line and column. */
export interface Position {
  line: number;
  column: number;
}

export function span(start: number, end: number): Span {
  return { start, end };
}

export function join(a: Span, b: Span): Span {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

/** Converts offsets into lines and columns. */
export class LineMap {
  private readonly starts: number[] = [0];

  constructor(text: string) {
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) this.starts.push(i + 1);
    }
  }

  /** The 0-based line that contains `offset`. */
  line(offset: number): number {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  position(offset: number): Position {
    const line = this.line(offset);
    return { line: line + 1, column: offset - this.starts[line]! + 1 };
  }
}

/** `file:line:column: error: message`, the usual compiler layout. */
export function formatDiagnostic(d: Diagnostic, lines: LineMap, fileName: string): string {
  const p = lines.position(d.span.start);
  return `${fileName}:${p.line}:${p.column}: ${d.severity}: ${d.message}`;
}
