/** Marketing copy. Claims are demo capabilities, not customer outcomes. */

export const nav = [
  { href: "#review", label: "智能核对" },
  { href: "#close", label: "确认闭环" },
  { href: "#runtime", label: "运行时" },
  { href: "#honesty", label: "诚实" },
  { href: "#scenarios", label: "场景" },
] as const;

export const hero = {
  kicker: "一张订单的确认前核对",
  titleLead: "发确认之前，",
  titleAccent: "先把没对齐的条件摊开。",
  lede:
    "OrderCheck 读买卖双方这一张订单的往来，列出未确认事项和原文证据，起草可改的英文确认邮件，并记录外发。没配 SMTP 或 SES 时状态是未发送，不会写成已投递。",
  primary: { href: "/workspace", label: "打开工作台" },
  secondary: { href: "#review", label: "看核对能力" },
  points: ["只处理这一张订单", "展示的引用可回到原文", "外发状态可审计"],
  steps: [
    {
      index: "01",
      title: "加载往来",
      body: "DEMO-001 一次放入三封英文邮件和报价。核对之前不给结论。",
    },
    {
      index: "02",
      title: "核对事项",
      body: "开始核对后，点引用回到指定句子。重要缺口和次要缺口分开列。",
    },
    {
      index: "03",
      title: "记录外发",
      body: "起草可改的确认邮件。人确认之后才记录发送，并写明实际通道。",
    },
  ],
} as const;

export type CardIcon =
  | "threads"
  | "evidence"
  | "state"
  | "compare"
  | "ask"
  | "risk"
  | "na"
  | "send"
  | "engines"
  | "mail"
  | "storage"
  | "aws"
  | "badges"
  | "health"
  | "honest"
  | "eval";

export interface PillarCard {
  icon: CardIcon;
  title: string;
  body: string;
}

export interface PillarMetric {
  kicker: string;
  label: string;
}

export interface Pillar {
  id: string;
  index: string;
  kicker: string;
  title: string;
  lede: string;
  cards: readonly PillarCard[];
  metrics: readonly PillarMetric[];
}

export const pillars: readonly Pillar[] = [
  {
    id: "review",
    index: "01",
    kicker: "智能核对",
    title: "全量读这一张订单的往来，每条判断都能回到原文。",
    lede: "不抽样，也不跨订单去读私人邮箱。核对结果是事项和证据，不是一段无法回指的摘要。",
    cards: [
      {
        icon: "threads",
        title: "往来一次读完",
        body: "只处理交给它的这一张订单。DEMO-001 是三封英文邮件加报价：加载后先入账，右侧在核对前没有结论。",
      },
      {
        icon: "evidence",
        title: "事项和证据链",
        body: "每条事项带引用。展示出来的句子必须能在指定消息里找到；找不到的句子不会显示成事实。",
      },
      {
        icon: "state",
        title: "严重度与状态机",
        body: "重要与次要分开。含糊说法不能把事项关掉。卖方提出新条件后停在待对方接受，不会直接变成已确认。",
      },
      {
        icon: "compare",
        title: "双引擎对照",
        body: "左栏始终是确定性规则引擎。live 可用时再跑一遍。未配置就写明缺少的环境变量名；调用失败时右栏留空，不把规则事项抄过去。",
      },
    ],
    metrics: [
      { kicker: "样例", label: "DEMO-001 一键加载" },
      { kicker: "证据", label: "引用可回到原文" },
      { kicker: "事项", label: "严重度与状态可解释" },
      { kicker: "对照", label: "双引擎可并排" },
    ],
  },
  {
    id: "close",
    index: "02",
    kicker: "确认闭环",
    title: "缺口要有人决定，邮件要人确认后才记录外发。",
    lede: "系统可以起草问句。它不替任何一方承诺交期、价格、付款或补救，也不把摘要写成已经履约。",
    cards: [
      {
        icon: "ask",
        title: "提问",
        body: "仍要问的事项可以收进一封英文确认邮件。收件人和正文都能改，人确认之后才记录发送。",
      },
      {
        icon: "risk",
        title: "接受风险",
        body: "操作者写下理由后，事项可以标成已接受风险。约定摘要里它和已确认分开，不会写成双方已经同意。",
      },
      {
        icon: "na",
        title: "本次不适用",
        body: "同样需要理由和操作者。也可以标成需人工核实。这些决定记在事项上，不靠模型悄悄改状态。",
      },
      {
        icon: "send",
        title: "草稿与记录发送",
        body: "没配 SMTP、也没配 SES 时，状态是 recorded_not_sent。配了 SMTP 后成功只记 submit_succeeded。delivered 只来自投递事件。",
      },
    ],
    metrics: [
      { kicker: "草稿", label: "确认邮件可编辑" },
      { kicker: "外发", label: "发送状态可审计" },
      { kicker: "通道", label: "未发送不会写成已投递" },
      { kicker: "摘要", label: "已确认与未确认分开" },
    ],
  },
  {
    id: "runtime",
    index: "03",
    kicker: "可替换运行时",
    title: "模型、发信和存储都可以换，名字不能换。",
    lede: "默认演示不需要云账号。换运行时时，顶栏徽章和 health 跟着变。失败返回对应引擎的错误，不伪装成另一个引擎。",
    cards: [
      {
        icon: "engines",
        title: "核对引擎",
        body: "自动顺序是 DeepSeek、Ollama、AI Gateway，然后确定性规则引擎。显式指定会覆盖自动链。Bedrock 不在自动链上。",
      },
      {
        icon: "mail",
        title: "发信",
        body: "SMTP 配齐后优先于 SES。SMTP 失败不会改走 SES。样例邮箱是 example.com，不能用于真实发信。",
      },
      {
        icon: "storage",
        title: "存储与对象",
        body: "工作台副本在浏览器。接口侧可以是内存、SQLite 或 Postgres。后两者优先于 DynamoDB。原始 MIME 可以进 MinIO、本地磁盘，或显式启用的 S3。",
      },
      {
        icon: "aws",
        title: "AWS 仅显式启用",
        body: "Bedrock、SES、DynamoDB、S3 只在对应配置写全时调用。只写表名不会把存储标成 DynamoDB。留空引擎不会因为区域和凭证齐全就改走 Bedrock。",
      },
    ],
    metrics: [
      { kicker: "模型", label: "引擎可切换" },
      { kicker: "邮件", label: "发信通道可替换" },
      { kicker: "数据", label: "存储可替换" },
      { kicker: "云", label: "AWS 仅显式启用" },
    ],
  },
  {
    id: "honesty",
    index: "04",
    kicker: "可观测与诚实",
    title: "顶栏写的是现在这次运行，不是希望中的运行。",
    lede: "配置具备，和这次调用成功，是两件事。页面把它们分开，health 也不返回密钥。",
    cards: [
      {
        icon: "badges",
        title: "顶栏徽章",
        body: "模式、核对引擎、auto 或 explicit、对照引擎、存储、对象存储和发信通道都在顶栏。review: 是将使用的引擎，ran: 是这次实际返回的引擎。",
      },
      {
        icon: "health",
        title: "health",
        body: "GET /api/health 返回模式、引擎、持久化、对象存储和一组布尔值，以及 missing。deepseek: true 只表示密钥已配置，不表示这次调用成功。",
      },
      {
        icon: "honest",
        title: "不静默伪装",
        body: "规则引擎的结果不会标成 DeepSeek、Ollama、Gateway 或 Bedrock。DeepSeek 草稿失败直接报错，不用确定性模板顶替。其他模型若退回模板，draftEngine 会标成 deterministic。",
      },
      {
        icon: "eval",
        title: "评测范围写明",
        body: "npm run eval 只给确定性规则引擎打分，夹具不少于 8 个场景。这个分数不会说成某个模型的分数。",
      },
    ],
    metrics: [
      { kicker: "顶栏", label: "徽章与配置一致" },
      { kicker: "诊断", label: "health 不含密钥" },
      { kicker: "失败", label: "失败不改标引擎" },
      { kicker: "评测", label: "分数只属于规则引擎" },
    ],
  },
];

export const engineChain = [
  { label: "DeepSeek", code: "deepseek" },
  { label: "Ollama", code: "ollama" },
  { label: "AI Gateway", code: "ai_gateway" },
  { label: "规则引擎", code: "deterministic" },
] as const;

export const explicitEngine = {
  label: "Amazon Bedrock",
  code: "bedrock",
  note: "不在自动链上，只有 REVIEW_ENGINE=bedrock 才会选中",
} as const;

export const platform = {
  id: "platform",
  kicker: "运行时清单",
  title: "可替换的引擎、发信和存储，名字与状态分开写。",
  lede: "下面是产品里真实存在的开关。默认演示走规则引擎、浏览器副本和 recorded_not_sent。",
  groups: [
    {
      title: "核对",
      items: [
        { name: "DeepSeek", code: "deepseek", note: "自动链第一位。有密钥才使用这个名字。" },
        { name: "Ollama", code: "ollama", note: "本机 OpenAI 兼容接口。需要 OLLAMA_MODEL。" },
        { name: "AI Gateway", code: "ai_gateway", note: "标成 ai_gateway，不会写成 Bedrock。" },
        { name: "确定性规则", code: "deterministic", note: "无模型密钥时的默认。DEMO-001 走这条路径。" },
      ],
    },
    {
      title: "发信",
      items: [
        { name: "只记录", code: "recorded_not_sent", note: "未配 SMTP / SES 时的状态。页面写明未发送。" },
        { name: "SMTP", code: "smtp", note: "配齐后优先。成功只记 submit_succeeded。" },
        { name: "Amazon SES", code: "ses", note: "未配 SMTP 时的可选路径。delivered 只来自投递事件。" },
      ],
    },
    {
      title: "存储与对象",
      items: [
        { name: "浏览器副本", code: "local", note: "工作台 DEMO 闭环保存在本机浏览器。" },
        { name: "Postgres / SQLite", code: "sql", note: "优先于 DynamoDB。" },
        { name: "内存", code: "memory", note: "默认的接口存储。新实例为空。" },
        { name: "MinIO / 磁盘 / S3", code: "object", note: "原始 MIME。S3 只在显式配置时使用。" },
      ],
    },
    {
      title: "AWS 显式路径",
      items: [
        { name: "Bedrock", code: "bedrock", note: "必须显式选择，并且区域与模型齐全。" },
        { name: "SES 收件与事件", code: "inbound", note: "受 webhook 密钥保护，不是公开写入口。" },
        { name: "DynamoDB", code: "dynamo", note: "表名、区域、凭证齐全，且没有更优先的 SQL 时才启用。" },
      ],
    },
  ],
  refusals: [
    { title: "不改标引擎", body: "规则结果不会写成模型结果。live 对照失败也不会抄左栏。" },
    { title: "不改写外发", body: "recorded_not_sent 保持未发送。提交成功也不等于已投递。" },
    { title: "不改写来源", body: "样例回放标明是样例。它不是 SES 收件，也不是买方真的回了信。" },
  ],
} as const;

export const scenarios = {
  id: "scenarios",
  kicker: "使用时刻",
  title: "贸易核对、卖方订单岗、现场可复核的样例。",
  lede: "这是产品覆盖的工作和演示边界，不是客户标识，也不是成效数字。",
  items: [
    {
      index: "贸易运营",
      title: "形式发票还没发出",
      body: "相同的日期可能一个是伦敦到货，一个是上海提货。样品版本和内托费用也常写在不同句子里。核对台把它们收成事项，而不是一句看起来已经谈妥。",
    },
    {
      index: "卖方订单岗",
      title: "只处理这一张订单",
      body: "主要用户是小型出口商的销售或订单负责人。演示角色是卖方 Lin，对方是英国买方 Emma，邮箱都是 example.com。系统不读私人邮箱历史，不跨订单推断。",
    },
    {
      index: "黑客松 CDS",
      title: "DEMO-001 可以当场复核",
      body: "一键加载，开始核对，点引用回到原文。真实 Bedrock / SES 不是默认路径。确定性引擎的评测分数不会说成 Bedrock、DeepSeek、Ollama 或 Gateway 的分数。",
    },
  ],
} as const;

export const closing = {
  title: "打开工作台，用 DEMO-001 走完一遍。",
  lede: "加载样例，开始核对，点引用回到原文，生成确认邮件，再确认记录发送。没配发信通道时，页面会写明没有调用 SMTP，也没有调用 SES。",
  primary: { href: "/workspace", label: "进入工作台" },
  secondary: { href: "/api/health", label: "查看 health" },
} as const;

export const footer = {
  note: "发确认之前的订单核对台。样例交易全部是模拟数据。不读取私人邮箱历史，不自动承诺价格、交期或付款。",
  links: [
    { href: "/workspace", label: "工作台" },
    { href: "#review", label: "智能核对" },
    { href: "#close", label: "确认闭环" },
    { href: "#platform", label: "运行时" },
    { href: "/api/health", label: "health" },
  ],
} as const;
