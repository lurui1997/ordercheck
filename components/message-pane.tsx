"use client";

import { SOURCE_LABEL, roleLabel } from "@/lib/labels";
import type { Message } from "@/lib/types";
import { formatStamp } from "@/lib/utils";

function HighlightedBody({ body, quote }: { body: string; quote?: string }) {
  if (!quote || !body.includes(quote)) {
    return <p className="whitespace-pre-wrap text-sm leading-6 text-[#1c2430]">{body}</p>;
  }
  const index = body.indexOf(quote);
  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-[#1c2430]">
      {body.slice(0, index)}
      <mark>{quote}</mark>
      {body.slice(index + quote.length)}
    </p>
  );
}

export function MessagePane({
  messages,
  buyerName,
  sellerName,
  activeMessageId,
  activeQuote,
}: {
  messages: Message[];
  buyerName: string;
  sellerName: string;
  activeMessageId?: string;
  activeQuote?: string;
}) {
  if (messages.length === 0) {
    return <p className="text-sm text-[#5c6775]">这张订单还没有邮件。</p>;
  }

  return (
    <ol className="space-y-3">
      {messages.map((message) => {
        const active = message.id === activeMessageId;
        const buyer = message.from_role === "buyer";
        return (
          <li
            key={message.id}
            id={`message-${message.id}`}
            className={`rounded-lg border bg-[#fffdf8] p-4 ${active ? "border-[#c4452d] ring-2 ring-[#c4452d]/30" : "border-[#eadfcd]"} ${
              message.source === "demo_outbound" ? "border-dashed" : ""
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#5c6775]">
              <span className={`rounded px-1.5 py-0.5 font-semibold ${buyer ? "bg-[#e5eef4] text-[#1e4d6b]" : "bg-[#f6ead4] text-[#8a5a12]"}`}>
                {roleLabel(message.from_role)} · {buyer ? buyerName : sellerName}
              </span>
              <span className="rounded bg-[#f3ecdf] px-1.5 py-0.5">{SOURCE_LABEL[message.source]}</span>
              <span>{message.id}</span>
              <time dateTime={message.sent_at}>{formatStamp(message.sent_at)} UTC</time>
            </div>
            <p className="mb-2 text-sm font-semibold text-[#1c2430]">{message.subject}</p>
            <HighlightedBody body={message.body} quote={active ? activeQuote : undefined} />
          </li>
        );
      })}
    </ol>
  );
}
