import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const MENTION = /@([a-z0-9_]{2,32})/gi;

type CommentBodyProps = {
  body: string;
  className?: string;
};

/** Renders comment text with @handle links to profiles. */
export function CommentBody({ body, className = "" }: CommentBodyProps) {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of body.matchAll(MENTION)) {
    const idx = match.index ?? 0;
    if (idx > last) {
      parts.push(body.slice(last, idx));
    }
    const handle = match[1].toLowerCase();
    parts.push(
      <Link
        key={`m-${key++}`}
        to={`/u/${handle}`}
        className="font-semibold text-spotify-green hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        @{match[1]}
      </Link>,
    );
    last = idx + match[0].length;
  }
  if (last < body.length) {
    parts.push(body.slice(last));
  }

  return <p className={className}>{parts.length ? parts : body}</p>;
}
