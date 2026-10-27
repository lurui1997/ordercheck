/** Spoken landing copy. Demo capabilities only — no customer outcomes. */

export const hero = {
  title: "发确认前，先看邮件里没说清的地方。",
  line: "只看这一张订单，不翻别的邮件。",
  primary: { href: "/workspace", label: "打开工作台" },
  secondary: { href: "/workspace", label: "试一下 DEMO" },
} as const;

export const beats = [
  { title: "先把缺口列开", line: "到货、样品、包装分开看。" },
  { title: "点一下对上原句", line: "邮件里找不到，就不当事实。" },
  { title: "你确认了再发", line: "没配邮箱，就写明还没发出。" },
] as const;

export const honesty = {
  chips: ["DeepSeek", "证据链", "外发可审计"],
} as const;

export const closing = {
  line: "点一下就能试 DEMO。",
  primary: { href: "/workspace", label: "打开工作台" },
} as const;

export const footer = {
  note: "样例邮件，不是真客户。",
} as const;

export const mockCaption = "DEMO-001 示意。这里还不能操作。";
