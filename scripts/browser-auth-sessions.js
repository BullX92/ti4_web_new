async (page) => {
  let pendingRoute;
  let started;
  const nextRequest = () => new Promise((resolve) => { started = resolve; });
  await page.route("**/api/public/auth/refresh", async (route) => {
    pendingRoute = route;
    started();
  });
  const begin = async () => {
    const requested = nextRequest();
    await page.evaluate(async () => {
      const auth = await import("/src/api/auth/useUser.ts");
      const refresh = await import("/src/api/auth/refreshToken.ts");
      auth.setLocalUser({ id: "fixture-a", discord_id: "fixture-a", authenticated: true, token: "old-a", refreshToken: "refresh-a" });
      window.fixtureRefresh = refresh.refreshToken();
    });
    await requested;
  };
  const reply = async (status = 200) => pendingRoute.fulfill({ status, json: {
    user_id: "fixture-a", discord_id: "fixture-a", bearer_token: "late-a", refresh_token: "new-refresh-a",
  } });
  await begin();
  await page.evaluate(async () => (await import("/src/api/auth/useUser.ts")).clearLocalUser());
  await reply();
  const afterLogout = await page.evaluate(async () => {
    const result = await window.fixtureRefresh;
    const user = (await import("/src/api/auth/useUser.ts")).getLocalUser();
    return { result, authenticated: !!user?.authenticated };
  });
  if (afterLogout.result !== null || afterLogout.authenticated) throw new Error("Late refresh restored logged-out session");
  for (const status of [200, 401]) {
    await begin();
    await page.evaluate(async () => {
      const auth = await import("/src/api/auth/useUser.ts");
      auth.clearLocalUser();
      auth.setLocalUser({ id: "fixture-b", discord_id: "fixture-b", authenticated: true, token: "login-b", refreshToken: "refresh-b" });
    });
    await reply(status);
    const current = await page.evaluate(async () => {
      await window.fixtureRefresh;
      return (await import("/src/api/auth/useUser.ts")).getLocalUser();
    });
    if (current?.id !== "fixture-b" || current.token !== "login-b") throw new Error(`Late ${status} refresh changed newer login`);
  }
  await page.evaluate(async () => {
    (await import("/src/api/auth/useUser.ts")).clearLocalUser();
    delete window.fixtureRefresh;
  });
  await page.unroute("**/api/public/auth/refresh");
  return { passed: ["delayed-success-after-logout", "delayed-success-after-new-login", "delayed-failure-after-new-login"], note: "Real browser with controlled refresh HTTP fixtures; no real Discord login." };
}
