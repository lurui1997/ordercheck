"use client";

import { SOURCE_LABEL, roleLabel } from "@/lib/labels";
import { splitByQuotes, type QuoteHighlight } from "@/lib/ui/workspace-model";
import type { Message } from "@/lib/types";
import { formatStamp } from "@/lib/utils";

function HighlightedBody({ body, quotes }: { body: string; quotes: string[] }) {
  const parts = splitByQuotes(body, quotes);
  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-ink">
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
    return <p className="rounded-md border border-dashed border-line px-3 py-6 text-sm text-subtle">这张订单还没有邮件。</p>;
  }

  return (
    <ol className="space-y-2">
      {messages.map((message) => {
        const quotes = highlights.filter((item) => item.messageId === message.id).map((item) => item.quote);
        const active = message.id === activeMessageId;
        const buyer = message.from_role === "buyer";
        const marked = quotes.length > 0;
        return (
          <li
            key={message.id}
            id={`message-${message.id}`}
            aria-current={active ? "true" : undefined}
            className={`scroll-mt-3 rounded-md border bg-surface p-3 ${
              active ? "border-accent ring-2 ring-accent/30" : marked ? "border-amber-300" : "border-line"
            } ${message.source === "demo_outbound" ? "border-dashed" : ""}`}
          >
            <div className="flex gap-2.5">
              <span
                aria-hidden="true"
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  buyer ? "bg-indigo-100 text-accent" : "bg-amber-100 text-attention"
                }`}
              >
                {buyer ? "买" : "卖"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-subtle">
                  <span className="font-semibold text-ink">
                    {roleLabel(message.from_role)} · {buyer ? buyerName : sellerName}
                  </span>
                  <span className="rounded border border-line bg-zinc-50 px-1.5 py-0.5">{SOURCE_LABEL[message.source]}</span>
                  <span className="font-mono text-[11px]">{message.id}</span>
                  <time className="tabular-nums" dateTime={message.sent_at}>
                    {formatStamp(message.sent_at)} UTC
                  </time>
                </div>
                <p className="mt-1 text-[13px] font-semibold text-ink">{message.subject}</p>
                <div className="mt-1.5">
                  <HighlightedBody body={message.body} quotes={quotes} />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
