import { describe, expect, it, vi } from "vitest";
import { financeCapabilitiesResponseSchema } from "@renewlet/shared/schemas/finance";
import worker from "./index";
import { previewImport, applyImport } from "./import-export";
import { HttpError } from "./http";
import type { Env } from "./types";

const auth = vi.hoisted(() => ({ requireAuth: vi.fn().mockResolvedValue({ user: { id: "finance-user" } }) }));
vi.mock("./auth", async (importOriginal) => ({ ...await importOriginal<typeof import("./auth")>(), requireAuth: auth.requireAuth }));
vi.mock("./notifications", () => ({ notificationHistory: vi.fn(), notificationOverview: vi.fn(), notificationRun: vi.fn(), notificationTest: vi.fn() }));

describe("Docker-first finance capabilities", () => {
  it("advertises unsupported capabilities only after authentication", async () => {
    const env = { DB: {} as D1Database, ASSETS: {} as Fetcher, ASSETS_BUCKET: {} as R2Bucket } satisfies Env;
    if (!worker.fetch) throw new Error("missing fetch handler");
    const response = await worker.fetch(new Request("https://renewlet.test/api/app/finance/capabilities") as Parameters<NonNullable<typeof worker.fetch>>[0], env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(financeCapabilitiesResponseSchema.parse(await response.json()).data).toEqual({ ledger: false, subscriptionPayments: false, automation: false, protocolVersion: 1 });
    expect(auth.requireAuth).toHaveBeenCalled();
    auth.requireAuth.mockRejectedValueOnce(new HttpError(401, "UNAUTHORIZED", "UNAUTHORIZED"));
    const denied = await worker.fetch(new Request("https://renewlet.test/api/app/finance/capabilities") as Parameters<NonNullable<typeof worker.fetch>>[0], env, {} as ExecutionContext);
    expect(denied.status).toBe(401);
  });
  it("refuses finance imports before touching D1 instead of losing data", async () => {
    const prepare = vi.fn();
    const env = { DB: { prepare } as unknown as D1Database, ASSETS: {} as Fetcher, ASSETS_BUCKET: {} as R2Bucket } satisfies Env;
    const payload = { source: "renewlet", subscriptions: [], finance: {
      schemaVersion: 1, ledger: { id: "ledger000000000", name: "Personal", baseCurrency: "CNY", timeZone: "UTC", version: 1 },
      accounts: [], transactions: [], budgets: [], audit: [],
    } };
    for (const operation of [previewImport, applyImport]) {
      const request = new Request("https://renewlet.test/api/app/import/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload, conflictMode: "skip", skipIndexes: [] }) });
      await expect(operation(request, env)).rejects.toMatchObject({ status: 409, code: "FINANCE_NOT_SUPPORTED" });
    }
    expect(prepare).not.toHaveBeenCalled();
  });
});
