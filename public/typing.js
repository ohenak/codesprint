// Skip only leading spaces/tabs; inline whitespace and line breaks are typed.
export function skipIndentation(target, position) {
  if (position !== 0 && target[position - 1] !== '\n') return position;
  while (target[position] === ' ' || target[position] === '\t') position++;
  return position;
}
export function typedCharacterCount(target) {
  return target.replace(/^[ \t]+/gm, '').length;
}

// Forced correction: incorrect keys count as errors and never advance the cursor.
export function acceptInput(target, position, input) {
  let errors = 0;
  let accepted = 0;
  position = skipIndentation(target, position);
  for (const char of input) {
    if (position >= target.length) break;
    if (char === target[position]) {
      accepted++;
      position = skipIndentation(target, position + 1);
    } else errors++;
  }
  return { position, errors, accepted };
}
export function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${Math.floor(ms % 1000 / 100)}`;
}
