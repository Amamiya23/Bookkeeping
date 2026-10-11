# 实施进度与会话交接

最后更新：2026-10-12（Asia/Shanghai）

返回 [实施计划](../../IMPLEMENTATION_PLAN.md) · 查看 [架构与接口约定](finance-architecture.md)

## 当前状态

- 阶段：P0 契约已收敛，P1 Docker 日常账本已实现并通过主要验收。
- 已完成：默认账本迁移、账户及精确余额、收入/支出/转账/退款、更正/作废/版本及审计、网页和移动端入口、实际统计及预算、备份/恢复/导入导出、运行时能力发现及路由例外。
- 未开始：P2 订阅付款联动、P3 自动化 API、P4 Agent Skill 与 Docker 首版整体交付、P5 Cloudflare 账务实现。
- 当前阻塞：无业务阻塞；完整 Go 回归存在 Windows/代理环境限制，完整前端回归出现一次懒加载时序失败，详见本轮记录。
- 当前进行中的实现任务：无；本轮代码均落在工作区，未提交、发布或部署。
- 下一任务：P2-01，先落实订阅账单系列/期次及启用日期，再按既有续费 hooks 和维护路径接入。

## 用户明确确认的决策

| 日期 | 决策 | 来源 |
| --- | --- | --- |
| 2026-10-11 | 在现有订阅账本上扩展日常记账，并让 Agent 辅助管理 | 用户初始需求 |
| 2026-10-11 | 优先 Docker 自托管，保留 Cloudflare 兼容路线 | 用户对部署选项的明确回复 |
| 2026-10-11 | IP 白名单 + API Token 双重校验 | 用户对鉴权选项的明确回复 |
| 2026-10-11 | 先做方案，再整理计划落盘，不在当前轮写业务代码 | 用户规划与落盘请求 |
| 2026-10-11 | 开始按 IMPLEMENTATION_PLAN.md 实施 | 用户后续“按照 IMPLEMENTATION_PLAN.md 实现”请求 |
| 2026-10-12 | 记账分类与图标参考用户提供的收支网格截图，补齐常用分类 | 用户本机预览后的反馈 |

其他设计均为当前建议基线，不记录为用户逐项批准。

## 阶段看板

| 阶段 | 状态 | 进入条件 | 下一项 |
| --- | --- | --- | --- |
| P0 核实与契约收敛 | 完成 | 用户开始实施指令 | 契约见 finance-contract.md |
| P1 日常账本 | 已实现，主要验收通过 | P0 关键契约完成 | Linux 完整 CI 仍需补证 |
| P2 订阅联动 | 未开始 | P1 账务能力可用 | P2-01 |
| P3 自动化 API | 未开始 | P1/P2 与接口契约稳定 | P3-01 |
| P4 Skill 与 Docker 首版 | 未开始 | P3 接口可用 | P4-01 |
| P5 Cloudflare 对齐 | 未开始 | Docker 规则稳定 | P5-01 |

## 下一会话的具体切入点

当前切入点已移至 P2-01；下面保留的 P0 调研清单已完成。开始 P2 前先读 [收敛契约](finance-contract.md) 的订阅期次部分，并查看 `subscription_renewal.go`、`subscription_renewal_maintenance.go`、`hooks.go`、`subscription_derived_state.go`。P1 财务 schema 和服务分别在 `schema_finance.go`、`finance_service.go`。

P0-01 只需补足与扩展有关的代码地图，不重新全量阅读项目：

1. 找到网页订阅操作、Go 应用路由与 collection hooks，确定共享账务服务的放置位置及通用 REST 旁路限制。
2. 找到备份、恢复、导入导出格式及数据版本机制，列出新增实体的接入点。
3. 审核现有 MoneyString 的金额边界和返回 number 的运算，列出余额/退款需要补齐的精确运算。
4. 找到运行时能力与路由一致性检查，设计 Docker 先行期间的明确 capability 差异。
5. 用具体业务样例确定 P0-02 至 P0-04 的实现选择，更新架构文档，不另建相互矛盾的计划。

首批领域样例：现金支出 32 元、收入 5000 元、两个同币种账户转账 1000 元、86 元消费退款 20 元、68 元订阅关联已有支出、同一期并发结算、月末用户时区跨日。

## 本轮交接记录

### 2026-10-12：P1 分类与图标补充

- 新增 32 个支出、10 个收入分类和 40 种可选图标；记账表单改为收支切换及分类图标网格，支持搜索、添加自定义分类，移动端固定弹窗标题与保存操作区。商家/标签收纳到“更多信息”。
- 自定义分类写入账本 categories，沿用用户隔离、version、事务审计并接入快照校验/导出/恢复。旧账本、旧快照和自由文字分类兼容；内置分类标识不随显示语言改变。分类图标用于流水和统计，分类筛选改为选择器。
- 已通过：Go 全部 TestFinance、共享协议 4 项、网页分类/金额 5 项、前端及共享/Worker/E2E 类型检查、三语言 2472 key 校验、ESLint、布局规范、Vite 构建及 CSP/包预算。最终布局的桌面及 Pixel 5 全流程 3 项通过（48.4 秒，含初始化、自定义图标保存、标题/保存按钮处于视口、跨用户备份恢复）；移动端截图已人工检查，无横向溢出。
- 本机预览继续使用 localhost:5173 + localhost:3000；独立数据目录 tmp/pb_data_preview，测试使用单独数据库。P2–P5 状态未变化，未提交或部署。

### 2026-10-11：P0-01–P0-05、P1-01–P1-06

- 实际行为：首版单用户默认账本，独立资金账户和正金额加类型的流水；转账原子影响两端而不计收支；退款关联原支出且不超额；余额任意精度，支持负期初；更正及作废保留审计且校验 version。新用户和旧实例幂等初始化，不虚构订阅付款。
- 网页：`/transactions`、`/accounts`、`/finance/statistics`，支持快速记账、标签/商家/分类、日期/账户/类型筛选、编辑、退款、作废、账户归档、账本时区、实际统计、整体月预算和恢复预览。移动端固定入口；金额展示不经过旧非负 MoneyString 上限，俄语小数输入可规范化。
- 兼容与数据：普通 Renewlet ZIP 和 Docker 云备份新增 finance 段；独立 JSON 导出/恢复；完整校验、空账本恢复、ID 映射、版本/关联保存、相同快照重试不重复，旧文件不删除新数据。demo 重置清理其财务数据并重建默认账本，不影响其他用户。
- 核心文件：Go `schema_finance.go`、`finance_money.go`、`finance_service.go`、`finance_routes.go`、`finance_reports.go`、`finance_snapshot.go` 及 `finance_*_test.go`；共享 `schemas/finance.ts` 与 `data/finance-contract-fixtures.json`；网页 `pages/finance.tsx`、`components/finance-*.tsx`、`services/finance-service.ts`；现有导入导出、默认用户创建和 demo 重置接入点；三语言 finance catalog；用户说明 `docs/finance.zh-CN.md`。
- P0 默认值、来源解析/权限/幂等协议及后续订阅状态机已收敛到 [finance-contract.md](finance-contract.md)。后续契约并不代表 P2–P5 已实现。

实际验证（命令分别在根目录、对应 workspace 或 `apps/docker-server` 执行；本机 Go/pnpm 使用临时工具目录）：

| 验证 | 实际结果 |
| --- | --- |
| `go test ./cmd/renewlet -run '^(TestFinance\|TestDemo\|TestEnsureSchema\|TestImport\|TestCloudBackup\|TestPublicAPI\|TestCalendarFeed)' -count=1` | 通过；账务、迁移、退款并发、审计失败回滚、隔离、预算、日期边界及相关旧功能回归 |
| `go test ./cmd/renewlet -run '^TestFinanceDemo' -count=1` | 通过；实际消费/退款的 demo 重置及其他用户数据保留 |
| shared `vitest run src/schemas/finance.test.ts` | 3 项通过；统一金额失败样例与共享输入契约 |
| Worker `vitest run src/finance-capabilities.test.ts src/import-export.test.ts src/route-manifest.test.ts src/index.test.ts` | 24 项通过；能力发现需认证、不支持的 finance 导入在写 D1 前拒绝 |
| 前端受影响的 7 个测试文件 | 最终 49 项通过；金额、时区、导航、总览、统计、备份及导入预览 |
| 前端完整非性能单元回归 | 230 文件、1569 项中 1568 通过；1 项高级货币筛选懒加载超时，随后单独运行该文件全部 5 项通过；未把整套结果记为全绿 |
| `playwright test --config tmp/finance.playwright.config.mjs` | 最终 3 项通过：真实初始化、桌面及移动端记账→退款→更正→作废→导出→另一用户恢复；无横向溢出，并查看移动端截图 |
| shared / client / Worker TypeScript 检查 | 最终均通过；E2E TypeScript 检查亦通过 |
| `node --import tsx scripts/check-product-route-parity.ts` | 通过，Go 125 / Worker 108，17 条运行时例外：原 cron 1 条、财务 16 条；保留未登记/过期例外检查 |
| `GOOS=linux CGO_ENABLED=0 go vet ./...` | 通过；Windows 原生 vet 因旧 Linux container-init 的 unix.Exec 不可用而失败 |
| 客户端 `vite build`、CSP、bundle budget | 通过；未执行 Docker 容器部署或生产发布 |
| i18n、ESLint（新增与相关文件）、Tailwind、FormFieldRow、文件行数、`git diff --check` | 通过；i18n 2380 keys / 3 locales / 13 domains |

- 完整 `go test ./cmd/renewlet -count=1` 已实际执行但未全绿：失败涉及 Windows 的 0600 权限/目录 fsync、真实断连判断、系统更新与继承代理环境的旧测试。相关财务及兼容回归已通过；Linux 完整测试仍需 CI 补证，不以 Windows 全量失败掩盖新功能验证范围。
- Windows E2E 使用隔离配置，数据库每轮生成新目录，没有删除已有实例；浏览器为系统 Chrome 的独立测试 context。临时配置、数据库及截图位于忽略目录 `tmp/`、`test-results/`，不作为发布内容。
- 当前限制：每账本 500 账户/500 预算；用户快照 10,000 流水/10,000 审计事件/8 MiB JSON，超限明确失败；逐币种报告且不做 FX 合计，查询最多 366 天；月预算网页提供整体币种预算，分类预算已有 API；审计页面显示最近 100 条。大实例可备份完整 data 目录。
- 明确未完成：订阅与账本归属及账单、付款关联、自动化 Token/IP/幂等/限流/OpenAPI、Agent Skill、Cloudflare 财务表与领域操作。当前 Docker capability 仅 ledger=true，其余 false；Worker 均为 false。
- 下一项：P2-01。按契约实现启用日期、系列 ID + 顺序号的稳定期次、90 天未来生成、规则修订及历史冻结，随后 P2-02 原子结算。先验证旧续费维护/cron 不产生实际付款；金融幂等与代理策略在 P3 实施，不复用旧 Public API Token 写权限。

### 2026-10-11：规划落盘

- 实际完成：创建根目录实施入口、架构与接口约定、进度交接三份文档。
- 确认的技术事实：现有 Public API 只读；Token 只存哈希；金额是十进制字符串；现有统计依据订阅规则；现有通用 IP 提取不具备可信代理鉴权边界。
- 关键设计：实际流水与订阅计划分离；订阅账单负责关联；新增自动化接口；原 Public API 保持兼容；Docker 先行、Cloudflare 后续对齐。
- 验证范围：只验证计划文件、相对链接与变更范围，不运行业务测试，不代表新功能已通过验证。
- 遗留事项：架构文档末尾列出 P0 待收敛的实现决策。
- 下一任务：用户要求开始实现后执行 P0-01。

## 后续交接模板

每次实际实施结束后在本文件追加简短记录，并同步阶段看板与主计划复选框：

```text
日期：
任务编号与状态：
实际完成的行为：
关键改动文件：
验证命令/场景与实际结果：
决策变化及原因：
未完成事项/真实阻塞：
下一任务与切入文件：
```

不要仅以“写了代码”标记完成；以阶段验收及实际验证结果判断。失败、未运行和仅静态检查必须分别记录，不覆盖此前有价值的决策依据。
