# P0 收敛记录与 P1 实现契约

更新：2026-10-12（Asia/Shanghai）。本文件区分已实现的 Docker 日常账本和后续阶段的设计契约。

## 代码地图（P0-01）

| 边界 | 实现位置 |
| --- | --- |
| 网页订阅写入、collection hooks | `app_data_routes.go`、`hooks.go`、`subscription_derived_state.go` |
| PocketBase schema、一次性数据迁移 | `schema.go`、`schema_migrations.go`；新增 `schema_finance.go` |
| 日常账务事务、归属、版本与退款 | `finance_service.go` |
| 精确金额、展示 | `finance_money.go`、网页 `lib/finance-format.ts` |
| 日常统计与预算 | `finance_reports.go`；原订阅统计仍在 `statistics-model.ts` |
| 用户备份、恢复、常规导入 | `finance_snapshot.go`、`cloud_backup_export.go`、`import_export.go`；共享 `schemas/import-export.ts` |
| 浏览器服务与页面 | `services/finance-service.ts`、`pages/finance.tsx`、`components/finance-*.tsx` |
| 能力发现、真实路由清单 | `finance_routes.go`、Worker `index.ts`、`check-product-route-parity.ts` |
| 共享契约、领域样例 | `packages/shared/src/schemas/finance.ts`、`packages/shared/data/finance-contract-fixtures.json` |

Docker 继续使用 PocketBase 的 `RunInTransaction`，所有事务内操作使用回调提供的 app；账务变更和必要审计一起提交。参见 [PocketBase 官方事务文档](https://pocketbase.io/docs/go-database/#transaction)。当前会话没有可调用的 Context7 工具，已使用官方文档及本地实际测试核实数据库边界。

## 已实现的实体与约束（P0-02 / P1）

- `ledgers`：user、name、baseCurrency、timeZone、categories、version、内部 restoredHash。首版每用户一个默认个人账本，唯一索引固定 user；旧用户通过 `default_finance_ledgers_v1` 迁移，新用户在创建事务中初始化，读取也可幂等修复。不会创建旧订阅的付款流水，也不把支付方式转换成账户。categories 为最多 100 项的自定义分类 `{name,kind,icon}`；kind 仅收入或支出，同类型名称不区分大小写去重，icon 限定为 40 个内置标识，不允许 SVG/URL。
- `accounts`：user、ledger、name、currency、openingBalance、openingDate、archived、version。余额不落可变缓存；账户归档后停止新写入，历史流水仍参与余额；任何历史流水存在时禁止改账户币种。
- `transactions`：user、ledger、kind、amount、currency、account、counterAccount、occurredOn、category、merchant、tags、notes、refundOf、externalSource/externalId、status、source、version、voidReason、created/updated。采用一笔流水加对端账户；转账是同一事实，天然不会产生半笔转账。
- `finance_budgets`：user、ledger、month、currency、category、amount、version。唯一键 ledger/month/currency/category；空 category 表示该币种整体月预算。
- `finance_audit`：user、ledger、actor、action、target、requestId、sourceIP、before/after、created/updated。账务写入不允许缺少审计；导入的历史审计标记 `import:<当前用户>`，其请求 ID 标记来源事件，不能伪装成本实例的实时操作。
- collection REST 的普通用户 list/view/create/update/delete 均锁定；用户通过产品 API 访问。超级管理员仍拥有 PocketBase 实例管理权限。用户整账号删除可以级联清理其账本；产品没有账户或流水物理删除入口。
- 外部来源标识成对提供，唯一性覆盖作废记录；设置后不能通过更正清除或更换，以保留长期来源去重依据。

流水状态：创建为 posted；更正保持 posted、版本加一；作废转为 void、版本加一并保留原因，禁止更正 void。重复作废当前版本不会再影响余额；旧版本仍返回冲突。

## 已实现的金额、日期与报告口径（P0-03）

- 输入金额为十进制字符串，最多六位小数，每笔及单账户期初金额绝对值上限 1,000,000,000。正数加类型表达流水方向；期初余额支持负值。聚合使用任意精度整数，不受单笔上限或 int64 溢出影响，展示也保留符号与六位事实精度。
- 文本限额按 UTF-16 单元计数，与共享 Zod 契约一致；金额仅接受规范形式，不接受指数、加号、前导零或外围空格。
- 支出减少余额、收入增加余额；同币种不同账户的转账不计收支；退款增加收款账户余额并冲减支出。转账日期不能早于任一账户期初日期，所有流水不能早于其资金账户期初日期。
- 退款必须关联同账本、同币种、已入账的支出，发生日不能早于原消费；退款账户可为同币种另一账户。有效退款合计不能超过原消费；退款分类继承原消费。存在有效退款时，原单不能作废、变类型/币种/日期/分类，或将金额改至累计退款以下。
- occurredOn 保存 date-only，操作时间保存 UTC。账本时区独立保存，初次来自用户设置，后续在账户页显式修改；改变时区不改写历史发生日。
- 报告按退款实际发生日冲减原分类，当月净支出可为负；期初余额、转账不计收入或支出。默认本月按账本时区取日期；查询范围最多 366 天，日期边界均包含。
- 首版逐币种返回实际收入、原始支出、退款、净支出、结余和分类汇总；无跨币种合计。返回 baseCurrency、unconvertedCurrencies 与 `posted-cash-flow`，明确未折算。改变基准币不改原币事实。
- 预算按 month/currency/category 计算实际净支出，退款跨月时冲减退款发生月。原订阅月预算保持原语义，网页明确区分周期折算/预计与实际流水。
- 分类与标签保留既有文字事实；新增内置分类使用 `builtin:<稳定标识>`，网页本地化显示 32 个支出、10 个收入分类，旧文字分类仍兼容。自定义分类以名称保存，图标来自账本 categories。图标选择不改变金额计算；订阅分类配置不回写日常流水。收入分类不计入支出预算。
- 自定义分类复用账本 PATCH 的 owner、version 和事务审计；旧调用者省略 categories 时保留已有分类。financeSnapshot v1 的 ledger 包含分类，恢复前校验图标/名称/数量；旧快照缺少 categories 按空分类处理。当前界面支持添加，未提供分类删除、重命名。

## 当前浏览器接口

前缀 `/api/app/finance`；使用已有 HttpOnly session、CSRF 与同源检查，Public API Token 不可代用。owner 和默认账本来自服务端；跨用户对象统一 404。

| 方法 / 路径 | 请求 / 返回 |
| --- | --- |
| GET /capabilities | ledger/subscriptionPayments/automation/protocolVersion |
| GET /ledger；PATCH /ledger | 账本元数据；修改要求 version |
| GET /accounts；POST /accounts；PATCH /accounts/{id} | 账户与精确 balance；PATCH 提交完整账户输入和 version |
| GET /transactions | limit 1–100、cursor、from/to、account（包含转入端）、kind/status/category/merchant/tag/refundOf；返回 items/nextCursor |
| GET /transactions/{id}；POST /transactions | 单笔详情；创建输入严格拒绝未知字段 |
| PATCH /transactions/{id} | 局部更正，必须带 version；拒绝 null 与未知字段 |
| POST /transactions/{id}/void | version、reason |
| GET /reports/summary | from/to、timeZone、basis、baseCurrency、byCurrency、unconvertedCurrencies |
| GET /budgets；PUT /budgets | 读取带 month；按唯一键保存，新增 version=0，更正携带当前 version |
| GET /audit | 当前用户最近 100 条账务变更；历史也进入备份 |
| GET /export；POST /restore | 独立 financeSnapshot v1；恢复前完整校验 |

响应仍为 `{ok:true,data:...}` / `{error:{code,message,details?}}`。版本冲突、退款超额、关联退款、归档账户、币种锁定、非空账本恢复返回稳定错误码。所有产品操作均生成 X-Request-ID。

## 订阅账单的后续契约（P0-02；实现属于 P2）

- 独立保存订阅启用账单的日期、不可变系列 ID、周期锚点、规则版本和顺序号。stableCycleKey 为系列 ID + 顺序号，禁止用可编辑 nextBillingDate 当唯一键。
- 首次启用仅生成启用日期之后的应付期次，生成未来 90 天计划并保留已到期未付项；月/年周期从锚点计算，月末截断不累计漂移。历史回填需独立预览。
- planned、settled、skipped、cancelled 持久化；due 由 date-only 和账本时区派生。状态转换、付款、关联、撤销关联和流水作废在同一事务中更新。
- 一个账单最多一笔主付款，一笔支出最多结算一个账单，唯一性在数据库保护。关联已有流水不新增支出；金额允许偏差，同币种且归属一致。退款保留原付款事实，只显示实付净额。
- 调价/改周期/改锚点仅替换未结算的未来快照，保持其稳定期次；已结算与已跳过历史不重写。新锚点不得落入已关闭的历史周期，冲突需显式处理，不能再生成同一期。
- 暂停/取消只取消未来待付款计划，历史未付款项与付款事实保留；原 autoRenew 只推进订阅日期，不自动生成实际付款。
- 订阅 version 必须覆盖网页、collection hooks、导入及定时维护的所有写入路径；P2/P3 加入这层保护，旧只读 DTO 不自动扩权。

## 自动化的后续契约（P0-04；实现属于 P3）

前缀 `/api/automation/v1`，保留架构文档的查询、流水创建/修改/作废、订阅读写、账单查询/结算及报告路径，并增加 GET /operations/{id} 用于超时恢复。GET /me 返回当前 scopes、允许账本、时区及真实 capabilities。

| 操作 | 必须同时具备的 scope |
| --- | --- |
| 账户/分类/报告读取 | accounts:read / categories:read / reports:read |
| 流水列表/详情、创建、更正、作废 | transactions:read / create / update / void，各自独立 |
| 订阅/账单读取 | subscriptions:read |
| 订阅创建/修改 | subscriptions:write |
| 新建付款结算 | subscriptions:read + subscriptions:write + transactions:create |
| 关联已有支出结算/撤销关联 | subscriptions:read + subscriptions:write + transactions:read + transactions:update |

管理接口仅网页登录使用，Agent 不管理账户、凭据、白名单或系统设置。所有引用再做 owner、ledger、币种、状态校验；组合 scope 不代替资源归属检查。

- 稳定 automation_client 保存允许账本、权限上限、白名单与停用状态；独立 Token 高熵随机生成，仅存哈希及前缀，一次显示明文。到期、撤销、停用、scope 及来源每请求重查，轮换不改变客户端身份。
- 来源只认 socket peer；显式可信代理才读 X-Forwarded-For，按 peer 向左回溯至首个非可信客户端；不信任 X-Real-IP/Forwarded 或任意转发头。链长最多 20，非法链、缺失可证明来源或全链均为代理时拒绝。
- IPv4/IPv6/CIDR、IPv4-mapped IPv6 统一规范化。可信代理和客户端允许列表分开；全局白名单必须非空有效，凭据级未配置时继承，显式空列表拒绝，二者并存取交集。策略解析失败仅关闭自动化能力，不放开访问。
- 写入必须携带 Idempotency-Key（16–128 个安全 ASCII 字符）。唯一范围为 user/client/method/规范路径/key，哈希采用规范化后的严格请求；同键同内容返回保存的原响应，同键异内容 409。写入、结算、审计和完成结果同事务提交。
- 原结果保留 90 天，过期键保留摘要墓碑并返回 410 IDEMPOTENCY_KEY_EXPIRED，禁止将原键重新当作新记账请求。外部来源唯一标识长期保留。幂等重放和结果读取先检查当前认证、来源、权限与账本范围。
- 初始限流为每客户端 60 次读取/分钟、30 次写入/分钟；来源拒绝与无效 Token 使用独立 IP 限流；429 返回 Retry-After。分页最多 100，报告最多 366 天，JSON 写入最多 1 MiB。请求 ID 由服务端产生，Token、认证头和原始票据不进入日志。
- 统一代码包含 SOURCE_NOT_ALLOWED、SOURCE_UNKNOWN、SCOPE_DENIED、TOKEN_EXPIRED、TOKEN_REVOKED、VERSION_CONFLICT、IDEMPOTENCY_CONFLICT、IDEMPOTENCY_KEY_EXPIRED、OCCURRENCE_ALREADY_SETTLED、FINANCE_NOT_SUPPORTED。错误不泄露其他用户对象。
- 用户备份永远排除客户端/Token/幂等凭据材料。完整实例备份可能包含认证哈希；P3 增加部署环境的 Token generation，离线恢复实例后必须轮换 generation 并重新签发，不能承诺自动识别任意目录回滚。
- 首版批次为预览后逐项提交，每项固定幂等键；部分成功单独报告，不承诺未实现的批量原子性。

## 验证样例、迁移与能力例外（P0-05）

共享 fixture 覆盖 32 元支出、5000 元收入、1000 元转账、86 元消费的 20 元退款：现金余额 3982、银行余额 1010、实际净支出 98、结余 4902。Go 使用同一 JSON 执行真实领域操作；共享 schema 验证相同输入边界。

另有旧实例 schema 重跑不虚构付款、并发退款只有一个成功、必要审计失败不提交账务、更正版本冲突、跨用户引用拒绝、退款作废/原消费作废顺序、预算实际进度、完整快照校验及重复恢复样例。P2/P3 的并发结算、幂等与代理伪造样例仍需随对应实现执行，不能把设计样例记成已通过。

迁移顺序为 ledgers → accounts → transactions（先存自关联 collection）→ budgets/audit → 默认账本数据迁移。用户快照 v1 包含上述事实、版本、关联和历史，不包含认证材料；恢复只允许空账本，映射新 ID，并按原状态校验完整退款与余额。旧备份无 finance 段时保留现有账本。

首版每账本最多 500 账户、500 预算；用户快照最多 10,000 流水、10,000 历史事件、8 MiB JSON，超过上限明确失败，不截断导出。更大实例应使用完整 Docker data 目录备份。常规批次导入保持原有分块语义，整个批次并非一个事务，失败后仍使用原文件重试。

`/api/app/finance/capabilities` 在两个运行时均存在。Docker 当前只报告 ledger=true，subscriptionPayments/automation=false；Worker 三者为 false，并拒绝含 finance 的导入，防止静默丢失。parity 仅增加 16 条准确的 Docker 财务路由例外，保留既有 cron 例外；检查器继续拒绝未登记差异和过期例外，P5 实现后逐条移除。
