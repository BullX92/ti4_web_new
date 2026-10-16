async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let mode = "normal";
  let getCount = 0;
  const posts = [];
  const offers = {
    gameName: "own-test",
    seat: "sol",
    phase: "strategy",
    round: 1,
    messages: [
      {
        id: "fixture-message",
        channelId: "fixture-channel",
        content: "Wähle deine Strategiekarte.",
        actions: [
          {
            id: "stable-leadership-component",
            token: "offered-test-token",
            label: "Leadership",
            style: "PRIMARY",
          },
        ],
      },
    ],
  };
  await page.route("**/api/game/own-test/interactions**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      getCount++;
      await route.fulfill({ json: offers });
      return;
    }
    posts.push({ url: request.url(), body: request.postDataJSON() });
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (mode === "stale") {
      await route.fulfill({ status: 409, json: { detail: "stale" } });
      return;
    }
    await route.fulfill({
      json:
        mode === "modal"
          ? {
              status: "FORM_OPENED",
              detail: "Formular geöffnet",
              replies: [],
              modalId: "fixture-modal",
              unsupportedCalls: [],
            }
          : {
              status: "PRESSED",
              detail: "Testantwort; kein echter Spielzug",
              replies: ["Originalhandler-Antwort als Testfixture"],
              unsupportedCalls: [],
            },
    });
  });
  await page.evaluate(() => {
    localStorage.setItem("auth_version", "v1");
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: "fixture-local-user",
        discord_id: "fixture-discord-user",
        authenticated: true,
        token: "local-browser-fixture",
      }),
    );
    window.dispatchEvent(new Event("auth-change"));
  });
  await page.getByText("Deine Aktionen", { exact: true }).click();
  const button = page.getByRole("button", { name: "Leadership", exact: true });
  await button.waitFor();
  await button.evaluate((element) => {
    element.click();
    element.click();
  });
  await page
    .getByText("Testantwort; kein echter Spielzug", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Aktualisieren", exact: true })
    .waitFor({ state: "visible" });
  if (posts.length !== 1) throw new Error("Duplicate send was not prevented");
  if (!posts[0].url.endsWith("/interactions/offered-test-token"))
    throw new Error("Unexpected token URL");
  if (
    Object.keys(posts[0].body).join(",") !== "requestId" ||
    !posts[0].body.requestId
  )
    throw new Error("Unexpected POST payload");
  mode = "stale";
  await button.click();
  await page
    .getByText(
      "Das Angebot hat sich geändert. Die aktuellen Aktionen werden geladen.",
      { exact: true },
    )
    .waitFor();
  await page.screenshot({ path: "output/playwright/actions-mobile-stale.png" });
  mode = "modal";
  await button.click();
  await page
    .getByText(
      "Ein Formular wurde geöffnet. Bitte in Discord fortsetzen; das Webformular ist noch nicht angebunden.",
      { exact: true },
    )
    .waitFor();
  await page.screenshot({ path: "output/playwright/actions-mobile-modal.png" });
  const panel = await page
    .getByRole("complementary", { name: "Spielaktionen" })
    .boundingBox();
  const viewport = page.viewportSize();
  if (!panel || panel.x < 0 || panel.x + panel.width > viewport.width)
    throw new Error("Mobile panel overflows");
  await page.evaluate(() => {
    localStorage.removeItem("user");
    window.dispatchEvent(new Event("auth-change"));
  });
  await page.getByText("Deine Aktionen", { exact: true }).click();
  await page
    .getByText("Melde dich an, um die Aktionen deines Sitzes zu sehen.", {
      exact: true,
    })
    .waitFor();
  const before = getCount;
  await page.waitForTimeout(250);
  if (before !== getCount) throw new Error("Unauthenticated offers request");
  if (
    await page.getByText("Wähle deine Strategiekarte.", { exact: true }).count()
  )
    throw new Error("Private fixture remains after logout");
  return {
    passed: [
      "offered-token-only",
      "requestId-only",
      "double-click-guard",
      "stale-refresh",
      "modal-open-path",
      "mobile-width",
      "logout-clears-private-view",
    ],
    postCount: posts.length,
    getCount,
    note: "Local intercepted HTTP fixtures; no live game proof.",
  };
}
