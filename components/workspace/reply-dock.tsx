"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { roleLabel } from "@/lib/labels";
import type { Role } from "@/lib/types";

export function ReplyDock({
  reviewed,
  played,
  total,
  nextBody,
  nextRole,
  replyRole,
  replyBody,
  onReplyRole,
  onReplyBody,
  onNext,
  onAmbiguous,
  onReopen,
  onCustom,
}: {
  reviewed: boolean;
  played: number;
  total: number;
  nextBody?: string;
  nextRole?: Role;
  replyRole: Role;
  replyBody: string;
  onReplyRole: (role: Role) => void;
  onReplyBody: (body: string) => void;
  onNext: () => void;
  onAmbiguous: () => void;
  onReopen: () => void;
  onCustom: () => void;
}) {
  return (
    <section className="rounded-md border border-line bg-zinc-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-ink">样例回放</h2>
        <span className="text-[12px] tabular-nums text-subtle">
          {played}/{total} · 不是 SES 收件
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-5 text-subtle">按原文更新相关事项。含糊说法不会关闭问题。单方新条件停在待对方接受。</p>
      {!reviewed ? <p className="mt-2 text-[13px] text-subtle">先开始核对，再回放回复。</p> : null}
      {reviewed && nextBody && nextRole ? (
        <div className="mt-2">
          <p className="text-[12px] font-semibold text-accent">下一条 · {roleLabel(nextRole)}</p>
          <p className="mt-1 line-clamp-3 text-[13px] leading-5 text-ink">{nextBody}</p>
          <Button className="mt-2" size="sm" onClick={onNext}>
            回放这一条
          </Button>
        </div>
      ) : null}
      {reviewed && !nextBody ? <p className="mt-2 text-[13px] text-ok">三条样例回复都已入账。可以打开约定摘要。</p> : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" aria-disabled={!reviewed || undefined} onClick={() => reviewed && onAmbiguous()}>
          回放含糊回复
        </Button>
        <Button size="sm" variant="outline" aria-disabled={!reviewed || undefined} onClick={() => reviewed && onReopen()}>
          回放确认后改口
        </Button>
      </div>
      <Separator className="my-3" />
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!reviewed || replyBody.trim().length === 0) return;
          onCustom();
        }}
      >
        <Label htmlFor="reply-body">手工粘贴回复</Label>
        <div className="flex items-center gap-2">
          <Select aria-label="回复方" value={replyRole} onChange={(event) => onReplyRole(event.target.value as Role)}>
            <option value="buyer">买方</option>
            <option value="seller">卖方</option>
          </Select>
          <p className="text-[12px] text-subtle">来源标成手工录入</p>
        </div>
        <Textarea id="reply-body" value={replyBody} onChange={(event) => onReplyBody(event.target.value)} placeholder="粘贴买方或卖方的新回复" />
        <Button type="submit" size="sm" variant="outline" aria-disabled={!reviewed || replyBody.trim().length === 0 || undefined}>
          用这条回复更新
        </Button>
      </form>
    </section>
  );
}
