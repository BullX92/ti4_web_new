export type OfferedAction = {
  id: string;
  token: string;
  label: string;
  style?: string | number;
  type?: "BUTTON" | "STRING_SELECT";
  options?: { label: string; value: string; description?: string }[];
  minValues?: number | null;
  maxValues?: number | null;
  placeholder?: string | null;
};
export type OfferedModal = {
  token: string;
  title: string;
  fields: {
    id: string;
    label: string;
    style?: string | number;
    required: boolean;
    minLength?: number | null;
    maxLength?: number | null;
    value?: string | null;
    placeholder?: string | null;
  }[];
};

export function selectionProblem(
  action: OfferedAction,
  values: string[],
): string {
  const unique = new Set(values);
  const allowed = new Set(action.options?.map((option) => option.value));
  if (
    unique.size !== values.length ||
    values.some((value) => !allowed.has(value))
  ) {
    return "Bitte nur angebotene Werte wählen.";
  }
  const min = action.minValues ?? 1;
  const max = action.maxValues ?? 1;
  if (values.length < min || values.length > max) {
    return min === max
      ? `Bitte genau ${min} auswählen.`
      : `Bitte ${min} bis ${max} auswählen.`;
  }
  return "";
}

export function modalProblem(
  modal: OfferedModal,
  values: Record<string, string>,
): string {
  for (const field of modal.fields) {
    const value = values[field.id] ?? "";
    if (field.required && !value.trim())
      return `Bitte „${field.label}“ ausfüllen.`;
    if (value.length > (field.maxLength ?? 4000))
      return `„${field.label}“ ist zu lang.`;
    if (value.length > 0 && value.length < (field.minLength ?? 0))
      return `„${field.label}“ ist zu kurz.`;
  }
  if (
    Object.keys(values).some(
      (key) => !modal.fields.some((field) => field.id === key),
    )
  ) {
    return "Das Formular enthält ein nicht angebotenes Feld.";
  }
  return "";
}
