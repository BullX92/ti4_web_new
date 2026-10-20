import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authenticatedFetch, getBotApiUrl } from "@/api/auth";
import { getLocalSessionRevision, useUser } from "@/api/auth/useUser";
import { Button } from "@/ds";
import { DiscordAuthButton } from "@/domains/auth/DiscordLogin";
import { InteractionsPanel } from "@/domains/game-shell/components/InteractionsPanel/InteractionsPanel";
import {
  clearCreationRequest,
  creationProblem,
  loadCreationRequest,
  reviseCreationRequest,
  saveCreationRequest,
  type CreationRequest,
} from "@/domains/game-creation/creationRequest";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageShell } from "@/layout/PageShell";
import { secureRandomId } from "@/utils/secureRandomId";
import styles from "./GameCreationPage.module.css";

type Member = { id: string; name: string };
type CreationOptions = { canCreate: boolean; members: Member[] };
type Operation = {
  requestId: string;
  gameName: string | null;
  state: "CREATING" | "COMPLETED" | "NEEDS_REPAIR";
  message: string | null;
};

class CreationError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message =
      response.status === 403
        ? "Nur ein Administrator dieses Spielservers darf Partien anlegen."
        : response.status === 401
          ? "Bitte erneut mit Discord anmelden."
          : response.status === 404
            ? "Der Auftrag wurde auf dem Spielserver noch nicht gefunden."
            : response.status === 409
              ? "Dieser Auftrag ist bereits mit anderen Angaben gespeichert. Bitte den bestehenden Auftrag prüfen."
              : response.status === 503
                ? "Der Spielserver ist gerade nicht bereit. Bitte später erneut prüfen."
                : response.status === 400
                  ? "Der Spielserver hat die Angaben abgelehnt. Es wurde kein neuer Einrichtungsversuch begonnen."
                  : "Die Serverantwort fehlt. Bitte den bestehenden Auftrag prüfen.";
    throw new CreationError(response.status, message);
  }
  return response.json() as Promise<T>;
}

export default function GameCreationPage() {
  useDocumentTitle("Neue Partie · AsyncTI4");
  const { user } = useUser();
  const actorId = user?.discord_id ?? user?.id;
  return (
    <PageShell footer>
      <div className={styles.page}>
        <Link to="/">Zur Übersicht</Link>
        <h1>Neue Partie</h1>
        {user?.authenticated && user.token && actorId ? (
          <CreationForm
            key={`${actorId}:${getLocalSessionRevision()}`}
            actorId={actorId}
          />
        ) : (
          <>
            <p>Melde dich mit dem Discord-Konto des Administrators an.</p>
            <DiscordAuthButton>Mit Discord anmelden</DiscordAuthButton>
          </>
        )}
      </div>
    </PageShell>
  );
}

function CreationForm({ actorId }: { actorId: string }) {
  const [checkpoint] = useState(() => {
    try {
      return {
        request: loadCreationRequest(sessionStorage, actorId),
        error: "",
      };
    } catch {
      return {
        request: null,
        error:
          "Der gespeicherte Auftrag ist nicht lesbar. Bitte erst deine Partien prüfen, bevor du einen weiteren Auftrag beginnst.",
      };
    }
  });
  const [pending, setPending] = useState<CreationRequest | null>(
    checkpoint.request,
  );
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState([actorId]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [rejected, setRejected] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const guard = useRef(false);
  const queryClient = useQueryClient();
  const session = getLocalSessionRevision();
  const operationKey = [
    "creation-operation",
    actorId,
    session,
    pending?.requestId,
  ];
  const options = useQuery({
    queryKey: ["creation-options", actorId, session],
    queryFn: async ({ signal }) =>
      readResponse<CreationOptions>(
        await authenticatedFetch(getBotApiUrl("/wrapper/game-creation"), {
          signal,
        }),
      ),
    retry: false,
    gcTime: 0,
  });
  const operation = useQuery({
    queryKey: operationKey,
    queryFn: async ({ signal }) => {
      if (!pending) throw new Error("Kein Auftrag vorhanden.");
      const result = await readResponse<Operation>(
        await authenticatedFetch(
          getBotApiUrl(
            `/wrapper/game-creation/${encodeURIComponent(pending.requestId)}`,
          ),
          { signal },
        ),
      );
      if (result.requestId !== pending.requestId)
        throw new Error("Die Antwort gehört nicht zu diesem Auftrag.");
      return result;
    },
    enabled: !!pending && !sending,
    retry: false,
    gcTime: 0,
    refetchInterval: (query) =>
      query.state.data?.state === "CREATING" ? 3000 : false,
  });

  async function send(request: CreationRequest) {
    if (guard.current) return;
    guard.current = true;
    setSending(true);
    setNotice("");
    setRejected(false);
    const revision = getLocalSessionRevision();
    try {
      const result = await readResponse<Operation>(
        await authenticatedFetch(getBotApiUrl("/wrapper/games"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        }),
      );
      if (revision !== getLocalSessionRevision()) return;
      if (result.requestId !== request.requestId)
        throw new Error("Die Antwort gehört nicht zu diesem Auftrag.");
      queryClient.setQueryData(
        ["creation-operation", actorId, revision, request.requestId],
        result,
      );
    } catch (error) {
      if (revision !== getLocalSessionRevision()) return;
      setRejected(error instanceof CreationError && error.status === 400);
      setNotice(
        error instanceof CreationError
          ? error.message
          : "Die Antwort fehlt. Prüfe denselben Auftrag; starte keine zweite Partie auf Verdacht.",
      );
    } finally {
      guard.current = false;
      if (revision === getLocalSessionRevision()) setSending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guard.current || pending || !options.data?.canCreate) return;
    const problem = creationProblem(
      title,
      selected,
      options.data.members,
      actorId,
    );
    if (problem) {
      setNotice(problem);
      return;
    }
    const request = {
      requestId: editingId ?? secureRandomId(),
      title: title.trim(),
      memberIds: selected,
    };
    try {
      if (editingId) reviseCreationRequest(sessionStorage, actorId, request);
      else saveCreationRequest(sessionStorage, actorId, request);
    } catch {
      setNotice(
        "Der Auftrag konnte im Browser nicht gesichert werden. Es wurde nichts gesendet.",
      );
      return;
    }
    setPending(request);
    void send(request);
  }

  const result = operation.data;
  return (
    <>
      <p>
        Wähle die Mitspieler aus eurem privaten Server. Du bist Besitzer der
        neuen Partie.
      </p>
      {checkpoint.error && <p role="alert">{checkpoint.error}</p>}
      {options.isPending && <p role="status">Mitspieler werden geladen …</p>}
      {options.error && (
        <p role="alert">
          {options.error instanceof CreationError &&
          options.error.status === 404
            ? "Die Spielanlage ist auf diesem Server noch nicht verfügbar."
            : options.error.message}
        </p>
      )}
      {notice && <p role="alert">{notice}</p>}
      {pending ? (
        <section aria-label="Einrichtungsauftrag" className={styles.card}>
          <h2>{result?.gameName ?? pending.title}</h2>
          <div role="status" aria-live="polite">
            {sending ? (
              <p>Die Partie wird eingerichtet …</p>
            ) : result?.state === "COMPLETED" ? (
              <p>Die Partie {result.gameName} ist angelegt.</p>
            ) : result?.state === "NEEDS_REPAIR" ? (
              <p>
                Die Einrichtung muss geprüft werden. Es wird keine zweite Partie
                angelegt.
              </p>
            ) : result?.state === "CREATING" ? (
              <p>Die Einrichtung läuft. Du kannst diese Seite erneut öffnen.</p>
            ) : operation.isPending ? (
              <p>Der gespeicherte Auftrag wird geprüft …</p>
            ) : null}
            {result?.message && <p>{result.message}</p>}
          </div>
          {operation.error && <p role="alert">{operation.error.message}</p>}
          {result?.state === "COMPLETED" && result.gameName ? (
            <>
              <p>
                Die angebotenen Einrichtungsschritte kommen direkt aus eurer
                Partie. Dort kannst du auch den vorhandenen Milty-Draft öffnen.
              </p>
              <InteractionsPanel gameId={result.gameName} initiallyOpen />
              <div className={styles.actions}>
                <Button
                  component={Link}
                  to={`/game/${encodeURIComponent(result.gameName)}`}
                >
                  Zur Partie
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    try {
                      clearCreationRequest(sessionStorage, actorId);
                      setPending(null);
                      setNotice("");
                      setTitle("");
                      setSelected([actorId]);
                      setEditingId(null);
                    } catch {
                      setNotice(
                        "Der gespeicherte Auftrag konnte nicht abgeschlossen werden.",
                      );
                    }
                  }}
                >
                  Weitere Partie anlegen
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.actions}>
              <Button
                variant="default"
                disabled={sending || operation.isFetching}
                onClick={() => void operation.refetch()}
              >
                Auftrag prüfen
              </Button>
              {operation.error instanceof CreationError &&
                operation.error.status === 404 && (
                  <Button disabled={sending} onClick={() => void send(pending)}>
                    Denselben Auftrag erneut senden
                  </Button>
                )}
              {rejected &&
                operation.error instanceof CreationError &&
                operation.error.status === 404 && (
                  <Button
                    variant="default"
                    disabled={sending}
                    onClick={() => {
                      setEditingId(pending.requestId);
                      setTitle(pending.title);
                      setSelected([
                        actorId,
                        ...pending.memberIds.filter(
                          (id) =>
                            id !== actorId &&
                            options.data?.members.some(
                              (member) => member.id === id,
                            ),
                        ),
                      ]);
                      setPending(null);
                      setNotice(
                        "Prüfe die Angaben und Mitspieler erneut. Die Korrektur bleibt demselben Auftrag zugeordnet.",
                      );
                    }}
                  >
                    Angaben korrigieren
                  </Button>
                )}
            </div>
          )}
        </section>
      ) : (
        !checkpoint.error &&
        options.data?.canCreate &&
        !options.error && (
          <form onSubmit={submit} className={styles.card}>
            <label className={styles.field}>
              Partiename
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={60}
                required
                placeholder="Zum Beispiel: Dienstagsrunde"
              />
            </label>
            <fieldset className={styles.members}>
              <legend>Mitspieler · {selected.length} von höchstens 8</legend>
              {options.data.members.map((member) => (
                <label key={member.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(member.id)}
                    disabled={
                      member.id === actorId ||
                      (!selected.includes(member.id) && selected.length >= 8)
                    }
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, member.id]
                          : current.filter((id) => id !== member.id),
                      )
                    }
                  />
                  <span>
                    {member.name}
                    {member.id === actorId ? " (du)" : ""}
                  </span>
                </label>
              ))}
            </fieldset>
            <Button type="submit" disabled={!title.trim()}>
              Partie anlegen
            </Button>
          </form>
        )
      )}
      <p>
        <Link to="/dashboard">Meine Partien öffnen</Link>
      </p>
    </>
  );
}
