import { test, expect } from "@playwright/test";

test("Blender goldfish load, reject dry placement, swim in water, and reset", async ({
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
  const dry = await page.evaluate(() => sandTest.projectSand(0, 0));
  await page.mouse.click(dry.x, dry.y);
  expect(await page.evaluate(() => sandDiagnostics().fish.count)).toBe(0);
  await expect(page.locator("#hint")).toContainText("deeper");
  await page.evaluate(() => {
    const { simulation: s, state, camera } = sandTest;
    s.height.fill(0);
    s.water.fill(4);
    s.moisture.fill(0.55);
    s.hasWater = true;
    state.wind = 0;
    camera.position.set(8, 12, 10);
  });
  await page.waitForTimeout(700);
  // The central camera ray meets this deliberately prepared, deep water surface.
  await page.mouse.click(480, 320);
  await expect
    .poll(() => page.evaluate(() => sandDiagnostics().fish.count))
    .toBe(1);
  const before = await page.evaluate(() => ({
    ...sandTest.fishSystem.fish[0].state,
  }));
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => ({
    ...sandTest.fishSystem.fish[0].state,
  }));
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(
    0.01,
  );
  expect(await page.evaluate(() => sandDiagnostics().fish.valid)).toBe(true);
  expect(
    await page.evaluate(() => sandTest.fishSystem.fish[0].fins.length),
  ).toBeGreaterThan(0);
  await page.screenshot({ path: ".artifacts/fish-browser-test.png" });
  await page.getByRole("button", { name: "Reset sand", exact: true }).click();
  expect(await page.evaluate(() => sandDiagnostics().fish.count)).toBe(0);
  expect(errors).toEqual([]);
});
