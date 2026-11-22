import type { ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  const tokens = text.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return tokens.map((part, idx) => {
    const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent-text underline"
        >
          {linkMatch[1]}
        </a>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs text-ink"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export function SimpleMarkdown({ content }: { content: string }) {
  const blocks = content.trim().split(/\n{2,}/);

  return (
    <div className="max-w-[70ch] space-y-2.5 text-sm leading-relaxed text-ink">
      {blocks.map((block, blockIdx) => {
        const lines = block.split("\n");
        const headingMatch = /^(#{2,3})\s+(.+)$/.exec(block.trim());
        if (headingMatch && lines.length === 1) {
          return (
            <p key={blockIdx} className="heading-section text-base text-ink">
              {renderInline(headingMatch[2])}
            </p>
          );
        }

        const isUnordered = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        const isOrdered = lines.every((l) => /^\s*\d+\.\s+/.test(l));

        if (isUnordered) {
          return (
            <ul key={blockIdx} className="list-disc space-y-1 pl-5">
              {lines.map((line, lineIdx) => (
                <li key={lineIdx}>{renderInline(line.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        if (isOrdered) {
          return (
            <ol key={blockIdx} className="list-decimal space-y-1 pl-5">
              {lines.map((line, lineIdx) => (
                <li key={lineIdx}>{renderInline(line.replace(/^\s*\d+\.\s+/, ""))}</li>
              ))}
            </ol>
          );
        }

        return (
          <p key={blockIdx} className="whitespace-pre-wrap">
            {renderInline(block)}
          </p>
        );
      })}
    </div>
  );
}
