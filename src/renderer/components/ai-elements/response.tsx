import { cn } from "@/lib/utils";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock, CodeBlockCopyButton } from "./code-block";

export type ResponseProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  parseIncompleteMarkdown?: boolean;
  components?: Record<string, React.ComponentType<any>>;
  allowedImagePrefixes?: string[];
  allowedLinkPrefixes?: string[];
  defaultOrigin?: string;
  rehypePlugins?: any[];
  remarkPlugins?: any[];
};

function closeUnfinishedCodeFences(md: string): string {
  const fenceCount = (md.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) return md + "\n```";
  return md;
}

function isAllowed(uri: string, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return false;
  if (allowed.includes("*")) return true;
  return allowed.some((p) => uri.startsWith(p));
}

export const Response: React.FC<ResponseProps> = ({
  className,
  children,
  parseIncompleteMarkdown = true,
  components,
  allowedImagePrefixes = ["*"],
  allowedLinkPrefixes = ["*"],
  defaultOrigin,
  rehypePlugins = [],
  remarkPlugins = [],
  ...divProps
}) => {
  const raw = typeof children === 'string' ? children : ''
  const content = parseIncompleteMarkdown ? closeUnfinishedCodeFences(raw || "") : raw || "";

  const mergedComponents = {
    code: ({ inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || "");
      if (!inline && match) {
        return (
          <CodeBlock code={String(children).replace(/\n$/, "")} language={match[1]}>
            <CodeBlockCopyButton />
          </CodeBlock>
        );
      }
      return (
        <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm" {...props}>
          {children}
        </code>
      );
    },
    a: ({ href = '', children, ...props }: any) => {
      const safe = typeof href === 'string' && isAllowed(href, allowedLinkPrefixes);
      return (
        <a href={safe ? href : undefined} target="_blank" rel="noreferrer" {...props}>
          {children}
        </a>
      );
    },
    img: ({ src = '', alt = '', ...props }: any) => {
      const safe = typeof src === 'string' && isAllowed(src, allowedImagePrefixes);
      if (!safe) return null;
      return <img src={src} alt={alt} {...props} />;
    },
    ul: ({ children }: any) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,
    li: ({ children }: any) => <li className="ml-2">{children}</li>,
    p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
    strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }: any) => <em className="italic">{children}</em>,
    ...(components || {}),
  } as any;

  return (
    <div
      className={cn(
        "[&>p]:leading-normal [&>p]:my-0 prose prose-sm max-w-none",
        className
      )}
      {...divProps}
    >
      {typeof children === 'string' ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, ...remarkPlugins]}
          rehypePlugins={[...rehypePlugins]}
          components={mergedComponents}
        >
          {content}
        </ReactMarkdown>
      ) : (
        children
      )}
    </div>
  );
};
