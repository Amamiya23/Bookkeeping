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

Renewlet is a self-hosted accounting platform with subscription management. Daily transactions, subscription payments, and recurring bills share one ledger, so you can review overall spending and upcoming payments.

Run it in a single Docker container or deploy it to Cloudflare Workers.

This fork follows its own release schedule, currently at **V1.1** (`1.1.0`). See [automatic builds and GHCR deployment (Chinese)](docs/docker-ghcr-deploy.zh-CN.md) for deployment and version management.

## Demo

<https://demo.renewlet.cc/>

Sign in with `demo@renewlet.local` / `renewlet-demo`. Data resets regularly; do not enter real information or credentials.

<p align="center">
  <img src="./docs/screenshots/renewlet-dashboard-en.png" alt="Renewlet dashboard showing monthly spend, upcoming renewals, and spending distribution" width="100%">
</p>

## Features

- Keep prices, billing cycles, renewal dates, payment methods, and notes in one place.
- Unified accounting (Go backend): record income and expenses, preserve original currencies with saved CNY amounts, and review spending by purpose and merchant.
- Recurring payments (Go backend): confirm subscription, rent, and household payments or link existing expenses before advancing the next due date.
- Send reminders in your timezone through Telegram, Notifyx, Webhook, WeCom, DingTalk, email, Bark, ServerChan, Discord, or PushPlus.
- Turn screenshots, notes, or tables into editable drafts, then review them before import. You can also import or export Renewlet data, or migrate from Wallos.
- Add all or individual subscriptions to a calendar, or share a public status page with prices hidden when needed.
- Secure the account with an authenticator, recovery codes, or passkeys, and optionally protect password login with Cloudflare Turnstile.
- Connect CLI tools, Shortcuts, and other automation through the read-only [Public API](docs/public-api.md).

## Run Locally for Testing (Source)

Use the Go backend with the Vite frontend to test changes in your current checkout. The frontend supports hot reload. Docker, a Cloudflare account, and AI credentials are not required; daily transactions and the spending overview require the Go backend.

### 1. Install Dependencies

| Tool | Required version |
| --- | --- |
| [Node.js](https://nodejs.org/en/download) | `>=24.19.0 <25` or `>=26.5.0 <27`; 24.19.x is recommended. |
| pnpm | `11.20.0`, selected by Corepack from the root `package.json`. |
| [Go](https://go.dev/dl/) | `1.27.2` or a later compatible version; see `apps/docker-server/go.mod`. |

Run once from the repository root:

```powershell
node --version
corepack pnpm --version
go version
corepack pnpm install --frozen-lockfile
```

If Corepack is unavailable, run `npm install --global corepack` and reopen the terminal. Calling `corepack pnpm` directly does not require creating global shims with `corepack enable`.

### 2. Terminal One: Backend

Open PowerShell in the repository root:

```powershell
Set-Location apps/docker-server
$env:SETUP_ENABLED = "true"
$env:RENEWLET_DEMO_MODE = "false"
$env:NOTIFICATION_SCHEDULER_ENABLED = "false"
go run ./cmd/renewlet serve --http=127.0.0.1:3000 --dir=./pb_data_dev
```

The first run downloads Go dependencies and compiles the server. Wait for the listening message. Test data persists in `apps/docker-server/pb_data_dev/`. These commands disable the notification scheduler; set its environment variable to `"true"` and restart the backend when testing scheduled notifications.

### 3. Terminal Two: Frontend

Keep the backend running and open another PowerShell in the repository root:

```powershell
$env:VITE_DEV_PROXY_TARGET = "http://127.0.0.1:3000"
corepack pnpm --filter @renewlet/client exec vite --host 127.0.0.1 --port 5173 --strictPort
```

Open **http://127.0.0.1:5173/setup** to create the first administrator, then use **http://127.0.0.1:5173/** for subsequent logins. Use this frontend address for browser testing; Vite proxies API requests to the backend.

Use the global “Add transaction” button to record income and expenses. Review and correct them in Bills; Overview and Analysis show unified CNY totals, trends, and spending categories. Record received transfers as income. Use Refund on the original expense for purchase refunds; these reduce net spending. Add rent and other recurring bills under Bills → Recurring plans; confirmed subscription payments also enter this ledger. Subscription calendars, service cost analysis, and payment history are inside Subscriptions. See the [accounting and recurring payments guide (Chinese)](docs/finance.zh-CN.md).

Frontend edits update automatically. After Go edits, press `Ctrl+C` in terminal one and rerun the backend command. Press `Ctrl+C` in both terminals to stop the app. This development workflow does not require `pnpm start` or copying frontend assets. The Go process reads environment variables directly and does not automatically load the root `.env` file.

### Troubleshooting

- **Go is not recognized:** install Go, ensure its `bin` directory is on `PATH`, and reopen the terminal. On the Windows machine previously used for local testing, the temporary toolchain may still be available:

  ```powershell
  $env:PATH = (Join-Path $env:LOCALAPPDATA "Temp\renewlet-go127\go\bin") + ";" + $env:PATH
  go version
  ```

- **Port already in use:** change the backend to `--http=127.0.0.1:3001` and update `VITE_DEV_PROXY_TARGET` to `http://127.0.0.1:3001`. Change the frontend to `--port 5174` and browse port 5174 if needed.
- **API or login fails:** keep both terminals running and check that the proxy targets the backend port. Check backend health at `http://127.0.0.1:3000/api/app/health`.
- **Fresh test data:** stop the backend and choose a new directory, such as `--dir=./pb_data_dev_2`, then restart and create a new administrator.
- **Dependency downloads fail:** check network and proxy settings. Corepack and Go need network access on their first run.

On macOS/Linux, use the same versions and commands, replacing `$env:NAME = "value"` with `export NAME=value` and `Set-Location` with `cd`.

Command references: [pnpm install](https://pnpm.io/cli/install), [Vite CLI](https://vite.dev/guide/cli.html), and [Go commands](https://go.dev/cmd/go/). See [CONTRIBUTING.md](CONTRIBUTING.md) for additional development and validation commands.

## Docker Quick Start

To deploy changes from this repository, see [automatic Docker builds and GHCR deployment (Chinese)](docs/docker-ghcr-deploy.zh-CN.md). Pushes to `main` publish `ghcr.io/amamiya23/bookkeeping:latest`.

Requirements: Docker and Docker Compose v2.

```bash
mkdir -p renewlet && cd renewlet
curl -fsSL https://raw.githubusercontent.com/Amamiya23/Bookkeeping/main/deploy/docker-deploy.sh | bash
docker compose up -d
```

After it starts, open:

```text
http://localhost:3000/setup
```

Create the first administrator. The deploy script creates `docker-compose.yml`, `.env`, and `data/`, then writes `PB_ENCRYPTION_KEY` and `CRON_SECRET`.

For production, pin a stable image tag:

```bash
sed -i.bak 's#RENEWLET_IMAGE=.*#RENEWLET_IMAGE="ghcr.io/amamiya23/bookkeeping:1.1.0"#' .env
docker compose pull
docker compose up -d
```

To follow the latest build from `main`, set this value in `.env`:

```env
RENEWLET_IMAGE="ghcr.io/amamiya23/bookkeeping:latest"
```

## Cloudflare Workers

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/zhiyingzzhou/renewlet"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"></a>

Click the button to deploy. To manage the Cloudflare resources yourself, follow the [Cloudflare Workers deployment guide](docs/cloudflare-workers-deploy.md).

For upgrades, update the existing repository as described in the guide instead of clicking the deploy button again.

## Upgrade

Back up your data and configuration first:

```bash
tar -czf renewlet-backup-$(date +%F).tgz .env docker-compose.yml data
```

Update the Docker image:

```bash
sed -i.bak 's#RENEWLET_IMAGE=.*#RENEWLET_IMAGE="ghcr.io/amamiya23/bookkeeping:1.1.0"#' .env
docker compose pull
docker compose up -d
docker compose logs -f
```

Update this fork by pulling its Docker image as shown above. The in-app System Update still uses the upstream release source.

## Common Commands

```bash
docker compose ps
docker compose logs -f
docker compose down
```

Common `.env` values:

| Variable | Purpose |
| --- | --- |
| `PORT` | Public port, `3000` by default. |
| `RENEWLET_IMAGE` | Docker image, `ghcr.io/amamiya23/bookkeeping:latest` by default. |
| `TZ` | Time zone for logs; reminders use each user's time zone. |
| `PB_ENCRYPTION_KEY` | Encryption key for sensitive settings. Do not change it after deployment. |
| `CRON_SECRET` | Bearer secret for external Cron requests. |
| `RENEWLET_DEMO_MODE` | Enables demo mode. `false` by default. |
| `RENEWLET_CUSTOM_HEAD_HTML` | Optional custom `<head>` content. Empty by default. |
| `NOTIFICATION_SCHEDULER_ENABLED` | Enables the built-in notification scheduler. `true` by default. |
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | Recommended proxy variables for outbound HTTP(S) requests from the Docker server. |

The full Docker environment template is in `.env.example`.

### Upstream Proxy

To proxy HTTP(S) requests made by the Docker server, set these values in `.env`:

```env
HTTP_PROXY="http://host.docker.internal:7890"
HTTPS_PROXY="http://host.docker.internal:7890"
NO_PROXY="localhost,127.0.0.1,.local"
```

Use the uppercase names by default. The lowercase alternatives are `http_proxy`, `https_proxy`, and `no_proxy`. Do not set both forms; when both are present, Go uses the uppercase value.

If the proxy runs on the host, use an address the container can reach instead of `localhost` or `127.0.0.1`. Recreate the container after a change:

```bash
docker compose up -d --force-recreate
```

### Custom Head HTML

To add a third-party service such as [Microsoft Clarity](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup), copy the provider's `<head>` code into `RENEWLET_CUSTOM_HEAD_HTML` unchanged. Wrap multiline values in single quotes when using a Docker `.env` file.

Only add code you trust; it can access data on Renewlet pages. Restart the Docker container after a change, or rebuild and redeploy Cloudflare.

## Screenshots

<table>
  <tr>
    <td width="50%">
      <strong>AI recognition</strong><br>
      <img src="./docs/screenshots/renewlet-ai-recognition-en.png" alt="Renewlet AI recognition dialog showing the input state before turning text content into editable subscription drafts">
    </td>
    <td width="50%">
      <strong>Public subscription status page</strong><br>
      <img src="./docs/screenshots/renewlet-public-status-en.png" alt="Renewlet public subscription status page showing public subscription totals, prices, and subscription cards">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Subscriptions</strong><br>
      <img src="./docs/screenshots/renewlet-subscriptions-en.png" alt="Renewlet subscriptions view with filters, tags, statuses, and service logos">
    </td>
    <td width="50%">
      <strong>Statistics</strong><br>
      <img src="./docs/screenshots/renewlet-statistics-en.png" alt="Renewlet statistics view with budget usage, category spending, and payment method charts">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Renewal calendar</strong><br>
      <img src="./docs/screenshots/renewlet-calendar-en.png" alt="Renewlet renewal calendar showing monthly renewal events and estimated spend">
    </td>
    <td width="50%">
      <strong>Notifications</strong><br>
      <img src="./docs/screenshots/renewlet-notifications-en.png" alt="Renewlet notification settings showing channels and email configuration">
    </td>
  </tr>
</table>

### Mobile

<table>
  <tr>
    <td width="50%">
      <strong>Mobile subscriptions</strong><br>
      <img src="./docs/screenshots/renewlet-subscriptions-h5-en.png" alt="Renewlet mobile subscriptions view with filters, subscription cards, logos, prices, and tags">
    </td>
    <td width="50%">
      <strong>Mobile notification methods</strong><br>
      <img src="./docs/screenshots/renewlet-notifications-h5-en.png" alt="Renewlet mobile notification methods view showing the email channel and SMTP email configuration">
    </td>
  </tr>
</table>

## Contributing

Issues, documentation fixes, tests, and pull requests are welcome. For larger changes, open an issue first with the goal, use case, and rough approach.

## License

Renewlet is open-sourced under the [MIT License](LICENSE).
