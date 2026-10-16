async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.unroute("**/api/game/own-test/interactions**");
  let stale = true;
  let pollCount = 0;
  const posts = [];
  const modal = {
    token: "fixture-modal-1",
    title: "Originalformular",
    fields: [
      {
        id: "note",
        label: "Notiz",
        style: "PARAGRAPH",
        required: true,
        minLength: 2,
        maxLength: 5,
        placeholder: "2 bis 5 Zeichen",
      },
    ],
  };
  const offers = {
    gameName: "own-test",
    seat: "sol",
    phase: "strategy",
    round: 1,
    messages: [
      {
        id: "fixture-message",
        channelId: "fixture-channel",
        content: "Lokale Testantworten für Komponenten.",
        actions: [
          {
            id: "stable-select-component",
            token: "fixture-select-0",
            label: "Planeten",
            type: "STRING_SELECT",
            minValues: 1,
            maxValues: 2,
            options: [
              { label: "Planet A", value: "a" },
              { label: "Planet B", value: "b" },
              { label: "Planet C", value: "c" },
            ],
          },
          {
            id: "stable-form-component",
            token: "fixture-open-form",
            label: "Formular öffnen",
            type: "BUTTON",
            options: [],
          },
        ],
      },
    ],
  };
  await page.route("**/api/game/own-test/interactions**", async (route) => {
    if (route.request().method() === "GET") {
      offers.messages[0].actions[0].token = `fixture-select-${++pollCount}`;
      await route.fulfill({ json: offers });
      return;
    }
    const request = route.request();
    posts.push({ url: request.url(), body: request.postDataJSON() });
    const common = { status: "PRESSED", replies: [], unsupportedCalls: [] };
    if (request.url().includes("/fixture-select-")) {
      await route.fulfill({
        json: { ...common, detail: "Auswahl als Testfixture empfangen." },
      });
    } else if (request.url().endsWith("/fixture-open-form")) {
      await route.fulfill({
        json: {
          ...common,
          status: "FORM_OPENED",
          modalId: "original-modal",
          modal,
        },
      });
    } else if (request.url().endsWith("/modals/fixture-modal-1")) {
      if (stale) {
        await route.fulfill({ status: 409, json: { detail: "stale" } });
        return;
      }
      await route.fulfill({
        json: {
          ...common,
          status: "FORM_OPENED",
          modal: {
            ...modal,
            token: "fixture-modal-2",
            title: "Folgeformular",
            fields: [
              {
                id: "followup",
                label: "Folgenotiz",
                required: false,
                style: "SHORT",
                value: "Wert",
              },
            ],
          },
        },
      });
    } else throw new Error("Unexpected fixture endpoint");
  });
  await page.evaluate(() => {
    localStorage.setItem("auth_version", "v1");
    localStorage.setItem(
      "user",
      JSON.stringify({
        id: "fixture-user",
        discord_id: "fixture-user",
        authenticated: true,
        token: "local-browser-fixture",
      }),
    );
    window.dispatchEvent(new Event("auth-change"));
  });
  await page.getByText("Deine Aktionen", { exact: true }).click();
  const confirm = page.getByRole("button", {
    name: "Auswahl bestätigen",
    exact: true,
  });
  await confirm.waitFor();
  if (!(await confirm.isDisabled()))
    throw new Error("Empty required select enabled");
  await page
    .getByLabel("Planeten", { exact: true })
    .selectOption(["a", "b", "c"]);
  if (!(await confirm.isDisabled()))
    throw new Error("Too many select values enabled");
  await page.getByLabel("Planeten", { exact: true }).selectOption(["a", "b"]);
  const beforePolling = pollCount;
  await page.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/interactions"), { timeout: 15000 });
  if (pollCount <= beforePolling) throw new Error("No actual polling refresh observed");
  if (JSON.stringify(await page.getByLabel("Planeten", { exact: true }).evaluate((select) => Array.from(select.selectedOptions, (option) => option.value))) !== '["a","b"]')
    throw new Error("Polling token rotation discarded selected draft");
  offers.messages[0].actions[0].maxValues = 1;
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/interactions")),
    page.getByRole("button", { name: "Aktualisieren", exact: true }).click(),
  ]);
  if (!(await confirm.isDisabled())) throw new Error("Updated maximum did not invalidate draft");
  offers.messages[0].actions[0].maxValues = 2;
  offers.messages[0].actions[0].options = [{ label: "Planet A", value: "a" }, { label: "Planet C", value: "c" }];
  const refresh = () => Promise.all([
    page.waitForResponse((response) => response.request().method() === "GET" && response.url().includes("/interactions")),
    page.getByRole("button", { name: "Aktualisieren", exact: true }).click(),
  ]);
  await refresh();
  if (!(await confirm.isDisabled())) throw new Error("Removed option did not invalidate draft");
  await page.getByLabel("Planeten", { exact: true }).selectOption(["a", "c"]);
  offers.messages[0].actions[0].id = "different-select-same-label";
  await refresh();
  if (!(await confirm.isDisabled())) throw new Error("New same-label component inherited previous draft");
  await page.getByLabel("Planeten", { exact: true }).selectOption(["a", "c"]);
  offers.messages[0].actions[0].maxValues = 3;
  await refresh();
  if (await confirm.isDisabled()) throw new Error("Still-valid selection lost after constraint change");
  await confirm.click();
  await page
    .getByText("Auswahl als Testfixture empfangen.", { exact: true })
    .waitFor();
  if (JSON.stringify(posts[0].body.values) !== '["a","c"]')
    throw new Error("Incorrect select payload");
  if (Object.keys(posts[0].body).sort().join(",") !== "requestId,values")
    throw new Error("Unexpected select payload");
  await page
    .getByRole("button", { name: "Formular öffnen", exact: true })
    .click();
  const note = page.getByRole("textbox", { name: "Notiz", exact: false });
  await note.waitFor();
  const submit = page.getByRole("button", {
    name: "Formular absenden",
    exact: true,
  });
  if (!(await submit.isDisabled()))
    throw new Error("Required modal input not enforced");
  await note.fill("x");
  if (!(await submit.isDisabled()))
    throw new Error("Modal minLength not enforced");
  await note.fill("Hallo");
  await submit.evaluate((element) => {
    element.click();
    element.click();
  });
  await page
    .getByText("Dieses Formular ist veraltet.", { exact: false })
    .waitFor();
  if ((await note.inputValue()) !== "Hallo")
    throw new Error("Stale modal lost draft");
  if (!(await submit.isDisabled()))
    throw new Error("Stale modal still enabled");
  await page.screenshot({
    path: "output/playwright/components-mobile-stale-modal.png",
  });
  if (posts.length !== 3)
    throw new Error("Modal double-submit was not prevented");
  await page
    .getByRole("button", { name: "Schließen ohne Absenden", exact: true })
    .click();
  stale = false;
  await page
    .getByRole("button", { name: "Formular öffnen", exact: true })
    .click();
  await note.fill("Hallo");
  await submit.click();
  await page
    .getByRole("form", { name: "Folgeformular", exact: true })
    .waitFor();
  if (
    (await page.getByLabel("Folgenotiz", { exact: true }).inputValue()) !==
    "Wert"
  )
    throw new Error("Follow-up default value lost");
  const modalPost = posts.at(-1);
  if (Object.keys(modalPost.body).sort().join(",") !== "fields,requestId")
    throw new Error("Unexpected modal payload");
  if (JSON.stringify(modalPost.body.fields) !== '{"note":"Hallo"}')
    throw new Error("Incorrect modal fields");
  await page.screenshot({
    path: "output/playwright/components-mobile-followup.png",
  });
  const before = posts.length;
  await page
    .getByRole("button", { name: "Schließen ohne Absenden", exact: true })
    .click();
  await page
    .getByText(
      "Formular geschlossen. Es wurden keine Formulareingaben abgesendet.",
      { exact: true },
    )
    .waitFor();
  if (posts.length !== before) throw new Error("Cancel submitted a form");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "output/playwright/components-desktop.png" });
  await page.evaluate(() => {
    localStorage.removeItem("user");
    window.dispatchEvent(new Event("auth-change"));
  });
  return {
    passed: [
      "select-min-max",
      "select-payload",
      "poll-token-rotation-keeps-draft",
      "changed-options-and-limits-revalidate-draft",
      "new-component-same-label-resets-draft",
      "modal-required-minlength",
      "modal-duplicate-guard",
      "stale-keeps-draft",
      "follow-up-modal",
      "prefilled-short-field",
      "cancel-does-not-submit",
    ],
    posts: posts.length,
    note: "Intercepted local API fixtures; no real game proof.",
  };
}
