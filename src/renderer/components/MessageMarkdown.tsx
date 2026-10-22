import { Children, createContext, isValidElement, memo, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { messageWebUrl } from '../../shared/message-url';
import { remarkPreviewLinks } from '../features/remark-preview-links';
import './message-markdown.css';
const LiteralCode = createContext(false);

function plainText(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === 'string' || typeof child === 'number'
    ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? plainText(child.props.children) : '').join('');
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const text = plainText(children);
  const code = Children.toArray(children).find(child => isValidElement(child));
  const language = isValidElement<{ className?: string }>(code) ? code.props.className?.match(/(?:^|\s)language-([^\s]+)/)?.[1] : undefined;
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const revision = useRef(0);
  useEffect(() => { revision.current++; setState('idle'); return () => { revision.current++; }; }, [text]);
  const copy = async () => {
    const current = revision.current;
    setState('copying');
    try {
      await window.kuade.call('app/copy-text', { text });
      if (current === revision.current) setState('copied');
    } catch { if (current === revision.current) setState('error'); }
  };
  return <div className="message-code-block">
    <div className="message-code-toolbar"><span>{language ?? '代码'}</span><button type="button" disabled={state === 'copying'} onClick={() => void copy()} aria-label="复制代码">{state === 'copying' ? '正在复制…' : state === 'copied' ? '已复制' : '复制代码'}</button></div>
    <LiteralCode.Provider value={true}><pre tabIndex={0}>{children}</pre></LiteralCode.Provider>
    {state === 'error' && <span role="status" className="message-action-error">复制失败，请重试或选中代码复制。</span>}
  </div>;
}

function WebLink({ href, children }: { href?: string; children?: ReactNode }) {
  const url = messageWebUrl(href);
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [href]);
  if (!url) return <span>{children}</span>;
  return <><a href={url} title={url} onClick={event => {
    event.preventDefault(); setError(false);
    void window.kuade.call('app/open-web-link', { url }).catch(() => setError(true));
  }}><LiteralCode.Provider value={true}>{children}</LiteralCode.Provider></a>{error && <span role="status" className="message-action-error">打开链接失败，可复制链接后重试。</span>}</>;
}

function InlineCode({ children, className }: { children?: ReactNode; className?: string }) {
  const literal = useContext(LiteralCode);
  const text = plainText(children);
  const url = !literal && !className ? messageWebUrl(text) : undefined;
  const code = <code className={className}>{children}</code>;
  return url ? <WebLink href={url}>{code}</WebLink> : code;
}

const components: Components = {
  pre: CodeBlock,
  code: InlineCode,
  a: WebLink,
  // Model-supplied images must not silently trigger remote requests.
  img: ({ alt }) => <span className="message-image-label">[图片{alt ? `：${alt}` : ''}]</span>,
  table: ({ children }) => <div className="message-table-scroll" tabIndex={0}><table>{children}</table></div>,
};
const plugins = [remarkGfm, remarkPreviewLinks];

/** Presentation only: stored events, live deltas and Harness state stay untouched. */
export const MessageMarkdown = memo(function MessageMarkdown({ text }: { text: string }) {
  return <div className="message-markdown"><Markdown remarkPlugins={plugins} components={components} skipHtml>{text}</Markdown></div>;
});
