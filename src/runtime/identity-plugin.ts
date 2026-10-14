import { PRODUCT_NAME } from '../shared/branding';

export const name = 'kuade-identity';
export const inject = ['systemPrompt'];

// Use the upstream section registry: agent presets own their personas, while
// this independent section identifies the application across those presets.
interface PromptContext {
  effect(callback: () => (() => void), label: string): unknown;
  systemPrompt: {
    getSectionOrder(name: 'HARNESS_IDENTITY'): number;
    section(section: { name: string; order: number; text: string }): () => void;
  };
}
export function apply(ctx: PromptContext): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'kuade:identity',
    order: ctx.systemPrompt.getSectionOrder('HARNESS_IDENTITY'),
    text: `You are ${PRODUCT_NAME}, a coding assistant. You are interacting through the ${PRODUCT_NAME} desktop application.`,
  }), 'kuade.identity()');
}
