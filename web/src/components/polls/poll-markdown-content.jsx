import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const BASE_CLASS_NAME =
  "prose prose-sm prose-slate max-w-none prose-headings:font-display prose-a:text-brand-primary prose-a:underline hover:prose-a:text-brand-primary/80 dark:prose-invert";

function normalizeMarkdown(value) {
  return String(value || "").trim();
}

export function PollMarkdownContent({ content, fallback = "", className = "" }) {
  const normalized = normalizeMarkdown(content);
  const renderedContent = normalized || normalizeMarkdown(fallback);
  if (!renderedContent) return null;

  return (
    <div className={`${BASE_CLASS_NAME} ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderedContent}</ReactMarkdown>
    </div>
  );
}
