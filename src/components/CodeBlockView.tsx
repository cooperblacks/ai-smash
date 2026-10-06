import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import { DOCS_CODE_CONFIG } from '../constants';

interface CodeBlockViewProps {
  code: string;
  lang?: string;
  showCopy?: boolean;
  maxHeight?: string;
}

export const CodeBlockView: React.FC<CodeBlockViewProps> = ({
  code,
  lang = '',
  showCopy = true,
  maxHeight,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlightTokens = (rawCode: string, language: string): React.ReactNode => {
    const normalizedLang = (language || '').toLowerCase().trim();

    // If language cannot be recognized or is plain text, render basic white/grey text
    const supportedLangs = ['js', 'javascript', 'ts', 'typescript', 'bash', 'sh', 'shell', 'curl', 'json', 'console', 'error'];
    const isRecognized = supportedLangs.includes(normalizedLang);

    if (!isRecognized && normalizedLang !== '') {
      // Basic white/grey text on dark background as required
      return <span style={{ color: DOCS_CODE_CONFIG.textColor }}>{rawCode}</span>;
    }

    // Line-by-line syntax highlighting with fallback to basic white/grey
    const lines = rawCode.split('\n');

    return lines.map((line, lineIdx) => {
      // 1. Console Error Highlighting
      if (normalizedLang === 'console' || normalizedLang === 'error') {
        if (/^(error|exception|typeerror|referenceerror|syntaxerror|uncaught|failed)/i.test(line.trim())) {
          return (
            <div key={lineIdx} className="text-rose-400 font-semibold">
              {line || ' '}
            </div>
          );
        }
        if (/^\s*at\s+/i.test(line)) {
          return (
            <div key={lineIdx} className="text-sky-300/80">
              {line || ' '}
            </div>
          );
        }
        if (/^(warn|warning)/i.test(line.trim())) {
          return (
            <div key={lineIdx} className="text-amber-400">
              {line || ' '}
            </div>
          );
        }
        return (
          <div key={lineIdx} style={{ color: DOCS_CODE_CONFIG.textColor }}>
            {line || ' '}
          </div>
        );
      }

      // 2. Comments
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        return (
          <div key={lineIdx} className="text-neutral-400 italic">
            {line || ' '}
          </div>
        );
      }

      // 3. Token-based highlighting for code
      const tokenRegex = /(".*?"|'.*?'|`.*?`|\b(?:curl|import|export|from|const|let|var|function|return|async|await|if|else|try|catch|true|false|null|undefined|new|class)\b|-[a-zA-Z]|--[a-zA-Z-]+|\b\d+(\.\d+)?\b)/g;

      const elements: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = tokenRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          elements.push(
            <span key={`txt-${lastIndex}`} style={{ color: DOCS_CODE_CONFIG.textColor }}>
              {line.substring(lastIndex, match.index)}
            </span>
          );
        }

        const token = match[0];
        if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
          // Strings
          elements.push(
            <span key={`str-${match.index}`} className="text-sky-300">
              {token}
            </span>
          );
        } else if (/^-[a-zA-Z]|^--[a-zA-Z-]+/.test(token)) {
          // Flags
          elements.push(
            <span key={`flag-${match.index}`} className="text-amber-300">
              {token}
            </span>
          );
        } else if (/^\d+/.test(token)) {
          // Numbers
          elements.push(
            <span key={`num-${match.index}`} className="text-emerald-300">
              {token}
            </span>
          );
        } else {
          // Keywords
          elements.push(
            <span key={`kw-${match.index}`} className="text-fuchsia-300 font-medium">
              {token}
            </span>
          );
        }

        lastIndex = match.index + token.length;
      }

      if (lastIndex < line.length) {
        elements.push(
          <span key={`txt-${lastIndex}`} style={{ color: DOCS_CODE_CONFIG.textColor }}>
            {line.substring(lastIndex)}
          </span>
        );
      }

      return (
        <div key={lineIdx}>
          {elements.length > 0 ? elements : (
            <span style={{ color: DOCS_CODE_CONFIG.textColor }}>{line || ' '}</span>
          )}
        </div>
      );
    });
  };

  return (
    <div
      className="relative rounded-xl border border-black/20 dark:border-white/10 overflow-hidden shadow-inner my-2 font-mono text-xs select-text w-full max-w-full min-w-0"
      style={{
        backgroundColor: DOCS_CODE_CONFIG.themeBg,
        borderColor: DOCS_CODE_CONFIG.borderColor,
      }}
    >
      {/* Code Header bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-black/40 border-b border-white/[0.08] text-[11px] text-neutral-400 select-none">
        <span className="flex items-center gap-1.5 font-medium tracking-wide">
          <Terminal className="w-3 h-3 text-neutral-400 shrink-0" />
          <span className="truncate">{lang || 'code'}</span>
        </span>
        {showCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-white transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-white/10 shrink-0"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Code Container - Horizontally & Vertically Scrollable with smooth scrollbar */}
      <div
        className="p-3.5 overflow-x-auto overflow-y-auto leading-relaxed scrollbar-thin max-w-full min-w-0 overscroll-contain"
        style={{
          maxHeight: maxHeight || '340px',
          color: DOCS_CODE_CONFIG.textColor,
          fontFamily: DOCS_CODE_CONFIG.fontFamily,
          wordBreak: 'normal',
        }}
      >
        <pre className="m-0 p-0 font-mono whitespace-pre inline-block min-w-full">{highlightTokens(code, lang)}</pre>
      </div>
    </div>
  );
};
