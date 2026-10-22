const apiBase = (
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "/bot/api" : "/api")
).replace(/\/$/, "");
const socketUrl = new URL("/ws", window.location.origin);
socketUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const runtime = window.__TI4_WRAPPER_CONFIG__ ?? {};

export const config = {
  api: {
    botApiUrl: apiBase,
    gameDataUrl: `${apiBase}/public/game`,
    websocketUrl:
      import.meta.env.VITE_WEBSOCKET_URL ||
      (import.meta.env.DEV ? "ws://127.0.0.1:8081/ws" : socketUrl.href),
    discordClientId: runtime.discordClientId || import.meta.env.VITE_DISCORD_CLIENT_ID || "",
    discordRedirectUri:
      runtime.discordRedirectUri || import.meta.env.VITE_DISCORD_REDIRECT_URI ||
      `${window.location.origin}/login`,
    mapsUrl: import.meta.env.VITE_MAPS_URL || "/maps.json",
    proxyMapsUrl: import.meta.env.VITE_MAPS_URL || "/maps.json",
    frogMapUrl: import.meta.env.VITE_FROG_MAP_URL || "",
  },
};
