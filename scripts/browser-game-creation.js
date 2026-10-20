async (page) => {
  let mode = "drop";
  let operation = null;
  const submissions = [];
  let releaseLate;
  let notifyLate;
  let holdOptions = false;
  let releaseOptions;
  let optionsWait;
  const lateStarted = new Promise((resolve) => { notifyLate = resolve; });
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.unrouteAll({ behavior: "wait" });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const actualPath = new URL(request.url()).pathname;
    if (!actualPath.startsWith("/api/") && !actualPath.startsWith("/bot/api/")) return route.continue();
    const path = actualPath.replace(/^\/bot/, "");
    if (path === "/api/wrapper/game-creation") {
      if (request.headers().authorization !== "Bearer fixture-admin") return json(route, {}, 403);
      if (holdOptions) await optionsWait;
      return json(route, { canCreate: true, members: [{ id: "123", name: "Testadmin" }, { id: "456", name: "Freund" }] });
    }
    if (path === "/api/wrapper/games") {
      const body = request.postDataJSON();
      submissions.push(body);
      if (mode === "reject") return json(route, {}, 400);
      operation = { requestId: body.requestId, gameName: "pbd99999", state: "CREATING", message: null };
      if (mode === "drop") return route.abort("failed");
      if (mode === "late") {
        const wait = new Promise((resolve) => { releaseLate = resolve; });
        notifyLate();
        await wait;
      }
      operation = { ...operation, state: "COMPLETED" };
      return json(route, operation);
    }
    if (path.startsWith("/api/wrapper/game-creation/")) return operation ? json(route, operation) : json(route, {}, 404);
    if (path === "/api/game/pbd99999/interactions") return json(route, {
      gameName: "pbd99999", seat: "Testadmin", phase: "setup", round: 1,
      messages: [{ id: "message", channelId: "channel", content: "Original setup fixture", actions: [{ id: "action", token: "offer", type: "BUTTON", style: "SUCCESS", label: "Start Milty Setup", options: [], minValues: 0, maxValues: 0 }] }],
    });
    return json(route, {});
  });
  await page.addInitScript(() => {
    if (localStorage.getItem("creation-fixture-ready")) return;
    localStorage.setItem("auth_version", "v1");
    localStorage.setItem("auth_session", "owner-session");
    localStorage.setItem("user", JSON.stringify({ id: "local-owner", discord_id: "123", name: "Testadmin", authenticated: true, token: "fixture-admin" }));
    localStorage.setItem("creation-fixture-ready", "yes");
  });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByLabel("Partiename", { exact: true }).fill("@everyone");
  await page.getByRole("button", { name: "Partie anlegen", exact: true }).click();
  await page.getByText(/ohne Erwähnungen/).waitFor();
  if (submissions.length) throw new Error("Invalid title reached creation API");
  await page.getByLabel("Partiename", { exact: true }).fill("Testpartie");
  await page.getByLabel("Freund", { exact: true }).check();
  await page.getByRole("button", { name: "Partie anlegen", exact: true }).click();
  await page.getByText(/Die Antwort fehlt/).waitFor();
  if (submissions.length !== 1) throw new Error("Unexpected duplicate submission");
  const requestId = submissions[0].requestId;
  await page.reload();
  await page.getByText("Die Einrichtung läuft. Du kannst diese Seite erneut öffnen.", { exact: true }).waitFor();
  if (await page.getByLabel("Partiename", { exact: true }).count()) throw new Error("Reload opened a second creation form");
  if (submissions.length !== 1) throw new Error("Reload submitted another game");
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("own-ti4-creation:123")));
  if (stored.requestId !== requestId) throw new Error("Request identity lost on reload");
  operation = { ...operation, state: "COMPLETED" };
  await page.getByRole("button", { name: "Auftrag prüfen", exact: true }).click();
  await page.getByRole("button", { name: "Start Milty Setup", exact: true }).waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Mobile creation page overflows");
  await page.screenshot({ path: "output/playwright/creation-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Weitere Partie anlegen", exact: true }).click();

  mode = "reject";
  operation = null;
  await page.getByLabel("Partiename", { exact: true }).fill("Abgelehnte Angaben");
  await page.getByRole("button", { name: "Partie anlegen", exact: true }).click();
  await page.getByRole("button", { name: "Angaben korrigieren", exact: true }).waitFor();
  holdOptions = true;
  optionsWait = new Promise((resolve) => { releaseOptions = resolve; });
  await page.reload();
  await page.getByRole("button", { name: "Denselben Auftrag erneut senden", exact: true }).click();
  await page.getByRole("button", { name: "Angaben korrigieren", exact: true }).click();
  holdOptions = false;
  releaseOptions();
  if (!await page.getByLabel("Testadmin (du)", { exact: true }).isChecked()) throw new Error("Correction while member options load removed the mandatory owner");
  await page.getByLabel("Partiename", { exact: true }).fill("Korrigierte Angaben");
  mode = "complete";
  await page.getByRole("button", { name: "Partie anlegen", exact: true }).click();
  await page.getByRole("button", { name: "Weitere Partie anlegen", exact: true }).waitFor();
  if (submissions.length !== 4 || submissions.slice(1).some((request) => request.requestId !== submissions[1].requestId)) throw new Error("Correction created a fresh request identity");
  await page.getByRole("button", { name: "Weitere Partie anlegen", exact: true }).click();

  mode = "late";
  operation = null;
  await page.getByLabel("Partiename", { exact: true }).fill("Späte Antwort");
  await page.getByRole("button", { name: "Partie anlegen", exact: true }).click();
  await Promise.race([lateStarted, new Promise((_, reject) => setTimeout(() => reject(new Error("Late request never started")), 5000))]);
  await page.evaluate(() => {
    localStorage.setItem("auth_session", "member-session");
    localStorage.setItem("user", JSON.stringify({ id: "local-member", discord_id: "456", name: "Freund", authenticated: true, token: "fixture-member" }));
    window.dispatchEvent(new Event("auth-change"));
  });
  await page.getByText("Nur ein Administrator dieses Spielservers darf Partien anlegen.", { exact: true }).waitFor();
  const lateResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/api/wrapper/games"));
  releaseLate();
  await lateResponse;
  if (await page.getByText("Die Partie pbd99999 ist angelegt.", { exact: true }).count()) throw new Error("Former user's operation appeared after account switch");
  if (await page.getByLabel("Partiename", { exact: true }).count()) throw new Error("Non-admin received creation form");
  await page.setViewportSize({ width: 1280, height: 900 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Desktop creation page overflows");
  return "Creation UI fixture passed: validation, dropped response, same request after reload, Original-offer panel, rejected-data correction retaining ID, and late response isolated after account switch. Mock API only; no real game was created.";
}
