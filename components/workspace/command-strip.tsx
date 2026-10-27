"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { CommandAvailability } from "@/lib/ui/workspace-model";

function CommandButton({
  availability,
  variant,
  busy,
  onHint,
  onClick,
  children,
}: {
  availability: CommandAvailability;
  variant: "default" | "outline" | "ghost";
  busy?: boolean;
  onHint: (hint: string | null) => void;
  onClick: () => void;
  children: string;
}) {
  return (
    <span className="inline-flex" onMouseEnter={() => onHint(availability.reason)} onMouseLeave={() => onHint(null)}>
      <Button
        size="sm"
        variant={availability.disabled ? "outline" : variant}
        aria-disabled={availability.disabled || undefined}
        aria-describedby="command-hint"
        onFocus={() => onHint(availability.reason)}
        onBlur={() => onHint(null)}
        onClick={() => {
          if (availability.disabled) {
            onHint(availability.reason);
            return;
          }
          onClick();
        }}
      >
        {busy ? <Spinner /> : null}
        {children}
      </Button>
    </span>
  );
}

export function CommandStrip({
  loadLabel,
  reviewLabel,
  commands,
  hint,
  reviewBusy,
  compareBusy,
  draftBusy,
  sendBusy,
  reviewPrimary,
  draftPrimary,
  recordPrimary,
  onLoad,
  onReview,
  onCompare,
  onDraft,
  onRecord,
  onSummary,
}: {
  loadLabel: string;
  reviewLabel: string;
  commands: Record<"load" | "review" | "compare" | "draft" | "record" | "summary", CommandAvailability>;
  hint: string;
  reviewBusy: boolean;
  compareBusy: boolean;
  draftBusy: boolean;
  sendBusy: boolean;
  reviewPrimary: boolean;
  draftPrimary: boolean;
  recordPrimary: boolean;
  onLoad: () => void;
  onReview: () => void;
  onCompare: () => void;
  onDraft: () => void;
  onRecord: () => void;
  onSummary: () => void;
}) {
  const [pinned, setPinned] = useState<string | null>(null);
  return (
    <div className="border-b border-line bg-zinc-50 px-4 py-2">
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="订单操作">
        <CommandButton availability={commands.load} variant="outline" onHint={setPinned} onClick={onLoad}>
          {loadLabel}
        </CommandButton>
        <CommandButton
          availability={commands.review}
          variant={reviewPrimary ? "default" : "outline"}
          busy={reviewBusy}
          onHint={setPinned}
          onClick={onReview}
        >
          {reviewLabel}
        </CommandButton>
        <CommandButton availability={commands.compare} variant="outline" busy={compareBusy} onHint={setPinned} onClick={onCompare}>
          双引擎对比
        </CommandButton>
        <CommandButton
          availability={commands.draft}
          variant={draftPrimary ? "default" : "outline"}
          busy={draftBusy}
          onHint={setPinned}
          onClick={onDraft}
        >
          生成确认邮件
        </CommandButton>
        <CommandButton
          availability={commands.record}
          variant={recordPrimary ? "default" : "outline"}
          busy={sendBusy}
          onHint={setPinned}
          onClick={onRecord}
        >
          记录发送
        </CommandButton>
        <CommandButton availability={commands.summary} variant="ghost" onHint={setPinned} onClick={onSummary}>
          约定摘要
        </CommandButton>
      </div>
      <p id="command-hint" className="mt-1.5 min-h-5 text-[12px] leading-5 text-subtle" aria-live="polite">
        {pinned ?? hint}
      </p>
    </div>
  );
}
