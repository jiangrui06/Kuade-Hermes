# Reply formatting and code copying

[简体中文](REPLIES.zh-CN.md) · [繁體中文](REPLIES.zh-TW.md)

0.1.13 renders assistant Markdown headings, paragraphs, nested lists, read-only task lists, tables, quotes, inline code and code blocks. Each block includes a language label and copy button, preserving indentation, Chinese text and blank lines. Clipboard errors allow retry. Long code and wide tables scroll within their containers.

Live streams and persisted messages use the same component. A copy result from an earlier streaming revision cannot mark newer code as copied. User messages and tool results retain their original text. Presentation does not modify Harness records, task state or model requests.

HTTP/HTTPS links open through the desktop bridge after main-process validation. Other paths remain text; local-file navigation is not implemented here. Raw HTML is not executed, and remote images become alternative text without automatic requests. Language labels are provided; syntax highlighting is not part of this version.

## Reuse and validation

The implementation uses [react-markdown 10.1.0](https://github.com/remarkjs/react-markdown) and [remark-gfm 4.0.1](https://github.com/remarkjs/remark-gfm), both MIT. React-markdown supports React 18 and newer and fits the current React 19, Vite and ESM build. Versions and transitive dependencies are locked, and attribution is included. No raw-HTML plugin is enabled.

`MessageMarkdown.tsx` and its stylesheet own presentation; `message-url.ts` shares URL validation across renderer and main. Clipboard and link actions use the existing IPC bridge and Electron APIs, with no new agent tools or scheduler.

125 application tests, 22 acceptance-tool tests, type checking and build passed. Eight added tests cover formatting, copying, failures and retry, streaming races, protocol validation, HTML/image handling, and saved/live message integration.

The real Electron workflow uses a controlled local SSE provider to verify unfinished code fences, the actual system clipboard, a narrow window and the same persisted reply after relaunch without another model request. Link acceptance exercises IPC with the OS opener stubbed; it does not claim a real external-browser launch. Original clipboard formats are kept only in memory and restored. The isolated profile does not read user credentials. See the [release and acceptance receipt](acceptance/replies-0.1.13-2026-10-22.json).
