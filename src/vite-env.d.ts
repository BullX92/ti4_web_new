/// <reference types="vite/client" />

interface Window {
  readonly __TI4_WRAPPER_CONFIG__?: {
    readonly discordClientId?: string;
    readonly discordRedirectUri?: string;
  };
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_BACKEND_PROXY_URL?: string;
  readonly VITE_WEBSOCKET_URL?: string;
  readonly VITE_DISCORD_CLIENT_ID?: string;
  readonly VITE_DISCORD_REDIRECT_URI?: string;
  readonly VITE_MAPS_URL?: string;
  readonly VITE_FROG_MAP_URL?: string;
}
