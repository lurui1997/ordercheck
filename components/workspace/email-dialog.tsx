"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/labels";
import { enginePresentation, type CommandAvailability } from "@/lib/ui/workspace-model";
import type { EmailDraft, Issue, ReviewEngine } from "@/lib/types";

export function EmailDialog({
  open,
  draft,
  issues,
  draftEngine,
  draftBusy,
  sendBusy,
  pendingSend,
  pendingNote,
  record,
  live,
  transport,
  onOpenChange,
  onToggleIssue,
  onChange,
  onRecord,
  onLive,
}: {
  open: boolean;
  draft: EmailDraft | null;
  issues: Issue[];
  draftEngine: ReviewEngine | null;
  draftBusy: boolean;
  sendBusy: boolean;
  pendingSend: "record" | "live" | null;
  pendingNote?: string;
  record: CommandAvailability;
  live: CommandAvailability;
  transport: "smtp" | "ses" | "recorded";
  onOpenChange: (open: boolean) => void;
  onToggleIssue: (issueId: string) => void;
  onChange: (draft: EmailDraft) => void;
  onRecord: () => void;
  onLive: () => void;
}) {
  const engine = draftEngine ? enginePresentation(draftEngine) : null;
  const fieldsReady = Boolean(draft && draft.to.trim() && draft.subject.trim() && draft.body.trim() && draft.issue_ids.length > 0);
  const recordBlocked = record.disabled || !fieldsReady || sendBusy || draftBusy;
  const liveBlocked = live.disabled || !fieldsReady || sendBusy || draftBusy;
  const recordReason = !fieldsReady ? "收件人、主题、正文和至少一项事项都不能为空。" : record.reason;
  const liveReason = live.reason ?? (!fieldsReady ? "收件人、主题、正文和至少一项事项都不能为空。" : null);
  const liveLabel = transport === "smtp" ? "确认 SMTP 发送" : transport === "ses" ? "确认 SES 发送" : "确认发送";

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="确认邮件"
      description={
        transport === "smtp"
          ? "先改内容。SMTP 提交成功只表示服务器接受，不是已投递。仅记录则不提交 SMTP。"
          : transport === "ses"
            ? "先改内容。SES 提交成功只表示已接受，不是已投递。仅记录则不提交 SES。"
            : "先改内容，再记录发送。当前不会调用 SMTP 或 SES，也不会显示已投递。"
      }
      className="w-[min(840px,calc(100%-1.5rem))]"
    >
      {draft && engine ? (
        <div className="space-y-3">
          <p className="text-[12px] leading-5 text-subtle" role="status">
            draftEngine: <span className="font-mono">{engine.code}</span> · {engine.detail}
            {draftBusy ? " 正在更新草稿…" : ""}
          </p>
          <fieldset>
            <legend className="text-[13px] font-semibold">纳入这封邮件的事项</legend>
            <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto pr-1">
              {issues.map((issue) => (
                <label key={issue.issue_id} className="flex items-start gap-2 text-[13px] leading-5">
                  <input
                    type="checkbox"
                    className="mt-1 accent-[#275ee9]"
                    checked={draft.issue_ids.includes(issue.issue_id)}
                    onChange={() => onToggleIssue(issue.issue_id)}
                  />
                  <span>
                    <span className="font-semibold">{issue.title}</span>
                    <span className="ml-2 text-subtle">
                      {PRIORITY_LABEL[issue.priority]} · {STATUS_LABEL[issue.status]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mail-to">收件人</Label>
              <Input
                id="mail-to"
                type="email"
                className="mt-1"
                value={draft.to}
                onChange={(event) => onChange({ ...draft, to: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="mail-subject">主题</Label>
              <Input id="mail-subject" className="mt-1" value={draft.subject} onChange={(event) => onChange({ ...draft, subject: event.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="mail-body">正文</Label>
            <Textarea
              id="mail-body"
              className="mt-1 min-h-64 font-mono text-[13px]"
              spellCheck
              value={draft.body}
              onChange={(event) => onChange({ ...draft, body: event.target.value })}
            />
          </div>
          <p className="rounded-md border border-amber-200 bg-attention-soft px-3 py-2 text-[13px] leading-5 text-attention">
            {transport === "smtp"
              ? "将使用 SMTP_FROM 提交。成功状态是已提交，不是已投递。"
              : transport === "ses"
                ? "将使用 SES_FROM_ADDRESS 提交。成功状态是已提交，不是已投递。"
                : "样例地址不能用于真实发信。确认后只把邮件记到这条订单里，投递状态保持未发送。"}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              返回
            </Button>
            <span title={recordBlocked ? (recordReason ?? undefined) : undefined}>
              <Button variant={live.disabled ? "default" : "outline"} aria-disabled={recordBlocked || undefined} onClick={() => !recordBlocked && onRecord()}>
                {sendBusy && pendingSend === "record" ? <Spinner /> : null}
                仅记录发送
              </Button>
            </span>
            <span title={liveBlocked ? (liveReason ?? undefined) : undefined}>
              <Button variant={live.disabled ? "outline" : "default"} aria-disabled={liveBlocked || undefined} onClick={() => !liveBlocked && onLive()}>
                {sendBusy && pendingSend === "live" ? <Spinner /> : null}
                {liveLabel}
              </Button>
            </span>
          </div>
        </div>
      ) : draftBusy ? (
        <p className="flex items-center gap-2 text-sm text-subtle" role="status">
          <Spinner />
          {pendingNote ?? "正在生成草稿…"}
        </p>
      ) : (
        <p className="text-sm text-subtle">还没有草稿。</p>
      )}
    </Modal>
  );
}
