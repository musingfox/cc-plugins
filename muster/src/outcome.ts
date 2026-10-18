export type PermissionOption = {
  optionId: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
  name?: string;
};

export type PermissionOutcome =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

const ONCE_KIND_BY_DECISION = {
  allow: "allow_once",
  deny: "reject_once",
} as const;

export function chooseOutcome(
  options: PermissionOption[],
  decision: "allow" | "deny",
): PermissionOutcome {
  const kind = ONCE_KIND_BY_DECISION[decision];
  const match = options.find((option) => option.kind === kind);
  return match ? { outcome: "selected", optionId: match.optionId } : { outcome: "cancelled" };
}
