export type CreationRequest = {
  requestId: string;
  title: string;
  memberIds: string[];
};

type RequestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function creationProblem(
  title: string,
  memberIds: string[],
  members: { id: string; name: string }[],
  actorId: string,
): string {
  if (
    !title.trim() ||
    title.trim().length > 60 ||
    /[@<>`/#\\\u0000-\u001f\u007f-\u009f]/.test(title)
  ) {
    return "Gib einen Namen mit höchstens 60 Zeichen ohne Erwähnungen, Zeilenumbrüche oder die Zeichen < > ` / # \\ ein.";
  }
  if (
    memberIds.length < 1 ||
    memberIds.length > 8 ||
    !memberIds.includes(actorId)
  ) {
    return "Wähle dich selbst und insgesamt höchstens acht Mitspieler aus.";
  }
  if (
    new Set(memberIds).size !== memberIds.length ||
    memberIds.some((id) => !members.some((member) => member.id === id))
  ) {
    return "Wähle jeden Mitspieler genau einmal aus der aktuellen Liste aus.";
  }
  return "";
}

function storageKey(actorId: string) {
  return `own-ti4-creation:${actorId}`;
}

export function loadCreationRequest(
  storage: RequestStorage,
  actorId: string,
): CreationRequest | null {
  const raw = storage.getItem(storageKey(actorId));
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("requestId" in parsed) ||
    typeof parsed.requestId !== "string" ||
    !/^[a-f0-9]{64}$/.test(parsed.requestId) ||
    !("title" in parsed) ||
    typeof parsed.title !== "string" ||
    !("memberIds" in parsed) ||
    !Array.isArray(parsed.memberIds) ||
    !parsed.memberIds.every(
      (id: unknown) => typeof id === "string" && /^\d{1,20}$/.test(id),
    )
  )
    throw new Error(
      "Der gespeicherte Einrichtungsauftrag kann nicht gelesen werden.",
    );
  return parsed as CreationRequest;
}

export function saveCreationRequest(
  storage: RequestStorage,
  actorId: string,
  request: CreationRequest,
) {
  const existing = loadCreationRequest(storage, actorId);
  if (existing && JSON.stringify(existing) !== JSON.stringify(request)) {
    throw new Error(
      "Für dieses Konto ist bereits ein Einrichtungsauftrag gespeichert.",
    );
  }
  storage.setItem(storageKey(actorId), JSON.stringify(request));
}

export function clearCreationRequest(storage: RequestStorage, actorId: string) {
  storage.removeItem(storageKey(actorId));
}

export function reviseCreationRequest(
  storage: RequestStorage,
  actorId: string,
  request: CreationRequest,
) {
  const existing = loadCreationRequest(storage, actorId);
  if (!existing || existing.requestId !== request.requestId) {
    throw new Error(
      "Eine Korrektur muss denselben Einrichtungsauftrag behalten.",
    );
  }
  storage.setItem(storageKey(actorId), JSON.stringify(request));
}
