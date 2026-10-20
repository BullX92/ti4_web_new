import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("game creation keeps the same submitted request across reloads and isolates users", () => {
  const api = evaluate("../src/domains/game-creation/creationRequest.ts", {});
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const request = {
    requestId: "a".repeat(64),
    title: "Dienstagsrunde",
    memberIds: ["123"],
  };
  api.saveCreationRequest(storage, "123", request);
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.loadCreationRequest(storage, "123"))),
    request,
  );
  assert.equal(api.loadCreationRequest(storage, "456"), null);
  assert.throws(() =>
    api.saveCreationRequest(storage, "123", {
      ...request,
      requestId: "b".repeat(64),
    }),
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.loadCreationRequest(storage, "123"))),
    request,
  );
  api.clearCreationRequest(storage, "123");
  assert.equal(api.loadCreationRequest(storage, "123"), null);
});

test("game creation validates real selected members and owner before submission", () => {
  const { creationProblem } = evaluate(
    "../src/domains/game-creation/creationRequest.ts",
    {},
  );
  const members = [
    { id: "123", name: "Owner" },
    { id: "456", name: "Friend" },
  ];
  assert.equal(creationProblem("Runde", ["123", "456"], members, "123"), "");
  for (const ids of [[], ["456"], ["123", "123"], ["123", "789"]]) {
    assert.notEqual(creationProblem("Runde", ids, members, "123"), "");
  }
  for (const title of [
    " ",
    "x".repeat(61),
    "@everyone",
    "Runde\nneu",
    "Runde/neu",
    "Runde#neu",
    "Runde`neu",
    "Runde\\neu",
    "Runde\u0085neu",
  ]) {
    assert.notEqual(creationProblem(title, ["123"], members, "123"), "");
  }
});

test("correcting rejected creation data preserves its original request identity", () => {
  const api = evaluate("../src/domains/game-creation/creationRequest.ts", {});
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const original = {
    requestId: "c".repeat(64),
    title: "Alte Angaben",
    memberIds: ["123", "456"],
  };
  api.saveCreationRequest(storage, "123", original);
  const corrected = { ...original, title: "Neue Angaben", memberIds: ["123"] };
  api.reviseCreationRequest(storage, "123", corrected);
  assert.equal(
    api.loadCreationRequest(storage, "123").requestId,
    original.requestId,
  );
  assert.equal(api.loadCreationRequest(storage, "123").title, "Neue Angaben");
  assert.throws(() =>
    api.reviseCreationRequest(storage, "123", {
      ...corrected,
      requestId: "d".repeat(64),
    }),
  );
});

const { selectionProblem, modalProblem } = evaluate(
  "../src/domains/game-shell/components/InteractionsPanel/interactionContracts.ts",
  {},
);
test("select validates offered values, uniqueness and min/max", () => {
  const action = {
    minValues: 1,
    maxValues: 2,
    options: [{ value: "a" }, { value: "b" }, { value: "c" }],
  };
  assert.equal(selectionProblem(action, ["a", "b"]), "");
  assert.notEqual(selectionProblem(action, []), "");
  assert.notEqual(selectionProblem(action, ["a", "b", "c"]), "");
  assert.notEqual(selectionProblem(action, ["a", "a"]), "");
  assert.notEqual(selectionProblem(action, ["invented"]), "");
  assert.equal(selectionProblem({ ...action, minValues: 0 }, []), "");
});
test("modal validates original fields, required inputs and length constraints", () => {
  const modal = {
    fields: [
      {
        id: "note",
        label: "Notiz",
        required: true,
        minLength: 2,
        maxLength: 5,
      },
    ],
  };
  assert.equal(modalProblem(modal, { note: "Hallo" }), "");
  assert.notEqual(modalProblem(modal, { note: "" }), "");
  assert.notEqual(modalProblem(modal, { note: " " }), "");
  assert.notEqual(modalProblem(modal, { note: "x" }), "");
  assert.notEqual(modalProblem(modal, { note: "zu lang" }), "");
  assert.notEqual(
    modalProblem(modal, { note: "Hallo", hidden: "invented" }),
    "",
  );
  assert.equal(
    modalProblem(
      {
        fields: [{ id: "note", label: "Notiz", required: false, minLength: 2 }],
      },
      { note: "" },
    ),
    "",
  );
});

function evaluate(path, globals, transform = (text) => text) {
  const source = transform(
    readFileSync(new URL(path, import.meta.url), "utf8"),
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, URL, URLSearchParams, ...globals });
  return exports;
}
function configuration(env, origin = "https://ti4.example.test", runtime = {}) {
  return evaluate(
    "../src/config.ts",
    {
      env,
      window: {
        location: { origin, protocol: new URL(origin).protocol },
        __TI4_WRAPPER_CONFIG__: runtime,
      },
    },
    (text) => text.replaceAll("import.meta.env", "env"),
  ).config;
}
test("container supplies only public OAuth settings without changing own-origin APIs", () => {
  const runtime = {
    discordClientId: "1234567890",
    discordRedirectUri: "https://own.example.test/login",
  };
  const configured = configuration(
    { DEV: false, VITE_DISCORD_CLIENT_ID: "build-id" },
    "https://own.example.test",
    runtime,
  );
  assert.equal(configured.api.discordClientId, runtime.discordClientId);
  assert.equal(configured.api.discordRedirectUri, runtime.discordRedirectUri);
  assert.equal(configured.api.botApiUrl, "/api");
  assert.equal(configured.api.websocketUrl, "wss://own.example.test/ws");
});
function oauth(now = Date.now()) {
  const entries = new Map();
  const sessionStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  const module = evaluate(
    "../src/domains/auth/oauthState.ts",
    {
      config: {
        api: {
          discordClientId: "own-client",
          discordRedirectUri: "https://ti4.example.test/login",
        },
      },
      sessionStorage,
      Date: { now: () => now },
      require: () =>
        evaluate("../src/utils/secureRandomId.ts", {
          crypto: { getRandomValues: (bytes) => bytes.fill(0xab) },
        }),
    },
    (text) => text.replace(/^import .*;\r?\n/m, ""),
  );
  return { ...module, entries };
}

test("production game endpoints stay on the own origin", () => {
  const config = configuration({ DEV: false });
  assert.equal(config.api.botApiUrl, "/api");
  assert.equal(config.api.gameDataUrl, "/api/public/game");
  assert.equal(config.api.websocketUrl, "wss://ti4.example.test/ws");
  assert.equal(config.api.discordClientId, "");
  assert.equal(config.api.frogMapUrl, "");
});
test("development defaults use the local bot", () => {
  const config = configuration({ DEV: true }, "http://localhost:5173");
  assert.equal(config.api.botApiUrl, "/bot/api");
  assert.equal(config.api.websocketUrl, "ws://127.0.0.1:8081/ws");
});
test("explicit own endpoint overrides are respected", () => {
  const config = configuration({
    DEV: false,
    VITE_API_URL: "https://own.test/api/",
    VITE_WEBSOCKET_URL: "wss://own.test/ws",
  });
  assert.equal(config.api.botApiUrl, "https://own.test/api");
  assert.equal(config.api.websocketUrl, "wss://own.test/ws");
});
test("OAuth binds callback to one matching session state", () => {
  const auth = oauth();
  const url = new URL(auth.beginDiscordLogin());
  assert.equal(url.searchParams.get("client_id"), "own-client");
  const state = "ab".repeat(32);
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(auth.consumeOAuthState(state), true);
  assert.equal(auth.consumeOAuthState(state), false);
});

test("LAN HTTP creates secure identifiers without crypto.randomUUID", () => {
  let requestedBytes = 0;
  const { secureRandomId } = evaluate("../src/utils/secureRandomId.ts", {
    crypto: {
      getRandomValues(bytes) {
        requestedBytes = bytes.length;
        return bytes.map((_, index) => index);
      },
    },
  });
  assert.equal(
    secureRandomId(),
    Array.from({ length: 32 }, (_, index) =>
      index.toString(16).padStart(2, "0"),
    ).join(""),
  );
  assert.equal(requestedBytes, 32);
});

test("secure identifiers fail closed when secure randomness is unavailable", () => {
  const { secureRandomId } = evaluate("../src/utils/secureRandomId.ts", {
    crypto: {},
  });
  assert.throws(() => secureRandomId());
});
test("OAuth refuses missing, mismatched and malformed state", () => {
  const auth = oauth();
  assert.equal(auth.consumeOAuthState(null), false);
  auth.beginDiscordLogin();
  assert.equal(auth.consumeOAuthState("different"), false);
  auth.entries.set("own-ti4-oauth-state", "not json");
  assert.equal(auth.consumeOAuthState("random-state"), false);
});
test("OAuth refuses expired and future state", () => {
  const now = Date.now();
  const auth = oauth(now);
  for (const createdAt of [now - 11 * 60 * 1000, now + 1000]) {
    auth.entries.set(
      "own-ti4-oauth-state",
      JSON.stringify({ state: "random-state", createdAt }),
    );
    assert.equal(auth.consumeOAuthState("random-state"), false);
  }
});

function refreshHarness() {
  const storage = new Map([["auth_version", "v1"]]);
  let revision = 0;
  const pending = [];
  const auth = evaluate("../src/api/auth/useUser.ts", {
    require: (name) =>
      name === "uuid" ? { v4: () => `session-${++revision}` } : {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    window: { dispatchEvent() {} },
    Event: class {},
  });
  const refresh = evaluate("../src/api/auth/refreshToken.ts", {
    require: (name) =>
      name.includes("useUser")
        ? auth
        : name.includes("botApiUrl")
          ? { getBotApiUrl: (path) => path }
          : evaluate("../src/api/auth/loginResponse.ts", {}),
    fetch: () =>
      new Promise((resolve, reject) => pending.push({ resolve, reject })),
    console: { error() {} },
  });
  const fetchModule = evaluate("../src/api/auth/authenticatedFetch.ts", {
    require: (name) => (name.includes("useUser") ? auth : refresh),
    fetch: () =>
      new Promise((resolve, reject) => pending.push({ resolve, reject })),
  });
  const user = (id = "a") => ({
    id,
    discord_id: id,
    authenticated: true,
    token: `token-${id}`,
    refreshToken: `refresh-${id}`,
  });
  const success = (id = "a") => ({
    ok: true,
    json: async () => ({
      user_id: id,
      discord_id: id,
      bearer_token: `new-${id}`,
      refresh_token: `new-refresh-${id}`,
    }),
  });
  return { ...auth, ...refresh, ...fetchModule, pending, user, success };
}

test("late refresh success cannot log back in after logout", async () => {
  const auth = refreshHarness();
  auth.setLocalUser(auth.user());
  const pending = auth.refreshToken();
  auth.clearLocalUser();
  auth.pending[0].resolve(auth.success());
  assert.equal(await pending, null);
  assert.equal(auth.getLocalUser(), null);
});

test("old refresh failure cannot clear a new same-account login", async () => {
  const auth = refreshHarness();
  auth.setLocalUser(auth.user());
  const pending = auth.refreshToken();
  auth.clearLocalUser();
  auth.setLocalUser(auth.user());
  auth.pending[0].reject(new Error("expired"));
  assert.equal(await pending, null);
  assert.equal(auth.getLocalUser().token, "token-a");
});

test("different user gets own refresh while an older session is pending", async () => {
  const auth = refreshHarness();
  auth.setLocalUser(auth.user());
  const first = auth.refreshToken();
  const joined = auth.refreshToken();
  assert.equal(auth.pending.length, 1);
  auth.setLocalUser(auth.user("b"));
  const second = auth.refreshToken();
  const joinedSecond = auth.refreshToken();
  assert.equal(auth.pending.length, 2);
  auth.pending[0].resolve(auth.success());
  assert.equal(await first, null);
  assert.equal(await joined, null);
  const stillJoined = auth.refreshToken();
  assert.equal(auth.pending.length, 2);
  auth.pending[1].resolve(auth.success("b"));
  for (const result of await Promise.all([second, joinedSecond, stillJoined]))
    assert.equal(result.id, "b");
  assert.equal(auth.getLocalUser().token, "new-b");
});

test("401 from a former session cannot refresh or replay as a new account", async () => {
  const auth = refreshHarness();
  auth.setLocalUser(auth.user());
  const pending = auth.authenticatedFetch("/private-action", {
    method: "POST",
  });
  auth.setLocalUser(auth.user("b"));
  const response = { status: 401 };
  auth.pending[0].resolve(response);
  assert.equal(await pending, response);
  assert.equal(auth.pending.length, 1);
  assert.equal(auth.getLocalUser().id, "b");
});

test("refresh failure through authenticatedFetch preserves a newer login", async () => {
  const auth = refreshHarness();
  auth.setLocalUser(auth.user());
  const pending = auth.authenticatedFetch("/private-action");
  auth.pending[0].resolve({ status: 401 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(auth.pending.length, 2);
  auth.setLocalUser(auth.user("b"));
  auth.pending[1].reject(new Error("old refresh failed"));
  await pending;
  assert.equal(auth.getLocalUser().id, "b");
});
