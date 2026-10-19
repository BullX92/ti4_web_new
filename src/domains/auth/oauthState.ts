import { config } from "@/config";
import { secureRandomId } from "@/utils/secureRandomId";

const STATE_KEY = "own-ti4-oauth-state";
const MAX_AGE = 10 * 60 * 1000;

export function beginDiscordLogin(): string {
  if (!config.api.discordClientId) {
    throw new Error("Discord-Anmeldung ist noch nicht eingerichtet.");
  }
  const state = secureRandomId();
  sessionStorage.setItem(
    STATE_KEY,
    JSON.stringify({ state, createdAt: Date.now() }),
  );
  const url = new URL("https://discord.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: config.api.discordClientId,
    response_type: "code",
    redirect_uri: config.api.discordRedirectUri,
    scope: "identify",
    state,
  }).toString();
  return url.href;
}

export function consumeOAuthState(received: string | null): boolean {
  const raw = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  if (!raw || !received) return false;
  try {
    const saved: unknown = JSON.parse(raw);
    if (
      typeof saved !== "object" ||
      saved === null ||
      !("state" in saved) ||
      typeof saved.state !== "string" ||
      !("createdAt" in saved) ||
      typeof saved.createdAt !== "number"
    )
      return false;
    const age = Date.now() - saved.createdAt;
    return (
      saved.state === received &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < MAX_AGE
    );
  } catch {
    return false;
  }
}
