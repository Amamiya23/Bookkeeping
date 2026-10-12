# Renewlet

<p align="center">
  <img src="./apps/web/public/logo.svg" alt="Renewlet" width="320">
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> · <a href="README.md">English</a>
</p>

<p align="center">
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-0f172a?style=flat-square">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ed?style=flat-square">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare%20Workers-ready-f38020?style=flat-square">
  <img alt="Memory 20-30MiB" src="https://img.shields.io/badge/memory-20--30MiB-10b981?style=flat-square">
  <img alt="MIT License" src="https://img.shields.io/badge/license-MIT-111827?style=flat-square">
</p>

Renewlet 是一个兼顾订阅管理的自托管记账平台。日常收支、订阅付款和房租等周期支出汇入同一份账单，让你看到整体消费和下一笔待付款。

可以用 Docker 单容器运行，也可以部署到 Cloudflare Workers。

## 在线演示

<https://demo.renewlet.cc/>

使用 `demo@renewlet.local` / `renewlet-demo` 登录。数据会定期重置，请勿填写真实信息或凭据。

<p align="center">
  <img src="./docs/screenshots/renewlet-dashboard-zh.png" alt="Renewlet 中文仪表盘，展示月度支出、近期续费和支出分布" width="100%">
</p>

## 功能

- 记录订阅：价格、扣费周期、续费日、付款方式和备注都放在一处。
- 统一记账（Go 后端）：记录收入和支出，外币保留原金额并折算人民币，查看整体消费、用途分布和商家支出。
- 周期付款（Go 后端）：订阅、房租和家庭账单到期后等待确认；确认入账或关联已有账单，再推进下次日期。
- 续费提醒：按你的时区提前发送，渠道包括 Telegram、Notifyx、Webhook、企业微信、钉钉、邮件、Bark、Server酱、Discord 和 PushPlus。
- 录入和迁移：从截图、备忘录或表格生成可编辑草稿，确认后再导入；也可以导入导出 Renewlet 数据或迁入 Wallos 文件。
- 日历和分享：把全部或单个订阅加入日历，或生成可隐藏金额的公开状态页。
- 账号安全：使用身份验证器、恢复码或通行密钥，也可以为密码登录开启 Cloudflare Turnstile。
- 自动化：通过只读 [Public API](docs/public-api.md) 接入 CLI、Shortcuts 和其他工具。

## 本机运行与功能测试（源码）

测试当前工作目录中的修改，推荐使用 Go 后端 + Vite 前端，前端支持热更新。无需 Docker、Cloudflare 账号或 AI 密钥；日常记账和消费总览需要 Go 后端。

### 1. 准备依赖

| 工具 | 当前项目要求 |
| --- | --- |
| [Node.js](https://nodejs.org/en/download) | `>=24.19.0 <25` 或 `>=26.5.0 <27`，推荐 24.19.x。 |
| pnpm | `11.20.0`，使用 Corepack 按根目录 `package.json` 的版本运行。 |
| [Go](https://go.dev/dl/) | `1.27.2` 或更高兼容版本，以 `apps/docker-server/go.mod` 为准。 |

在仓库根目录执行一次：

```powershell
node --version
corepack pnpm --version
go version
corepack pnpm install --frozen-lockfile
```

已有源码无需重新克隆。若未安装 Corepack，先执行 `npm install --global corepack`，再重新打开终端。这里直接使用 `corepack pnpm`，无需通过 `corepack enable` 创建全局命令。

### 2. 终端一：启动后端

在仓库根目录打开 PowerShell：

```powershell
Set-Location apps/docker-server
$env:SETUP_ENABLED = "true"
$env:RENEWLET_DEMO_MODE = "false"
$env:NOTIFICATION_SCHEDULER_ENABLED = "false"
go run ./cmd/renewlet serve --http=127.0.0.1:3000 --dir=./pb_data_dev
```

首次运行会下载 Go 依赖并编译，请等待出现服务监听信息。测试数据保存在 `apps/docker-server/pb_data_dev/`，重启后保留。以上命令关闭本地通知调度器；测试自动通知时，将对应环境变量改为 `"true"` 后重启后端。

### 3. 终端二：启动前端

保持后端运行，在仓库根目录另开一个 PowerShell：

```powershell
$env:VITE_DEV_PROXY_TARGET = "http://127.0.0.1:3000"
corepack pnpm --filter @renewlet/client exec vite --host 127.0.0.1 --port 5173 --strictPort
```

浏览器打开 **http://127.0.0.1:5173/setup**，创建第一个管理员；以后访问 **http://127.0.0.1:5173/** 登录。前端会把 API 请求代理到后端，浏览器测试请统一使用这个前端地址。

登录后从顶部或手机底部的「记一笔」登记收支，在「账单」查看和更正，在「总览」「分析」查看统一人民币金额、趋势和消费用途。退款、收到的转账选择收入分类。「账单 → 周期计划」可添加房租等周期支出；订阅到期后确认付款，自动关联实际账单。订阅日历、服务成本分析与付款历史放在「订阅」内。详细规则见 [统一记账与周期付款](docs/finance.zh-CN.md)。

修改前端代码后页面自动更新；修改 Go 代码后，在终端一按 `Ctrl+C`，重新运行后端命令。停止项目时，在两个终端分别按 `Ctrl+C`。这套开发方式无需执行 `pnpm start` 或同步前端静态文件；Go 进程直接读取系统环境变量，不会自动加载根目录的 `.env`。

### 常见启动问题

- **找不到 `go`**：安装 Go 后重新打开终端，并确认其 `bin` 目录已加入 `PATH`。本机此前测试使用过临时 Go 工具链；如果该目录仍存在，也可在后端终端临时执行以下命令后再启动：

  ```powershell
  $env:PATH = (Join-Path $env:LOCALAPPDATA "Temp\renewlet-go127\go\bin") + ";" + $env:PATH
  go version
  ```

- **端口被占用**：后端可改为 `--http=127.0.0.1:3001`，同时把前端的 `VITE_DEV_PROXY_TARGET` 改为 `http://127.0.0.1:3001`；前端端口可改为 `--port 5174`，访问地址也改为 5174。
- **API 请求失败或登录后无数据**：确认两个终端都在运行，且代理目标与后端端口一致。可打开 `http://127.0.0.1:3000/api/app/health` 检查后端状态。
- **需要一套全新的测试数据**：停止后端，把 `--dir` 改为另一个目录，例如 `./pb_data_dev_2`，再启动并重新创建管理员。
- **依赖下载失败**：检查本机网络或代理。初次运行 Corepack 和 Go 都需要下载依赖。

macOS/Linux 使用相同版本和命令，将 PowerShell 的 `$env:NAME = "value"` 换成 `export NAME=value`，将 `Set-Location` 换成 `cd`。

命令参考：[pnpm 安装依赖](https://pnpm.io/cli/install)、[Vite CLI](https://vite.dev/guide/cli.html)、[Go 命令](https://go.dev/cmd/go/)。更多开发和检查命令见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 快速部署

需要 Docker 和 Docker Compose v2。

```bash
mkdir -p renewlet && cd renewlet
curl -fsSL https://raw.githubusercontent.com/zhiyingzzhou/renewlet/main/deploy/docker-deploy.sh | bash
docker compose up -d
```

启动后打开：

```text
http://localhost:3000/setup
```

创建第一个管理员。部署脚本会生成 `docker-compose.yml`、`.env` 和 `data/`，并写入 `PB_ENCRYPTION_KEY` 与 `CRON_SECRET`。

正式使用时建议固定版本：

```bash
sed -i.bak 's#RENEWLET_IMAGE=.*#RENEWLET_IMAGE="zhiyingzzhou/renewlet:0.3.30"#' .env
docker compose pull
docker compose up -d
```

如果 Docker Hub 拉取不可用，改用 GHCR：

```env
RENEWLET_IMAGE="ghcr.io/zhiyingzzhou/renewlet:0.3.30"
```

## Cloudflare Workers

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/zhiyingzzhou/renewlet"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"></a>

点击上方按钮直接部署。需要自己管理 Cloudflare 资源时，请按 [Cloudflare Workers 部署](docs/cloudflare-workers-deploy.zh-CN.md) 操作。

升级已有实例时不要再次点击部署按钮，按部署文档同步现有仓库即可。

## 升级

升级前先备份数据和配置：

```bash
tar -czf renewlet-backup-$(date +%F).tgz .env docker-compose.yml data
```

更新 Docker 镜像：

```bash
sed -i.bak 's#RENEWLET_IMAGE=.*#RENEWLET_IMAGE="zhiyingzzhou/renewlet:0.3.30"#' .env
docker compose pull
docker compose up -d
docker compose logs -f
```

也可以点击页面顶部的版本号，在“系统更新”中完成更新。

## 常用命令

```bash
docker compose ps
docker compose logs -f
docker compose down
```

常用 `.env` 配置：

| 变量 | 用途 |
| --- | --- |
| `PORT` | 对外端口，默认 `3000`。 |
| `RENEWLET_IMAGE` | Docker 镜像，默认 `zhiyingzzhou/renewlet:latest`。 |
| `TZ` | 日志时区；提醒使用每个用户设置的时区。 |
| `PB_ENCRYPTION_KEY` | 敏感设置加密密钥，部署后不要更换。 |
| `CRON_SECRET` | 外部 Cron 请求使用的 Bearer 密钥。 |
| `RENEWLET_DEMO_MODE` | 是否开启演示模式，默认 `false`。 |
| `RENEWLET_CUSTOM_HEAD_HTML` | 可选的自定义 `<head>` 内容，默认留空。 |
| `NOTIFICATION_SCHEDULER_ENABLED` | 是否启用内置通知调度器，默认 `true`。 |
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | Docker 服务端发出 HTTP(S) 请求时推荐使用的代理变量。 |

完整 Docker 环境变量模板见 `.env.example`。

### 上游代理

Docker 服务端发出的 HTTP(S) 请求需要代理时，在 `.env` 中配置：

```env
HTTP_PROXY="http://host.docker.internal:7890"
HTTPS_PROXY="http://host.docker.internal:7890"
NO_PROXY="localhost,127.0.0.1,.local"
```

默认使用大写变量。小写备选名为 `http_proxy`、`https_proxy` 和 `no_proxy`。不要同时配置大小写两组变量；两组同时存在时，Go 优先读取大写值。

代理运行在宿主机时，请填写容器可以访问的地址，不要使用 `localhost` 或 `127.0.0.1`。修改后重新创建容器：

```bash
docker compose up -d --force-recreate
```

### 自定义 Head HTML

需要接入 [Microsoft Clarity](https://learn.microsoft.com/zh-cn/clarity/setup-and-installation/clarity-setup) 等第三方服务时，把服务商提供的 `<head>` 代码原样填入 `RENEWLET_CUSTOM_HEAD_HTML`。Docker `.env` 中的多行代码用单引号包裹。

只添加你信任的代码，它可以访问 Renewlet 页面中的数据。修改后，Docker 部署需重启容器，Cloudflare 部署需重新构建并部署。

## 截图

<table>
  <tr>
    <td width="50%">
      <strong>AI 识别订阅</strong><br>
      <img src="./docs/screenshots/renewlet-ai-recognition-zh.png" alt="Renewlet 中文 AI 识别订阅弹窗，展示从文本内容生成可编辑订阅草稿前的输入态">
    </td>
    <td width="50%">
      <strong>公开订阅状态页</strong><br>
      <img src="./docs/screenshots/renewlet-public-status-zh.png" alt="Renewlet 中文公开订阅状态页，展示公开订阅汇总、价格和订阅卡片">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>订阅清单</strong><br>
      <img src="./docs/screenshots/renewlet-subscriptions-zh.png" alt="Renewlet 中文订阅清单，展示筛选、标签、状态和服务 Logo">
    </td>
    <td width="50%">
      <strong>统计分析</strong><br>
      <img src="./docs/screenshots/renewlet-statistics-zh.png" alt="Renewlet 中文统计页面，展示预算、分类支出和付款方式图表">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>续费日历</strong><br>
      <img src="./docs/screenshots/renewlet-calendar-zh.png" alt="Renewlet 中文续费日历，展示月度续费事件和预计支出">
    </td>
    <td width="50%">
      <strong>通知设置</strong><br>
      <img src="./docs/screenshots/renewlet-notifications-zh.png" alt="Renewlet 中文通知设置，展示通知渠道和邮件配置">
    </td>
  </tr>
</table>

### 移动端

<table>
  <tr>
    <td width="50%">
      <strong>移动端订阅列表</strong><br>
      <img src="./docs/screenshots/renewlet-subscriptions-h5-zh.png" alt="Renewlet 中文 H5 订阅列表，展示移动端筛选区、订阅卡片、Logo、价格和标签">
    </td>
    <td width="50%">
      <strong>移动端通知方式</strong><br>
      <img src="./docs/screenshots/renewlet-notifications-h5-zh.png" alt="Renewlet 中文 H5 通知方式，展示邮件通知渠道和 SMTP 邮件配置">
    </td>
  </tr>
</table>

## 贡献

欢迎提交 issue、文档修正、测试或 pull request。较大的变更请先开 issue，说明目标、使用场景和大致方案。

## 许可证

Renewlet 基于 [MIT License](LICENSE) 开源。
