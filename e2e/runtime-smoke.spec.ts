import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function envValue(name: string, fallback: string) {
  if (process.env[name]) return process.env[name]!;
  try {
    const entry = readFileSync(resolve(process.cwd(), ".env"), "utf8")
      .split(/\r?\n/)
      .find((line) => line.startsWith(`${name}=`));
    return entry?.slice(name.length + 1).replace(/^['"]|['"]$/g, "") || fallback;
  } catch {
    return fallback;
  }
}

function watchRuntime(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return () => expect(errors, errors.join("\n")).toEqual([]);
}

async function login(page: Page, username: string, password: string, landing: string) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  const authResponse = page.waitForResponse((response) => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in" }).click();
  const auth = await authResponse;
  expect(auth.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`${landing.replaceAll("/", "\\/")}$`), { timeout: 20_000 });
  await page.locator(".app-main").waitFor({ state: "visible" });
}

test("HOD pages render without server, browser, or hydration errors", async ({ page }) => {
  const assertClean = watchRuntime(page);
  await login(page, process.env.HOD_USERNAME ?? "hod", envValue("HOD_PASSWORD", "Hod@12345"), "/dashboard");

  for (const [path, heading] of [
    ["/dashboard", /Good day,/],
    ["/sections", "Sections"],
    ["/students", "Students"],
    ["/teachers", "Teachers"],
    ["/messages", "Messages"],
    ["/settings", "Your phone & messaging"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }

  await page.goto("/sections");
  await page.getByRole("link", { name: "Open section" }).first().click();
  await expect(page.getByRole("heading", { name: /^Section / })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const detailMessagesTab = page.getByRole("tab", { name: "Messages" });
  await detailMessagesTab.click();
  if (await detailMessagesTab.getAttribute("aria-selected") !== "true") assertClean();
  await expect(page.getByRole("heading", { name: /Detained students/ })).toBeVisible();

  await page.goto("/students");
  const sectionTabs = page.getByRole("tab", { name: /^[A-Z].*\d+$/ });
  const tabCount = await sectionTabs.count();
  expect(tabCount, "Student directory should expose each section tab").toBeGreaterThan(0);
  for (let index = 0; index < tabCount; index += 1) {
    const tab = sectionTabs.nth(index);
    const sectionName = (await tab.innerText()).trim().replace(/\s+\d+$/, "");
    await tab.click();
    await expect(page.locator(".section-summary .eyebrow")).toHaveText(`SECTION ${sectionName}`);
  }

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  assertClean();
});

test("teacher pages render without server, browser, or hydration errors", async ({ page }) => {
  const assertClean = watchRuntime(page);
  await login(page, process.env.TEACHER_USERNAME ?? "teacherA", envValue("TEACHER_PASSWORD", "Teacher@A123"), "/my-class");

  for (const path of ["/my-class", "/messages", "/settings", "/dashboard", "/students"]) {
    await page.goto(path);
    await expect(page.locator(".app-main")).toBeVisible();
    if (["/dashboard", "/students"].includes(path)) await expect(page).toHaveURL(/\/my-class$/);
    else await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}$`));
  }

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  assertClean();
});
