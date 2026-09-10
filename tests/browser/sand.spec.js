import { test, expect } from "@playwright/test";

test("pouring water wets the sand, creates visible liquid, and resets cleanly", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await page.waitForFunction(() => window.sandDiagnostics?.().ready);
  await page.locator("summary").click();
  await page.locator("#quality").selectOption("low");
  await page.locator("#wind").fill("0");
  await page.locator("summary").click();
  await page.getByRole("button", { name: "Water", exact: true }).click();
  const before = await page.evaluate(() => ({
    volume: sandDiagnostics().volume,
    point: sandTest.projectSand(0, 0),
  }));
  await page.mouse.move(before.point.x, before.point.y);
  await page.mouse.down();
  // Wait for simulated absorption rather than a fixed software-renderer duration.
  await expect
    .poll(() => page.evaluate(() => sandDiagnostics().maxWetness), { timeout: 20000 })
    .toBeGreaterThan(0.75);
  await page.mouse.up();
  const wet = await page.evaluate(() => sandDiagnostics());
  expect(wet.waterVolume).toBeGreaterThan(1);
  expect(Math.abs(wet.volume - before.volume)).toBeLessThan(0.1);
  expect(wet.shaderErrors).toBe(0);
  await page.mouse.wheel(0, -650);
  await page.waitForTimeout(700);
  await page.screenshot({ path: ".artifacts/wet-sand.png" });
  await page.getByRole("button", { name: "Reset sand", exact: true }).click();
  expect(await page.evaluate(() => sandDiagnostics().waterVolume)).toBe(0);
  expect(await page.evaluate(() => sandDiagnostics().maxWetness)).toBe(0);
  expect(errors).toEqual([]);
});

test("real WebGL renders and pointer tools deform the sand field", async ({
  page,
}) => {
  const { width, height } = page.viewportSize();
  const sx = (x) => (x / 1365) * width;
  const sy = (y) => (y / 900) * height;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await page.waitForFunction(() => window.sandDiagnostics?.().ready);
  expect(await page.evaluate(() => sandDiagnostics().glassWalls)).toBe(4);
  await expect(page.locator("#loading")).toBeHidden();
  expect(await page.evaluate(() => sandDiagnostics().shaderErrors)).toBe(0);
  await page.locator("summary").click();
  await page.locator("#quality").selectOption("low");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator("summary").click();
  await page.mouse.move(sx(670), sy(560));
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
  await page.mouse.move(sx(780), sy(605), { steps: 20 });
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
  await page.mouse.move(sx(580), sy(530));
  await page.mouse.down();
  await page.waitForTimeout(2400);
  await page.mouse.up();
  expect(await page.evaluate(() => sandDiagnostics().volume)).toBeGreaterThan(
    before.volume + 5,
  );
  await page.screenshot({ path: ".artifacts/sand-sculpted.png" });
  await page.getByRole("button", { name: "Smooth", exact: true }).click();
  await page.mouse.move(sx(580), sy(530));
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.getByRole("button", { name: "Orbit", exact: true }).click();
  const cameraBefore = await page.evaluate(() =>
    sandTest.camera.position.toArray(),
  );
  await page.mouse.move(sx(750), sy(500));
  await page.mouse.down();
  await page.mouse.move(sx(850), sy(530), { steps: 10 });
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
  await page.waitForFunction(() => window.sandDiagnostics?.().ready);
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

test("the brush reaches the glass wall and moves the boundary sand", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.sandDiagnostics?.().ready);
  await page.locator("summary").click();
  await page.locator("#quality").selectOption("low");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.locator("summary").click();
  const before = await page.evaluate(() => ({
    point: sandTest.projectSand(0, 78.8),
    height: sandTest.simulation.sample(0, 80),
    volume: sandDiagnostics().volume,
  }));
  await page.mouse.move(before.point.x, before.point.y);
  await expect
    .poll(() => page.evaluate(() => sandDiagnostics().brush[2]))
    .toBeGreaterThan(0);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  const after = await page.evaluate(() => ({
    height: sandTest.simulation.sample(0, 80),
    volume: sandDiagnostics().volume,
  }));
  expect(after.height).toBeLessThan(before.height - 0.5);
  expect(Math.abs(after.volume - before.volume)).toBeLessThan(0.05);
  expect(await page.evaluate(() => sandDiagnostics().shaderErrors)).toBe(0);
  await page.screenshot({ path: ".artifacts/glass-edge-dig.png" });
});
