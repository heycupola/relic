export function wrapLine(line: string, maxWidth: number): string[] {
  if (line.length <= maxWidth) {
    return [line];
  }

  const result: string[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    if (remaining.length <= maxWidth) {
      result.push(remaining);
      break;
    }

    let breakPoint = maxWidth;
    const segment = remaining.slice(0, maxWidth + 1);
    const lastSpace = segment.lastIndexOf(" ");

    if (lastSpace > 0 && lastSpace < maxWidth) {
      breakPoint = lastSpace;
    }

    result.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return result;
}

export function mapCursorToWrappedLines(
  lines: string[],
  cursor: { line: number; column: number },
  maxWidth: number,
): {
  wrappedLine: number;
  wrappedColumn: number;
  allWrappedLines: string[];
} {
  const allWrappedLines: string[] = [];
  let wrappedLine = 0;
  let wrappedColumn = cursor.column;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || "";
    const wrapped = wrapLine(line, maxWidth);

    if (i < cursor.line) {
      wrappedLine += wrapped.length;
      allWrappedLines.push(...wrapped);
    } else if (i === cursor.line) {
      let charCount = 0;
      for (let j = 0; j < wrapped.length; j++) {
        const wrappedSegment = wrapped[j] || "";
        if (charCount + wrappedSegment.length >= cursor.column) {
          wrappedColumn = cursor.column - charCount;
          break;
        }
        charCount += wrappedSegment.length;
        wrappedLine++;
      }
      allWrappedLines.push(...wrapped);
    } else {
      allWrappedLines.push(...wrapped);
    }
  }

  return { wrappedLine, wrappedColumn, allWrappedLines };
}
