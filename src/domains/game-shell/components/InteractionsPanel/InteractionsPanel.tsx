import { useId, useRef, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authenticatedFetch, getBotApiUrl } from "@/api/auth";
import { useUser } from "@/api/auth/useUser";
import { DiscordAuthButton } from "@/domains/auth/DiscordLogin";
import { secureRandomId } from "@/utils/secureRandomId";
import styles from "./InteractionsPanel.module.css";
import {
  modalProblem,
  selectionProblem,
  type OfferedAction,
  type OfferedModal,
} from "./interactionContracts";

type Action = OfferedAction;
type Offers = {
  gameName: string;
  seat: string | null;
  phase: string;
  round: number;
  messages: {
    id: string;
    channelId: string;
    content: string;
    actions: Action[];
  }[];
};
type ActionResult = {
  status: string;
  detail?: string;
  replies?: string[];
  modalId?: string | null;
  unsupportedCalls?: string[];
  modal?: OfferedModal | null;
};

class InteractionError extends Error {
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
      response.status === 409
        ? "Das Angebot hat sich geändert. Die aktuellen Aktionen werden geladen."
        : response.status === 401
          ? "Bitte erneut mit Discord anmelden."
          : response.status === 403
            ? "Dein Konto darf für diesen Sitz keine Aktionen ausführen."
            : response.status === 404
              ? "Die Aktionsschnittstelle ist für dieses Spiel noch nicht verfügbar."
              : "Der Spielserver konnte die Anfrage nicht abschließen.";
    throw new InteractionError(response.status, message);
  }
  return response.json() as Promise<T>;
}

export function InteractionsPanel({
  gameId,
  initiallyOpen = false,
}: {
  gameId: string;
  initiallyOpen?: boolean;
}) {
  const { user } = useUser();
  return (
    <aside className={styles.panel} aria-label="Spielaktionen">
      {user?.authenticated && user.token ? (
        <SeatActions
          key={`${gameId}:${user.discord_id ?? user.id}`}
          gameId={gameId}
          userId={user.discord_id ?? user.id}
          initiallyOpen={initiallyOpen}
        />
      ) : (
        <details>
          <summary>Deine Aktionen</summary>
          <div className={styles.body}>
            <p>Melde dich an, um die Aktionen deines Sitzes zu sehen.</p>
            <DiscordAuthButton size="sm">
              Mit Discord anmelden
            </DiscordAuthButton>
          </div>
        </details>
      )}
    </aside>
  );
}

function SeatActions({
  gameId,
  userId,
  initiallyOpen,
}: {
  gameId: string;
  userId: string;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [staleModal, setStaleModal] = useState(false);
  const guard = useRef(false);
  const queryClient = useQueryClient();
  const endpoint = getBotApiUrl(
    `/game/${encodeURIComponent(gameId)}/interactions`,
  );
  const offers = useQuery({
    queryKey: ["interactions", gameId, userId],
    queryFn: async ({ signal }) =>
      readResponse<Offers>(await authenticatedFetch(endpoint, { signal })),
    enabled: open,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: open && !sending ? 10000 : false,
    refetchOnWindowFocus: open && !sending,
  });
  const messages = offers.data?.gameName === gameId ? offers.data.messages : [];
  const count =
    messages?.reduce((sum, message) => sum + message.actions.length, 0) ?? 0;

  async function execute(
    token: string,
    payload: { values?: string[]; fields?: Record<string, string> } = {},
    modal = false,
  ) {
    if (guard.current || offers.isFetching || offers.isError) return;
    guard.current = true;
    setSending(true);
    setNotice("");
    if (!modal) setResult(null);
    try {
      const response = await authenticatedFetch(
        `${endpoint}/${modal ? "modals/" : ""}${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: secureRandomId(), ...payload }),
        },
      );
      const next = await readResponse<ActionResult>(response);
      setResult(next);
      setStaleModal(false);
    } catch (error) {
      if (modal && error instanceof InteractionError && error.status === 409)
        setStaleModal(true);
      setNotice(
        error instanceof InteractionError
          ? error.message
          : "Die Antwort fehlt. Bitte erst den Spielstand prüfen und die Angebote aktualisieren, bevor du erneut handelst.",
      );
    } finally {
      await Promise.all([
        offers.refetch(),
        queryClient.invalidateQueries({ queryKey: ["playerData", gameId] }),
        queryClient.invalidateQueries({ queryKey: ["playerHand", gameId] }),
      ]);
      guard.current = false;
      setSending(false);
    }
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Deine Aktionen {open && count > 0 ? `(${count})` : ""}</summary>
      <div className={styles.body}>
        <div className={styles.toolbar}>
          <span>
            {offers.data?.seat ?? "Dein Sitz"}
            {offers.data
              ? ` · Runde ${offers.data.round} · ${offers.data.phase}`
              : ""}
          </span>
          <button
            type="button"
            disabled={sending || offers.isFetching}
            onClick={() => void offers.refetch()}
          >
            Aktualisieren
          </button>
        </div>
        <div aria-live="polite" role="status">
          {offers.isLoading && <p>Aktionen werden geladen …</p>}
          {sending && <p>Aktion wird verarbeitet …</p>}
          {notice && <p>{notice}</p>}
          {offers.error && <p role="alert">{offers.error.message}</p>}
          {result && (
            <div className={styles.result}>
              <p>
                {result.modal
                  ? "Das Formular ist bereit. Erst Absenden führt deine Eingaben aus."
                  : result.modalId
                    ? "Das Originalformular ist hier noch nicht vollständig verfügbar. Eine Formulareingabe wurde noch nicht gesendet."
                    : result.unsupportedCalls?.length
                      ? "Diese Eingabe ist hier noch nicht vollständig verfügbar. Bitte den Spielstand prüfen, bevor du erneut handelst."
                      : `Serverantwort: ${result.status}`}
              </p>
              {result.detail && <p>{result.detail}</p>}
              {result.replies?.map((reply, index) => (
                <p key={index}>{reply}</p>
              ))}
              {!!result.unsupportedCalls?.length && (
                <p>
                  Offene Interaktionen: {result.unsupportedCalls.join(", ")}
                </p>
              )}
            </div>
          )}
        </div>
        {result?.modal && (
          <ModalForm
            key={result.modal.token}
            modal={result.modal}
            disabled={sending || staleModal}
            stale={staleModal}
            onSubmit={(fields) =>
              void execute(result.modal!.token, { fields }, true)
            }
            onCancel={() => {
              setResult({ ...result, modal: null, modalId: null });
              setStaleModal(false);
              setNotice(
                "Formular geschlossen. Es wurden keine Formulareingaben abgesendet.",
              );
            }}
            sending={sending}
          />
        )}
        {!offers.isLoading && !offers.isError && offers.data && count === 0 && (
          <p>
            Für dich werden gerade keine Aktionen angeboten. Andere
            Entscheidungen können weiterhin in Discord offen sein.
          </p>
        )}
        {!offers.isError &&
          messages?.map((message) => (
            <section
              className={styles.message}
              key={`${message.channelId}:${message.id}`}
            >
              {message.content && <p>{message.content}</p>}
              <div className={styles.actions}>
                {message.actions.map((action) =>
                  action.type === "STRING_SELECT" ? (
                    <SelectAction
                      key={action.id}
                      action={action}
                      disabled={sending || offers.isFetching || !!result?.modal}
                      onSubmit={(values) =>
                        void execute(action.token, { values })
                      }
                    />
                  ) : !action.type || action.type === "BUTTON" ? (
                    <button
                      key={action.id}
                      type="button"
                      disabled={sending || offers.isFetching || !!result?.modal}
                      onClick={() => void execute(action.token)}
                    >
                      {action.label || "Aktion"}
                    </button>
                  ) : (
                    <p key={action.id}>
                      Diese Auswahl wird noch nicht unterstützt. Bitte in
                      Discord fortsetzen.
                    </p>
                  ),
                )}
              </div>
            </section>
          ))}
      </div>
    </details>
  );
}

function SelectAction({
  action,
  disabled,
  onSubmit,
}: {
  action: Action;
  disabled: boolean;
  onSubmit: (values: string[]) => void;
}) {
  const [values, setValues] = useState<string[]>([]);
  const id = useId();
  const problem = selectionProblem(action, values);
  const multiple = (action.maxValues ?? 1) > 1;
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem && !disabled) onSubmit(values);
      }}
    >
      <label htmlFor={id}>
        {action.label || action.placeholder || "Auswahl"}
      </label>
      <select
        id={id}
        multiple={multiple}
        disabled={disabled}
        value={multiple ? values : (values[0] ?? "")}
        onChange={(event) =>
          setValues(
            Array.from(
              event.target.selectedOptions,
              (option) => option.value,
            ).filter(Boolean),
          )
        }
      >
        {!multiple && (
          <option value="">{action.placeholder || "Bitte wählen"}</option>
        )}
        {action.options?.map((option) => (
          <option
            key={option.value}
            value={option.value}
            title={option.description}
          >
            {option.label}
          </option>
        ))}
      </select>
      {problem && <small>{problem}</small>}
      <button type="submit" disabled={disabled || !!problem}>
        Auswahl bestätigen
      </button>
    </form>
  );
}

function ModalForm({
  modal,
  disabled,
  stale,
  sending,
  onSubmit,
  onCancel,
}: {
  modal: OfferedModal;
  disabled: boolean;
  stale: boolean;
  sending: boolean;
  onSubmit: (fields: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      modal.fields.map((field) => [field.id, field.value ?? ""]),
    ),
  );
  const id = useId();
  const problem = modalProblem(modal, values);
  return (
    <form
      className={styles.form}
      aria-label={modal.title}
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem && !disabled) onSubmit(values);
      }}
    >
      <strong>{modal.title}</strong>
      {stale && (
        <p role="alert">
          Dieses Formular ist veraltet. Deine Eingaben bleiben hier sichtbar.
          Bitte schließen und das aktuelle Angebot erneut öffnen.
        </p>
      )}
      {modal.fields.map((field, index) => {
        const props = {
          id: `${id}-${index}`,
          value: values[field.id],
          required: field.required,
          minLength: field.minLength ?? undefined,
          maxLength: field.maxLength ?? 4000,
          placeholder: field.placeholder ?? undefined,
          disabled,
          onChange: (
            event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
          ) =>
            setValues((current) => ({
              ...current,
              [field.id]: event.target.value,
            })),
        };
        return (
          <div key={field.id} className={styles.field}>
            <label htmlFor={props.id}>
              {field.label}
              {field.required ? " *" : ""}
            </label>
            {field.style === "PARAGRAPH" || field.style === 2 ? (
              <textarea {...props} rows={3} />
            ) : (
              <input {...props} type="text" />
            )}
          </div>
        );
      })}
      {problem && <small>{problem}</small>}
      <div className={styles.actions}>
        <button type="button" disabled={sending} onClick={onCancel}>
          Schließen ohne Absenden
        </button>
        <button type="submit" disabled={disabled || !!problem}>
          Formular absenden
        </button>
      </div>
    </form>
  );
}
