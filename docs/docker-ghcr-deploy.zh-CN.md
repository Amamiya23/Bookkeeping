# 推送后自动构建 Docker 镜像

`.github/workflows/docker-publish.yml` 使用当前仓库的 `GITHUB_TOKEN` 发布镜像到 GitHub Container Registry（GHCR），无需配置 Docker Hub 账号或额外的发布密钥。

| 触发方式 | 镜像标签 |
| --- | --- |
| 推送到 `main` | `latest`、`main`、项目完整版本号、主次版本号、`sha-<完整提交 SHA>` |
| 推送到 `dev` | `dev`、`sha-<完整提交 SHA>` |
| Actions → Docker Publish → Run workflow | 根据选择的 `main` / `dev` 分支使用上述标签，其它分支跳过 |

镜像同时支持 `linux/amd64` 和 `linux/arm64`。名称由仓库自动生成并转为小写；本仓库为 `ghcr.io/amamiya23/bookkeeping`。构建结果和提交标签会显示在 Actions 运行摘要中。

## 二开版本管理

本仓库采用独立版本进度，当前版本定义为 **V1.0**，`package.json` 中使用标准版本号 `1.0.0`。`main` 镜像内显示 `1.0.0`，并发布 `:1.0.0` 和 `:1.0` 标签；`dev` 镜像显示 `1.0.0-dev+<短提交 SHA>`，不会更新正式版本标签。

后续发布 V1.1 时，在本地同步产品 workspace 的版本号：

```bash
node scripts/set-fork-version.mjs 1.1.0
# 已安装项目要求的 Node.js / pnpm 时，也可以使用 pnpm version:sync 1.1.0
```

修复版本可以使用 `1.0.1`。提交并推送到 `main` 后，Actions 按新的版本号发布镜像。版本号不随推送自动递增，也不读取上游 release tag。

同一版本号下继续推送会更新对应版本镜像；需要锁定某次构建时，使用 `sha-<完整提交 SHA>` 或镜像 digest。仓库原有的 Maintainer Release / Release Publish 属于上游发布链路，本仓库通过 **Docker Publish** 和 `version:sync` 管理二开镜像。

## GitHub 设置

1. 将工作流提交并推送到 GitHub。在 fork 仓库中，如果 Actions 尚未启用，先在 **Actions** 页面启用，再手动运行 **Docker Publish**。
2. 等待 **Docker Publish** 成功。工作流已经声明 `contents: read` 和 `packages: write`；如组织策略禁止包写入，需要允许该仓库发布 Packages。
3. 若希望服务器免登录拉取，在 GitHub 个人主页的 **Packages → bookkeeping → Package settings → Change visibility** 中将镜像设为 **Public**。GHCR 包首次发布默认是私有的，即使代码仓库是公开的。

如果镜像包已经存在且出现 `permission_denied: write_package`，在该包的 **Package settings → Manage Actions access** 中给当前仓库写权限。

## 服务器首次部署

需要 Docker 和 Docker Compose v2。以下命令在新部署目录执行，下载本仓库的部署模板、生成密钥，并使用本仓库镜像启动：

```bash
mkdir -p bookkeeping && cd bookkeeping
curl -fsSL https://raw.githubusercontent.com/Amamiya23/Bookkeeping/main/deploy/docker-deploy.sh -o docker-deploy.sh
RENEWLET_RAW_BASE=https://raw.githubusercontent.com/Amamiya23/Bookkeeping/main/deploy bash docker-deploy.sh
sed -i.bak 's#^RENEWLET_IMAGE=.*#RENEWLET_IMAGE="ghcr.io/amamiya23/bookkeeping:latest"#' .env
docker compose pull
docker compose up -d
docker compose ps
```

打开 `http://服务器地址:3000/setup` 创建管理员。反向代理部署时，将 `.env` 中的 `APP_URL` 设置为你的 HTTPS 域名。

如果你使用其它 fork，请替换下载地址中的 owner/repository，并把镜像名称改为对应的小写名称。

## 更新已有部署

已有部署使用 `deploy/docker-compose.yml` 时，在服务器原有 `.env` 中设置：

```env
RENEWLET_IMAGE="ghcr.io/amamiya23/bookkeeping:latest"
```

每次推送后，等待 Actions 构建成功，再在服务器原部署目录执行：

```bash
docker compose pull
docker compose up -d
docker compose logs --tail=100
```

保持原数据挂载和 `PB_ENCRYPTION_KEY`。该模板将数据持久化到 `./data`；升级前备份 `.env`、`docker-compose.yml` 和 `data/`。

使用仓库根目录的 `docker-compose.ghcr.yml` 时，同样在 `.env` 中设置 `RENEWLET_IMAGE`，并在每条命令中增加 `-f docker-compose.ghcr.yml`。此模板使用命名卷 `renewlet-pb-data`，应沿用原模板和原部署目录来保留数据。

跟随开发分支时使用 `:dev`。需要固定版本或回滚时，使用 Actions 摘要中的 `:sha-<完整提交 SHA>` 标签。镜像回滚不会撤销数据库迁移；涉及迁移的回滚还需配套的数据备份。

## 私有镜像拉取

保留私有包时，服务器需要使用有该包读取权限、包含 `read:packages` 的 Personal Access Token（classic）登录：

```bash
read -rsp 'GitHub PAT: ' GHCR_TOKEN; echo
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
unset GHCR_TOKEN
docker compose pull
docker compose up -d
```

组织启用 SSO 时，还需为 Token 授权该组织。

官方说明：[GitHub Actions 发布 Docker 镜像](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)、[GHCR 权限与身份验证](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)。
