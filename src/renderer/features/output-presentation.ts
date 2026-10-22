import type { TimelineItem } from './session-model';
import { toolLabel } from './tool-label';
export type OutputBlock = { kind: 'message'; item: TimelineItem } | { kind: 'tools'; items: TimelineItem[] };
export function outputBlocks(items: TimelineItem[]): OutputBlock[] {
  const blocks: OutputBlock[] = [];
  for (const item of items) {
    const last = blocks.at(-1);
    if (item.role !== 'tool') blocks.push({ kind: 'message', item });
    else if (last?.kind === 'tools') last.items.push(item);
    else blocks.push({ kind: 'tools', items: [item] });
  }
  return blocks;
}
export function toolPresentation(item: TimelineItem) {
  const name = item.title ?? '工具结果';
  let preview = '';
  try { const value = JSON.parse(item.text); const candidate = value.file_path ?? value.path ?? value.command ?? value.query ?? value.url; if (typeof candidate === 'string') preview = candidate; } catch { /* Raw output remains available. */ }
  return { label: toolLabel(name), preview };
}
