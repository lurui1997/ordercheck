# ADR-001: Next.js + Vercel for the hackathon public demo

- Status: Accepted
- Date: 2026-10-24

## Context

评委需要在浏览器里走完一次订单核对。黑客松周期里还没有稳定的 SES 域名、收件 MX 和 Bedrock 权限。如果先做一套只能在 AWS 账号里打开的后端，公开演示会被账号和收件配置卡住。

产品本身是一张订单工作台，桌面网页优先。核对规则必须能被自动化测试固定住，不能只存在于一次模型调用里。

## Decision

公开演示用仓库根目录的一个 Next.js App Router 应用，TypeScript 和 Tailwind。部署目标是 Vercel，框架选 Next.js，不需要额外的服务才能打开 DEMO-001。

页面、样例规则引擎和 Route Handler 放在同一个应用里。UI 基础组件使用 shadcn/ui 的写法（Radix、CVA、`cn`）。

浏览器里的演示状态放在 localStorage。服务端 Route Handler 使用进程内订单存储，用来摆出交接文档里的接口形状。Vercel 上这个进程内存储不作为演示的真实持久化。

## Consequences

- `npm run dev` 和 Vercel 默认构建都能打开完整样例闭环。
- 不需要数据库或云厂商账号就能复现三个问题、草稿、回放和摘要。
- 进程内 API 存储在无状态实例上会丢。文档和界面都把浏览器状态写成样例的持久化位置。
- 以后接 DynamoDB 时，替换 `OrderRepository`，不改页面信息架构。
- 这个决定不排除目标架构使用 API Gateway 和 Lambda。那是另一条路径，见 ADR-002 和架构文档。
