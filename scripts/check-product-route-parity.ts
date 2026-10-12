#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// parity 通过各运行面的测试进程导出真实 registry；Node CLI 不能直接加载 Worker 的 cloudflare:* 平台模块。

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(join(tmpdir(), "renewlet-route-parity-"));
const goManifestPath = join(tempDir, "go-routes.json");
const workerManifestPath = join(tempDir, "worker-routes.json");

interface GoRouteManifestEntry {
  Path: string;
  Methods: string[];
}

interface WorkerRouteManifestEntry {
  path: string;
  methods: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function parseGoRouteManifest(value: unknown): GoRouteManifestEntry[] {
  if (!isUnknownArray(value)) throw new Error("Go route manifest must be an array");
  return value.map((entry, index) => {
    if (!isRecord(entry) || typeof entry["Path"] !== "string" || !isUnknownArray(entry["Methods"])) {
      throw new Error(`Go route manifest entry ${index} has an invalid shape`);
    }
    const methods = entry["Methods"];
    if (!methods.every((method): method is string => typeof method === "string")) {
      throw new Error(`Go route manifest entry ${index} contains a non-string method`);
    }
    return { Path: entry["Path"], Methods: methods };
  });
}

function parseWorkerRouteManifest(value: unknown): WorkerRouteManifestEntry[] {
  if (!isUnknownArray(value)) throw new Error("Worker route manifest must be an array");
  return value.map((entry, index) => {
    if (!isRecord(entry) || typeof entry["path"] !== "string" || !isUnknownArray(entry["methods"])) {
      throw new Error(`Worker route manifest entry ${index} has an invalid shape`);
    }
    const methods = entry["methods"];
    if (!methods.every((method): method is string => typeof method === "string")) {
      throw new Error(`Worker route manifest entry ${index} contains a non-string method`);
    }
    return { path: entry["path"], methods };
  });
}

const runtimeOnly = {
  // Accounting and recurring payments are capability-gated on Docker/Go.
  // Stale checks reject exceptions removed or implemented on both runtimes.
  go: new Set([
    "GET /api/cron/notifications",
    "GET /api/app/finance/ledger", "PATCH /api/app/finance/ledger",
    "GET /api/app/finance/accounts", "POST /api/app/finance/accounts", "PATCH /api/app/finance/accounts/{id}",
    "GET /api/app/finance/transactions", "POST /api/app/finance/transactions",
    "GET /api/app/finance/transactions/{id}", "PATCH /api/app/finance/transactions/{id}", "POST /api/app/finance/transactions/{id}/void",
    "GET /api/app/finance/reports/summary", "GET /api/app/finance/budgets", "PUT /api/app/finance/budgets",
    "GET /api/app/finance/audit", "GET /api/app/finance/export", "POST /api/app/finance/restore",
    "GET /api/app/finance/plans", "POST /api/app/finance/plans", "PATCH /api/app/finance/plans/{id}", "POST /api/app/finance/plans/{id}/settle",
  ]),
  worker: new Set<string>(),
};

function flatten(entries: Array<{ path: string; methods: string[] }>): Set<string> {
  return new Set(entries.flatMap((entry) => entry.methods.map((method) => `${method} ${entry.path}`)));
}

try {
  const goTest = spawnSync("go", ["test", "./cmd/renewlet", "-run", "^TestExportProductRouteManifest$", "-count=1"], {
    cwd: join(repoRoot, "apps/docker-server"),
    encoding: "utf8",
    env: { ...process.env, RENEWLET_ROUTE_MANIFEST_OUTPUT: goManifestPath },
  });
  if (goTest.error) throw new Error(`Go route manifest process failed: ${goTest.error.message}`);
  if (goTest.status !== 0) {
    process.stderr.write(goTest.stdout);
    process.stderr.write(goTest.stderr);
    throw new Error("Go route manifest export failed");
  }

  const workerTest = spawnSync(
    "pnpm",
    ["--filter", "@renewlet/cloudflare", "exec", "vitest", "run", "src/route-manifest.test.ts"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, RENEWLET_WORKER_ROUTE_MANIFEST_OUTPUT: workerManifestPath },
      // Windows Corepack exposes pnpm.cmd, which requires a command shell.
      // This invocation uses only the fixed arguments above.
      shell: process.platform === "win32",
    },
  );
  if (workerTest.error) throw new Error(`Worker route manifest process failed: ${workerTest.error.message}`);
  if (workerTest.status !== 0) {
    process.stderr.write(workerTest.stdout);
    process.stderr.write(workerTest.stderr);
    throw new Error("Worker route manifest export failed");
  }

  // 两侧 JSON 都来自真实 router registry；shape 校验阻止测试进程或临时文件损坏被当作契约结果。
  const goRaw = parseGoRouteManifest(JSON.parse(readFileSync(goManifestPath, "utf8")));
  const workerRaw = parseWorkerRouteManifest(JSON.parse(readFileSync(workerManifestPath, "utf8")));
  const goRoutes = flatten(goRaw.map((entry) => ({ path: entry.Path, methods: entry.Methods })));
  const workerRoutes = flatten(workerRaw);
  const missingFromWorker = [...goRoutes].filter((route) => !workerRoutes.has(route) && !runtimeOnly.go.has(route)).sort();
  const missingFromGo = [...workerRoutes].filter((route) => !goRoutes.has(route) && !runtimeOnly.worker.has(route)).sort();
  const staleGoAllowlist = [...runtimeOnly.go].filter((route) => !goRoutes.has(route) || workerRoutes.has(route)).sort();
  const staleWorkerAllowlist = [...runtimeOnly.worker].filter((route) => !workerRoutes.has(route) || goRoutes.has(route)).sort();
  if (missingFromWorker.length || missingFromGo.length || staleGoAllowlist.length || staleWorkerAllowlist.length) {
    throw new Error(JSON.stringify({ missingFromWorker, missingFromGo, staleGoAllowlist, staleWorkerAllowlist }, null, 2));
  }
  console.log(`Product route parity passed: Go=${goRoutes.size}, Worker=${workerRoutes.size}, runtime-only=${runtimeOnly.go.size + runtimeOnly.worker.size}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
