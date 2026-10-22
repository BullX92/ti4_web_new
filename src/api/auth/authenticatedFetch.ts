import { getLocalSessionRevision, getLocalUser } from "@/api/auth/useUser";
import { refreshToken } from "./refreshToken";

function fetchWithToken(url: string, options: RequestInit, token: string) {
  return fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
}

/** Fetches with the stored bearer token, refreshing it and retrying once on a 401. */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const user = getLocalUser();
  const sessionRevision = getLocalSessionRevision();

  if (!user?.token) {
    throw new Error("No authentication token available");
  }

  const response = await fetchWithToken(url, options, user.token);
  if (response.status !== 401 || !user.refreshToken) return response;
  if (
    getLocalSessionRevision() !== sessionRevision ||
    JSON.stringify(getLocalUser()) !== JSON.stringify(user)
  )
    return response;

  const refreshedUser = await refreshToken();
  if (!refreshedUser?.token) {
    return response;
  }
  if (JSON.stringify(getLocalUser()) !== JSON.stringify(refreshedUser))
    return response;

  return fetchWithToken(url, options, refreshedUser.token);
}
