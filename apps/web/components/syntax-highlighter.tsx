"use client";

import { cn } from "@repo/ui/lib/utils";

interface Token {
  type:
    | "keyword"
    | "string"
    | "comment"
    | "function"
    | "variable"
    | "operator"
    | "punctuation"
    | "text"
    | "property"
    | "number";
  content: string;
}

const keywords = [
  "import",
  "from",
  "export",
  "const",
  "let",
  "var",
  "function",
  "return",
  "async",
  "await",
  "if",
  "else",
  "for",
  "while",
  "class",
  "extends",
  "new",
  "this",
  "true",
  "false",
  "null",
  "undefined",
  "try",
  "catch",
  "throw",
  "package",
  "main",
  "func",
  "use",
  "pub",
  "fn",
  "mod",
  "struct",
  "impl",
  "trait",
  "enum",
  "type",
  "interface",
  "def",
  "self",
  "None",
  "True",
  "False",
];

const tokenize = (code: string, _language: string): Token[][] => {
  const lines = code.split("\n");

  return lines.map((line) => {
    const tokens: Token[] = [];
    let remaining = line;

    while (remaining.length > 0) {
      // Comments
      if (remaining.startsWith("//") || remaining.startsWith("#")) {
        tokens.push({ type: "comment", content: remaining });
        break;
      }

      // Strings (double quotes)
      const doubleQuoteMatch = remaining.match(/^"([^"\\]|\\.)*"/);
      if (doubleQuoteMatch) {
        tokens.push({ type: "string", content: doubleQuoteMatch[0] });
        remaining = remaining.slice(doubleQuoteMatch[0].length);
        continue;
      }

      // Strings (single quotes)
      const singleQuoteMatch = remaining.match(/^'([^'\\]|\\.)*'/);
      if (singleQuoteMatch) {
        tokens.push({ type: "string", content: singleQuoteMatch[0] });
        remaining = remaining.slice(singleQuoteMatch[0].length);
        continue;
      }

      // Backtick strings
      const backtickMatch = remaining.match(/^`([^`\\]|\\.)*`/);
      if (backtickMatch) {
        tokens.push({ type: "string", content: backtickMatch[0] });
        remaining = remaining.slice(backtickMatch[0].length);
        continue;
      }

      // Numbers
      const numberMatch = remaining.match(/^\b\d+\.?\d*\b/);
      if (numberMatch) {
        tokens.push({ type: "number", content: numberMatch[0] });
        remaining = remaining.slice(numberMatch[0].length);
        continue;
      }

      // Function calls
      const funcMatch = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
      // biome-ignore lint/complexity/useOptionalChain: explicit null check is clearer
      if (funcMatch && funcMatch[1]) {
        tokens.push({ type: "function", content: funcMatch[1] });
        remaining = remaining.slice(funcMatch[1].length);
        continue;
      }

      // Keywords and identifiers
      const wordMatch = remaining.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      if (wordMatch) {
        const word = wordMatch[0];
        if (keywords.includes(word)) {
          tokens.push({ type: "keyword", content: word });
        } else if (
          word.charAt(0) === word.charAt(0).toUpperCase() &&
          word.charAt(0) !== word.charAt(0).toLowerCase()
        ) {
          tokens.push({ type: "variable", content: word });
        } else {
          tokens.push({ type: "text", content: word });
        }
        remaining = remaining.slice(word.length);
        continue;
      }

      // Operators
      const opMatch = remaining.match(/^[=+\-*/<>!&|:]+/);
      if (opMatch) {
        tokens.push({ type: "operator", content: opMatch[0] });
        remaining = remaining.slice(opMatch[0].length);
        continue;
      }

      // Punctuation
      const punctMatch = remaining.match(/^[{}()[\];,.]/);
      if (punctMatch) {
        tokens.push({ type: "punctuation", content: punctMatch[0] });
        remaining = remaining.slice(1);
        continue;
      }

      // Whitespace and other characters
      tokens.push({ type: "text", content: remaining.charAt(0) });
      remaining = remaining.slice(1);
    }

    return tokens;
  });
};

const tokenColors: Record<Token["type"], string> = {
  keyword: "text-pink-700 dark:text-pink-400",
  string: "text-green-700 dark:text-green-400",
  comment: "text-zinc-500 dark:text-zinc-500",
  function: "text-blue-700 dark:text-blue-400",
  variable: "text-amber-700 dark:text-yellow-300",
  operator: "text-cyan-700 dark:text-cyan-300",
  punctuation: "text-zinc-600 dark:text-zinc-400",
  text: "text-foreground/80",
  property: "text-purple-700 dark:text-purple-400",
  number: "text-orange-700 dark:text-orange-400",
};

interface SyntaxHighlighterProps {
  code: string;
  language?: string;
  className?: string;
  showLineNumbers?: boolean;
}

export function SyntaxHighlighter({
  code,
  language = "javascript",
  className,
  showLineNumbers = false,
}: SyntaxHighlighterProps) {
  const tokenizedLines = tokenize(code, language);

  return (
    <pre className={cn("overflow-x-auto bg-zinc-100 dark:bg-[#0a0a0a] p-6", className)}>
      <code className="font-mono text-sm leading-relaxed">
        {tokenizedLines.map((lineTokens, lineIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are static and order won't change
          <div key={lineIndex} className="flex">
            {showLineNumbers && (
              <span className="mr-4 inline-block w-6 text-right text-zinc-400 dark:text-zinc-600 select-none">
                {lineIndex + 1}
              </span>
            )}
            <span>
              {lineTokens.map((token, tokenIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: tokens are static and order won't change
                <span key={tokenIndex} className={tokenColors[token.type]}>
                  {token.content}
                </span>
              ))}
            </span>
          </div>
        ))}
      </code>
    </pre>
  );
}
