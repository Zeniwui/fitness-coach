import type { ReactNode } from "react";

type TableAlign = "left" | "center" | "right";

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

const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function parseTableAlignments(separatorLine: string): TableAlign[] {
  return splitTableRow(separatorLine).map((cell) => {
    const startsColon = cell.startsWith(":");
    const endsColon = cell.endsWith(":");
    if (startsColon && endsColon) return "center";
    if (endsColon) return "right";
    return "left";
  });
}

function alignClass(align: TableAlign | undefined): string {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "text-left";
}

function tryParseTable(lines: string[]): {
  headers: string[];
  alignments: TableAlign[];
  rows: string[][];
} | null {
  if (lines.length < 2) return null;
  if (!lines[0].includes("|") || !TABLE_SEPARATOR_RE.test(lines[1])) return null;
  const headers = splitTableRow(lines[0]);
  if (headers.length === 0) return null;
  const alignments = parseTableAlignments(lines[1]);
  const rows = lines
    .slice(2)
    .filter((l) => l.trim().length > 0 && l.includes("|"))
    .map(splitTableRow);
  return { headers, alignments, rows };
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

        const table = tryParseTable(lines);
        if (table) {
          return (
            <div
              key={blockIdx}
              className="overflow-x-auto rounded-control border border-line"
            >
              <table className="w-full border-collapse text-left text-xs tabular-nums sm:text-sm">
                <thead className="bg-surface-muted text-ink">
                  <tr>
                    {table.headers.map((header, colIdx) => (
                      <th
                        key={colIdx}
                        scope="col"
                        className={`border-b border-line px-3 py-2 font-semibold ${alignClass(table.alignments[colIdx])}`}
                      >
                        {renderInline(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {table.rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="bg-surface">
                      {table.headers.map((_, colIdx) => (
                        <td
                          key={colIdx}
                          className={`px-3 py-2 text-ink-muted ${alignClass(table.alignments[colIdx])}`}
                        >
                          {renderInline(row[colIdx] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
