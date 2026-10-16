import {
  clearLocalUser,
  getLocalUser,
  getLocalSessionRevision,
  setLocalUser,
  type LocalUser,
} from "@/api/auth/useUser";
import { getBotApiUrl } from "./botApiUrl";
import { toLocalUser, type LoginResponse } from "./loginResponse";

let inFlightRefresh: {
  key: string;
  promise: Promise<LocalUser | null>;
} | null = null;

export async function refreshToken(): Promise<LocalUser | null> {
  const user = getLocalUser();
  if (!user?.refreshToken || !user.authenticated) {
    return null;
  }
  const revision = getLocalSessionRevision();
  const key = JSON.stringify([revision, user]);
  if (inFlightRefresh?.key === key) return inFlightRefresh.promise;
  const pending = { key, promise: performRefresh(user, revision) };
  inFlightRefresh = pending;
  try {
    return await pending.promise;
  } finally {
    if (inFlightRefresh === pending) inFlightRefresh = null;
  }
}

async function performRefresh(
  user: LocalUser,
  revision: string | null,
): Promise<LocalUser | null> {
  const isCurrentSession = () =>
    getLocalSessionRevision() === revision &&
    JSON.stringify(getLocalUser()) === JSON.stringify(user);

  const apiUrl = getBotApiUrl("/public/auth/refresh");

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: user.id,
        refresh_token: user.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error("Token refresh failed");
    }

    const updatedUser = toLocalUser((await response.json()) as LoginResponse);
    if (!isCurrentSession()) return null;
    if (
      updatedUser.id !== user.id ||
      updatedUser.discord_id !== user.discord_id
    )
      throw new Error("Refresh returned a different account");
    setLocalUser(updatedUser);
    return updatedUser;
  } catch (error) {
    console.error("Token refresh failed:", error);
    if (isCurrentSession()) clearLocalUser();
    return null;
  }
}
