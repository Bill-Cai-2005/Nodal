import type { ReactNode } from "react";

/**
 * Turns `**like this**` into bold segments; text without markers is unchanged.
 * An unclosed `**` is shown literally from that point onward.
 */
export function parseStockDescriptionRichText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const open = text.indexOf("**", i);
    if (open === -1) {
      nodes.push(text.slice(i));
      break;
    }
    if (open > i) {
      nodes.push(text.slice(i, open));
    }
    const close = text.indexOf("**", open + 2);
    if (close === -1) {
      nodes.push(text.slice(open));
      break;
    }
    const inner = text.slice(open + 2, close);
    nodes.push(<strong key={`sd-bold-${key++}`}>{inner}</strong>);
    i = close + 2;
  }
  return nodes;
}
