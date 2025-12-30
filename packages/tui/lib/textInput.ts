export interface TextCursorResult {
  text: string;
  cursor: number;
}

export interface DisplayTextResult {
  displayText: string;
  displayCursorPos: number;
}

export function insertTextAtCursor(
  text: string,
  cursorPos: number,
  toInsert: string,
  limit: number,
): TextCursorResult {
  const remaining = limit - text.length;
  if (remaining <= 0) return { text, cursor: cursorPos };

  const insertText = toInsert.slice(0, remaining);
  const newText = text.slice(0, cursorPos) + insertText + text.slice(cursorPos);
  return { text: newText, cursor: cursorPos + insertText.length };
}

export function deleteCharAtCursor(text: string, cursorPos: number): TextCursorResult {
  if (cursorPos <= 0) return { text, cursor: cursorPos };
  const newText = text.slice(0, cursorPos - 1) + text.slice(cursorPos);
  return { text: newText, cursor: cursorPos - 1 };
}

export function deleteWordBackward(text: string, cursorPos: number): TextCursorResult {
  if (cursorPos <= 0) return { text, cursor: cursorPos };

  let newPos = cursorPos;
  while (newPos > 0 && text[newPos - 1] === " ") {
    newPos--;
  }
  while (newPos > 0 && text[newPos - 1] !== " ") {
    newPos--;
  }

  const newText = text.slice(0, newPos) + text.slice(cursorPos);
  return { text: newText, cursor: newPos };
}

export function getDisplayTextWithCursor(
  text: string,
  cursorPos: number,
  maxWidth: number = 38,
): DisplayTextResult {
  if (text.length <= maxWidth) {
    return { displayText: text, displayCursorPos: cursorPos };
  }

  const halfWidth = Math.floor((maxWidth - 3) / 2);
  let start = Math.max(0, cursorPos - halfWidth);
  const end = Math.min(text.length, start + maxWidth - 3);

  if (end - start < maxWidth - 3) {
    start = Math.max(0, end - (maxWidth - 3));
  }

  let displayText = text.slice(start, end);
  let displayCursorPos = cursorPos - start;

  if (start > 0) {
    displayText = `...${displayText.slice(3)}`;
    displayCursorPos = Math.max(3, displayCursorPos);
  }
  if (end < text.length) {
    displayText = `${displayText.slice(0, -3)}...`;
  }

  return { displayText, displayCursorPos };
}
