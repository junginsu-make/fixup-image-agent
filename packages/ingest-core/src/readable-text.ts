const TARGET_PARAGRAPH_LENGTH = 260;
const MAX_PARAGRAPH_LENGTH = 420;

function groupLines(block: string): string[] {
  const lines = block.split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (lines.length <= 1) return lines;
  const paragraphs: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + 1 + line.length > MAX_PARAGRAPH_LENGTH) {
      paragraphs.push(current);
      current = line;
      continue;
    }
    current = current ? `${current} ${line}` : line;
    if (current.length >= TARGET_PARAGRAPH_LENGTH && /[.!?。！？]$/.test(current)) {
      paragraphs.push(current);
      current = "";
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

export function toReadableParagraphs(input: string): string[] {
  return input.trim().split(/\n\s*\n+/).flatMap(groupLines).filter(Boolean);
}
