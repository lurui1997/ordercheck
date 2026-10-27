"use client";

import { useEffect, useState } from "react";
import { SOURCE_LABEL, roleLabel } from "@/lib/labels";
import { splitByQuotes, type QuoteHighlight } from "@/lib/ui/workspace-model";
import type { Message } from "@/lib/types";
import { cn, formatStamp } from "@/lib/utils";

function HighlightedBody({ body, quotes }: { body: string; quotes: string[] }) {
  const parts = splitByQuotes(body, quotes);
  return (
    <p className="whitespace-pre-wrap text-[13px] leading-[1.9] text-[#36475f]">
      {parts.map((part, index) =>
        part.mark ? (
          <mark key={`${index}-${part.text.slice(0, 12)}`}>{part.text}</mark>
        ) : (
          <span key={`${index}-text`}>{part.text}</span>
        ),
      )}
    </p>
  );
}

export function MessagePane({
  messages,
  buyerName,
  sellerName,
  activeMessageId,
  highlights,
}: {
  messages: Message[];
  buyerName: string;
  sellerName: string;
  activeMessageId?: string;
  highlights: QuoteHighlight[];
}) {
  if (messages.length === 0) {
    return <p className="py-8 text-center text-[13px] text-muted">这张订单还没有邮件。</p>;
  }

  const latestId = messages[messages.length - 1]?.id;

  return (
    <ol>
      {messages.map((message) => (
        <MailItem
          key={message.id}
          message={message}
          name={message.from_role === "buyer" ? buyerName : sellerName}
          quotes={highlights.filter((item) => item.messageId === message.id).map((item) => item.quote)}
          active={message.id === activeMessageId}
          latest={message.id === latestId}
        />
      ))}
    </ol>
  );
}

function MailItem({
  message,
  name,
  quotes,
  active,
  latest,
}: {
  message: Message;
  name: string;
  quotes: string[];
  active: boolean;
  latest: boolean;
}) {
  const [open, setOpen] = useState(active || latest);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);
  const buyer = message.from_role === "buyer";
  const preview = message.body.replace(/\s+/g, " ").slice(0, 96);

  return (
    <li>
      <details
        id={`message-${message.id}`}
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className={cn(
          "group scroll-mt-4 border-b border-[#edf0f5] last:border-b-0",
          active && "my-1 rounded-lg bg-[#edf3ff] px-2 shadow-[0_0_0_2px_#c7d2e1]",
        )}
      >
        <summary className="flex cursor-pointer list-none items-start gap-3 py-4 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
              buyer ? "bg-[#e8ecf4] text-[#6b7c9b]" : "bg-[#f0ede2] text-[#8b7a53]",
            )}
          >
            {name.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#3b4e68]">{name}</span>
              <span className="text-[10px] text-[#7c94b6]">{roleLabel(message.from_role)}</span>
            </span>
            <span className="mt-1 block text-[12px] text-[#56729a]">{message.subject}</span>
            <span className="mt-1 block truncate text-[11px] text-[#7c94b6] group-open:hidden">{preview}</span>
          </span>
          <time className="shrink-0 pt-0.5 text-[10px] text-[#7c94b6]" dateTime={message.sent_at}>
            {formatStamp(message.sent_at)}
          </time>
        </summary>
        <div className="pb-4 pl-11">
          <HighlightedBody body={message.body} quotes={quotes} />
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[#8399b9]">
            <span className="rounded bg-[#ecf0f6] px-1.5 py-0.5 text-[#6984aa]">{SOURCE_LABEL[message.source]}</span>
            <span className="font-mono">{message.id}</span>
          </p>
        </div>
      </details>
    </li>
  );
}
