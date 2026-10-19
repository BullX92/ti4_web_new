async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/runtime-config.js", (route) => route.fulfill({
    contentType: "text/javascript",
    body: 'window.__TI4_WRAPPER_CONFIG__ = { discordClientId: "own-browser-fixture", discordRedirectUri: location.origin + "/login" };',
  }));
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined });
    localStorage.setItem("auth_version", "v1");
  });
  await page.reload();
  await page.evaluate(() => localStorage.removeItem("user"));
  await page.reload();
  await page.getByRole("heading", { name: "Deine Twilight-Imperium-Partien" }).waitFor();
  if (await page.locator("iframe").count()) throw new Error("Community iframe on own home");
  const links = await page.locator("a").evaluateAll((elements) => elements.map((a) => a.href));
  if (links.some((href) => /discord\.gg|pbd19460|ban.?appeal/i.test(href))) {
    throw new Error("Public community link on own home");
  }
  if ((await page.getByRole("link", { name: "Partien ansehen" }).getAttribute("href")) !== "/games") {
    throw new Error("Own games route missing");
  }
  let oauthUrl;
  await page.route("https://discord.com/oauth2/authorize**", async (route) => {
    oauthUrl = new URL(route.request().url());
    await route.fulfill({ contentType: "text/plain", body: "OAuth navigation fixture" });
  });
  await page.getByRole("button", { name: "Mit Discord anmelden", exact: true }).click();
  await page.waitForURL("https://discord.com/oauth2/authorize**");
  if (oauthUrl?.searchParams.get("client_id") !== "own-browser-fixture") {
    throw new Error("OAuth uses another instance");
  }
  if (!/^[a-f0-9]{64}$/.test(oauthUrl.searchParams.get("state") ?? "")) {
    throw new Error("OAuth has no secure LAN-compatible state");
  }
  await page.goBack();
  await page.evaluate(() => {
    localStorage.setItem("user", JSON.stringify({
      id: "home-fixture", authenticated: true, name: "Testperson", token: "fixture-only",
    }));
    window.dispatchEvent(new Event("auth-change"));
  });
  await page.getByRole("link", { name: "Meine Partien", exact: true }).waitFor();
  if ((await page.getByRole("link", { name: "Meine Partien", exact: true }).getAttribute("href")) !== "/dashboard") {
    throw new Error("Own dashboard route missing");
  }
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
      throw new Error(`Horizontal overflow at ${width}px`);
    }
  }
  return "Own homepage: no community embeds, own OAuth without randomUUID, own game routes, mobile and desktop widths passed. OAuth fixture only; no real login.";
}
