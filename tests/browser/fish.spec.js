import { test, expect } from "@playwright/test";

test("goldfish drop, strand on sand, hold-spawn varied fish and respect the limit", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await page.waitForFunction(() => window.sandDiagnostics?.().fish.loaded);
  await page.getByRole("button", { name: "Fish", exact: true }).click();
  await page.evaluate(() => {
    const { simulation: s, state, camera } = sandTest;
    s.height.fill(0);
    s.water.fill(0);
    state.wind = 0;
    camera.position.set(8, 12, 10);
  });
  await page.waitForTimeout(500);
  await page.mouse.click(480, 320);
  expect(await page.evaluate(() => sandDiagnostics().fish.falling)).toBe(1);
  await page.evaluate(() => {
    for (let i = 0; i < 90; i++) sandTest.fishSystem.update(1 / 30);
  });
  expect(await page.evaluate(() => sandDiagnostics().fish.stranded)).toBe(1);
  await page.evaluate(() => {
    const { simulation: s, fishSystem: f } = sandTest;
    f.reset();
    s.water.fill(4);
    s.moisture.fill(0.55);
    s.hasWater = true;
  });
  await page.locator("#fish-limit").fill("4");
  await page.mouse.move(480, 320);
  await page.mouse.down();
  await expect
    .poll(() => page.evaluate(() => sandDiagnostics().fish.count), {
      timeout: 20000,
    })
    .toBe(4);
  await page.mouse.up();
  await page.evaluate(() => {
    for (let i = 0; i < 120; i++) sandTest.fishSystem.update(1 / 30);
  });
  expect(await page.evaluate(() => sandDiagnostics().fish.swimming)).toBe(4);
  expect(
    await page.evaluate(
      () => new Set(sandTest.fishSystem.fish.map((f) => f.state.size)).size,
    ),
  ).toBe(4);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => sandDiagnostics().fish.count)).toBe(4);
  expect(await page.evaluate(() => sandDiagnostics().fish.valid)).toBe(true);
  await page.locator("#fish-limit").fill("12");
  await page.mouse.click(480, 320);
  expect(await page.evaluate(() => sandDiagnostics().fish.count)).toBe(5);
  await page.evaluate(() => {
    for (let i = 0; i < 90; i++) sandTest.fishSystem.update(1 / 30);
  });
  await page.screenshot({ path: ".artifacts/fish-browser-test.png" });
  await page.getByRole("button", { name: "Reset sand", exact: true }).click();
  expect(await page.evaluate(() => sandDiagnostics().fish.count)).toBe(0);
  expect(errors).toEqual([]);
});
