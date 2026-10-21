import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authenticatedFetch, getBotApiUrl } from "@/api/auth";
import { getLocalSessionRevision } from "@/api/auth/useUser";
import { secureRandomId } from "@/utils/secureRandomId";
import styles from "./InteractionsPanel.module.css";

type AgentState = {
  gameName: string;
  phase: string;
  round: number;
  paused: boolean;
  seats: { id: string; name: string; faction: string | null; human: boolean }[];
  waitingFor: string | null;
  message?: string | null;
  status?: string;
  detail?: string | null;
};

async function readState(response: Response): Promise<AgentState | null> {
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "Bitte erneut anmelden."
        : "Agentensteuerung konnte nicht abgeschlossen werden. Prüfe den Zustand vor einem weiteren Schritt.",
    );
  }
  return response.json() as Promise<AgentState>;
}

export function AgentControls({
  gameId,
  userId,
}: {
  gameId: string;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const session = getLocalSessionRevision();
  const key = ["agents", gameId, userId, session];
  const endpoint = getBotApiUrl(
    `/wrapper/games/${encodeURIComponent(gameId)}/agents`,
  );
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const guard = useRef(false);
  const state = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      readState(await authenticatedFetch(endpoint, { signal })),
    retry: false,
    gcTime: 0,
    refetchInterval: sending ? false : 10000,
  });

  async function step() {
    if (guard.current || uncertain) return;
    guard.current = true;
    setSending(true);
    setNotice("");
    const revision = getLocalSessionRevision();
    try {
      const result = await readState(
        await authenticatedFetch(`${endpoint}/step`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: secureRandomId() }),
        }),
      );
      if (revision !== getLocalSessionRevision()) return;
      if (!result || result.gameName !== gameId)
        throw new Error("Keine passende Bestätigung erhalten.");
      queryClient.setQueryData(key, result);
      setNotice(result.detail ?? result.message ?? "Bot-Schritt verarbeitet.");
      await queryClient.invalidateQueries({
        queryKey: ["interactions", gameId, userId],
      });
    } catch (error) {
      if (revision !== getLocalSessionRevision()) return;
      setUncertain(true);
      setNotice(
        error instanceof Error
          ? error.message
          : "Die Antwort fehlt. Bitte den Zustand prüfen.",
      );
    } finally {
      guard.current = false;
      if (revision === getLocalSessionRevision()) setSending(false);
    }
  }

  const data = state.data?.gameName === gameId ? state.data : null;
  const requiresReview =
    uncertain || data?.status === "UNCERTAIN" || data?.status === "STARTED";
  if (!data && !state.error) return null;
  return (
    <section className={styles.agentControls} aria-label="Virtuelle Spieler">
      <strong>
        Du + {data?.seats.filter((seat) => !seat.human).length ?? 5} Bots
      </strong>
      {data && (
        <>
          <p>{data.message ?? `Runde ${data.round} · ${data.phase}`}</p>
          <p className={styles.agentSeats}>
            {data.seats
              .map(
                (seat) =>
                  `${seat.name}${seat.faction ? ` (${seat.faction})` : ""}`,
              )
              .join(" · ")}
          </p>
          {data.waitingFor && <p>Wartet auf: {data.waitingFor}</p>}
        </>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          disabled={sending || state.isFetching || requiresReview || !data}
          onClick={() => void step()}
        >
          {sending ? "Bot verarbeitet …" : "Bot-Einzelschritt"}
        </button>
        <button
          type="button"
          disabled={sending || state.isFetching}
          onClick={() => {
            void state.refetch().then((result) => {
              if (!result.isError) setNotice("Zustand neu geladen.");
            });
          }}
        >
          Bot-Status prüfen
        </button>
      </div>
      <div role="status" aria-live="polite">
        {notice && <p>{notice}</p>}
        {state.error && <p>{state.error.message}</p>}
        {requiresReview && (
          <p>
            Ein Schritt hat keine eindeutige Bestätigung erhalten. Die Steuerung
            bleibt angehalten; bitte den letzten Vorgang prüfen.
          </p>
        )}
      </div>
      <small>
        Ein Klick bearbeitet höchstens eine Botentscheidung. Dein eigener Sitz
        bleibt bei dir.
      </small>
    </section>
  );
}
