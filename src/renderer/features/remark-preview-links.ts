import { LinkifyIt } from 'linkify-it';
import { messageWebUrl } from '../../shared/message-url';

type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[]; position?: { start: { offset?: number }; end: { offset?: number } } };
// Parse credential URLs whole so the shared validator rejects them instead of linking a prefix.
const links = new LinkifyIt({ fuzzyLink: false, fuzzyEmail: false, urlAuth: true, maxLength: 8192 });
const literalNodes = new Set(['link', 'linkReference', 'code', 'inlineCode', 'image', 'imageReference', 'html']);

/** Re-parse bare URL boundaries: GFM can consume Chinese punctuation into a port or path. */
export function remarkPreviewLinks() {
  return (tree: MarkdownNode, file: { toString(): string }) => {
    const source = String(file);
    const visit = (node: MarkdownNode) => {
      if (!node.children || literalNodes.has(node.type)) return;
      node.children = node.children.flatMap(child => {
        // Preserve explicit Markdown/angle links. Only a bare auto-link has source identical to its text.
        const label = child.children?.length === 1 ? child.children[0] : undefined;
        if (child.type === 'link' && label?.type === 'text' && /^https?:\/\//i.test(label.value ?? '')
          && child.position?.start.offset !== undefined && child.position.end.offset !== undefined
          && source.slice(child.position.start.offset, child.position.end.offset) === label.value) child = { type: 'text', value: label.value };
        if (child.type !== 'text' || !child.value) { visit(child); return [child]; }
        const text = child.value, result: MarkdownNode[] = [];
        let cursor = 0;
        for (const start of text.matchAll(/(?<![a-z0-9_])https?:\/\//gi)) {
          if (start.index < cursor) continue;
          const match = links.matchAtStart(text.slice(start.index, start.index + 8193));
          const url = match && messageWebUrl(match.url);
          if (!match || !url || url.length > 8192) continue;
          if (start.index > cursor) result.push({ type: 'text', value: text.slice(cursor, start.index) });
          result.push({ type: 'link', url, children: [{ type: 'text', value: match.raw }] });
          cursor = start.index + match.lastIndex;
        }
        if (!cursor) return [child];
        if (cursor < text.length) result.push({ type: 'text', value: text.slice(cursor) });
        return result;
      });
    };
    visit(tree);
  };
}
