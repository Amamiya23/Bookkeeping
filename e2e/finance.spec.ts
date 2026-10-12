import { test, expect, installE2EPageGuards } from "./support/test";
import { createAdminManagedUser, productApiFetch } from "./support/product-api";
import { loginThroughProductUI } from "./support/auth";
import { adminUserResponseSchema } from "@renewlet/shared/schemas/admin";
import { financeAccountsResponseSchema, financeSummaryResponseSchema, financeSnapshotSchema } from "@renewlet/shared/schemas/finance";
import { readFile } from "node:fs/promises";

test("record unified income and spending, review consumption, correct, void and restore", async ({ page: adminPage, browser, baseURL }, testInfo) => {
  await adminPage.goto("/");
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const password = "finance-test-password";
  const userIds: string[] = [];
  const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  const guards: Awaited<ReturnType<typeof installE2EPageGuards>>[] = [];
  const createUser = async (name: string) => {
    const email = `${name}-${suffix}@example.com`;
    const result = adminUserResponseSchema.parse(await createAdminManagedUser(adminPage, { name, email, password }));
    userIds.push(result.data.user.id);
    const context = await browser.newContext({ ...testInfo.project.use, baseURL });
    contexts.push(context); const page = await context.newPage();
    // Keep the new user's context independent of the administrator cookie.
    await context.clearCookies();
    await loginThroughProductUI(page, email, password);
    guards.push(await installE2EPageGuards(page));
    return page;
  };
  try {
    const page = await createUser("finance-source");
    await page.goto("/accounts");
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(page.getByRole("button", { name: "添加账户", exact: true })).toHaveCount(0);

    await page.goto("/transactions");
    await page.getByRole("button", { name: "记一笔", exact: true }).first().click();
    let dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("资金账户", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "收入", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "工资", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("button", { name: "股票基金", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "退款", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "转账收入", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "三餐", exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "支出", exact: true }).click();
    await dialog.getByLabel("搜索分类", { exact: true }).fill("宠物");
    await expect(dialog.getByRole("button", { name: "宠物", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "三餐", exact: true })).toHaveCount(0);
    await dialog.getByLabel("搜索分类", { exact: true }).fill("");
    await dialog.getByRole("button", { name: "添加分类", exact: true }).click();
    const categoryEditor = dialog.getByRole("region", { name: "添加分类", exact: true });
    await categoryEditor.getByLabel("分类名称", { exact: true }).fill("烘焙");
    await categoryEditor.getByRole("button", { name: "饼干", exact: true }).click();
    await categoryEditor.getByRole("button", { name: "保存", exact: true }).click();
    await expect(categoryEditor).not.toBeVisible();
    await expect(dialog.getByRole("button", { name: "烘焙", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("heading", { name: "记一笔", exact: true })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "保存", exact: true })).toBeInViewport();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("category-picker.png"), fullPage: true });
    await dialog.getByLabel("金额", { exact: true }).fill("32");
    await dialog.getByText("更多信息", { exact: true }).click();
    await dialog.getByLabel("商家", { exact: true }).fill("午餐");
    await dialog.getByLabel("标签（逗号分隔）", { exact: true }).fill("午餐, 工作日");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const expense = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "午餐", exact: true }) }).first();
    await expect(expense).toContainText("32.00 CNY");
    await expect(expense).toContainText("午餐 · 工作日");
    await expect(expense.getByRole("button", { name: "退款", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "记一笔", exact: true }).first().click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "收入", exact: true }).click();
    await dialog.getByRole("button", { name: "退款", exact: true }).click();
    await dialog.getByLabel("金额", { exact: true }).fill("20");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(2);

    const summaryResult = await productApiFetch(page, "/api/app/finance/reports/summary");
    const summary = financeSummaryResponseSchema.parse(summaryResult.json).data.byCurrency["CNY"];
    expect(summary?.netExpense).toBe("32"); expect(summary?.income).toBe("20");
    const accountsResult = await productApiFetch(page, "/api/app/finance/accounts");
    expect(financeAccountsResponseSchema.parse(accountsResult.json).data.items).toHaveLength(0);

    const expenseRow = page.getByRole("article").filter({ hasText: "32.00 CNY" });
    await expenseRow.getByRole("button", { name: "编辑", exact: true }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("金额", { exact: true }).fill("40");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("article").filter({ hasText: "40.00 CNY" })).toBeVisible();

    await page.getByRole("button", { name: "记一笔", exact: true }).first().click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "订阅服务", exact: true }).click();
    await dialog.getByLabel("金额", { exact: true }).fill("12");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "消费总览", exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "每日收支", exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "钱花在哪里", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("consumption-overview.png"), fullPage: true });
    await page.getByRole("heading", { name: "付款安排", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("link", { name: "周期计划", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("consumption-subscriptions.png"), fullPage: true });
    await page.getByRole("button", { name: "切换主题", exact: true }).click();
    await page.getByRole("heading", { name: "消费总览", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("consumption-overview-light.png"), fullPage: true });
    await page.goto("/transactions");

    for (const amount of ["12.00 CNY", "20.00 CNY", "40.00 CNY"]) {
      await page.getByRole("article").filter({ hasText: amount }).getByRole("button", { name: "作废", exact: true }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("作废原因", { exact: true }).fill("录入更正");
      await dialog.getByRole("button", { name: "作废", exact: true }).click();
      await expect(dialog).not.toBeVisible();
    }
    const downloadPromise = page.waitForEvent("download");
    await page.locator("summary").filter({ hasText: "账本名称" }).click();
    await page.getByRole("button", { name: "导出账本", exact: true }).click();
    const download = await downloadPromise; const snapshotPath = testInfo.outputPath("ledger.json");
    await download.saveAs(snapshotPath);
    const snapshot = financeSnapshotSchema.parse(JSON.parse(await readFile(snapshotPath, "utf8")));
    expect(snapshot.transactions).toHaveLength(3); expect(snapshot.accounts).toHaveLength(0);
    expect(snapshot.ledger.categories).toEqual([{ name: "烘焙", kind: "expense", icon: "cookie" }]);
    expect(snapshot.transactions[0]?.category).toBe("烘焙");

    const targetPage = await createUser("finance-target");
    await targetPage.goto("/transactions");
    await targetPage.locator("summary").filter({ hasText: "账本名称" }).click();
    await targetPage.getByLabel("恢复账本", { exact: true }).setInputFiles(snapshotPath);
    const restoreDialog = targetPage.getByRole("dialog");
    await restoreDialog.getByRole("button", { name: "恢复账本", exact: true }).click();
    await expect(restoreDialog).not.toBeVisible();
    await expect(targetPage.getByRole("article")).toHaveCount(3);
    await targetPage.goto("/transactions");
    await targetPage.getByRole("button", { name: "记一笔", exact: true }).first().click();
    await expect(targetPage.getByRole("dialog").getByRole("button", { name: "烘焙", exact: true })).toBeVisible();
    await expect(targetPage.getByRole("dialog").getByRole("button", { name: "烘焙", exact: true }).locator('[data-finance-icon="cookie"]')).toHaveCount(1);
    await targetPage.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).last().click();
    await targetPage.goto("/transactions");
    await expect.poll(() => targetPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await targetPage.screenshot({ path: testInfo.outputPath("restored-transactions.png"), fullPage: true });
  } finally {
    for (const guard of guards) await guard.close();
    for (const context of contexts) await context.close();
    for (const id of userIds) {
      const result = await productApiFetch(adminPage, `/api/app/admin/users/${id}`, { method: "DELETE" });
      expect(result.ok, result.body).toBe(true);
    }
  }
});
