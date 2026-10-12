#!/usr/bin/env node
// 二开版本独立于上游 release tag，只同步产品 workspace 的版本元数据。
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (process.argv.length !== 3 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? "")) {
  console.error("Usage: node scripts/set-fork-version.mjs <version>, for example 1.1.0");
  process.exit(1);
}

const packagePaths = [
  "package.json",
  "apps/web/package.json",
  "apps/worker/package.json",
  "apps/docker-server/package.json",
  "packages/shared/package.json",
];

// 写入前读取全部 manifest，避免解析错误导致只更新部分 workspace。
const manifests = packagePaths.map((path) => {
  const url = new URL(`../${path}`, import.meta.url);
  const manifest = JSON.parse(readFileSync(url, "utf8"));
  manifest.version = version;
  return { url, manifest };
});
for (const { url, manifest } of manifests) {
  writeFileSync(url, `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(`Synced fork product version to ${version}.`);
