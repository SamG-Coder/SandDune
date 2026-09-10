import { test, expect } from "@playwright/test";

test("real WebGL renders and pointer tools deform the sand field", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await page.waitForFunction(() => window.sandDiagnostics?.().drawCalls === 3);
  await expect(page.locator("#loading")).toBeHidden();
  expect(await page.evaluate(() => sandDiagnostics().shaderErrors)).toBe(0);
  await page.locator("summary").click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator("summary").click();
  await page.mouse.move(670, 560);
  await expect
    .poll(() => page.evaluate(() => sandDiagnostics().brush[2]))
    .toBeGreaterThan(0);
  const before = await page.evaluate(() => {
    const [x, z] = sandDiagnostics().brush;
    return {
      x,
      z,
      height: sandTest.simulation.sample(x, z),
      volume: sandDiagnostics().volume,
    };
  });
  await page.screenshot({ path: ".artifacts/sand-before.png" });
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.move(780, 605, { steps: 30 });
  await page.mouse.up();
  const after = await page.evaluate(
    ({ x, z }) => ({
      height: sandTest.simulation.sample(x, z),
      volume: sandDiagnostics().volume,
    }),
    before,
  );
  expect(after.height).toBeLessThan(before.height - 1);
  expect(Math.abs(after.volume - before.volume)).toBeLessThan(0.05);
  await page.getByRole("button", { name: "Pour", exact: true }).click();
  await page.mouse.move(580, 530);
  await page.mouse.down();
  await page.waitForTimeout(2400);
  await page.mouse.up();
  expect(await page.evaluate(() => sandDiagnostics().volume)).toBeGreaterThan(
    before.volume + 5,
  );
  await page.screenshot({ path: ".artifacts/sand-sculpted.png" });
  await page.getByRole("button", { name: "Smooth", exact: true }).click();
  await page.mouse.move(580, 530);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.getByRole("button", { name: "Orbit", exact: true }).click();
  const cameraBefore = await page.evaluate(() =>
    sandTest.camera.position.toArray(),
  );
  await page.mouse.move(750, 500);
  await page.mouse.down();
  await page.mouse.move(850, 530, { steps: 10 });
  await page.mouse.up();
  expect(
    await page.evaluate(() => sandTest.camera.position.toArray()),
  ).not.toEqual(cameraBefore);
  await page.getByRole("button", { name: "Reset sand", exact: true }).click();
  expect(
    await page.evaluate(() =>
      sandTest.simulation.height.every(
        (h, i) => h === sandTest.simulation.base[i],
      ),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("mobile controls, shader quality changes, and reduced motion work", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForFunction(() => window.sandDiagnostics?.().drawCalls === 3);
  expect(await page.evaluate(() => sandDiagnostics().paused)).toBe(true);
  await expect(
    page.getByRole("button", { name: "Dig", exact: true }),
  ).toBeVisible();
  await page.locator("summary").click();
  await page.locator("#quality").selectOption("high");
  await expect
    .poll(() => page.evaluate(() => sandDiagnostics().quality))
    .toBe("high");
  await page.locator("#quality").selectOption("low");
  await page.locator("#wind").fill("35");
  expect(await page.evaluate(() => sandDiagnostics().wind)).toBe(35);
  await page.locator("summary").click();
  await page.screenshot({ path: ".artifacts/sand-mobile.png" });
  expect(await page.evaluate(() => sandDiagnostics().shaderErrors)).toBe(0);
  await context.close();
});
