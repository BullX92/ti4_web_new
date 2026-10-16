/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_BACKEND_PROXY_URL?: string;
  readonly VITE_WEBSOCKET_URL?: string;
  readonly VITE_DISCORD_CLIENT_ID?: string;
  readonly VITE_DISCORD_REDIRECT_URI?: string;
  readonly VITE_MAPS_URL?: string;
  readonly VITE_FROG_MAP_URL?: string;
}
