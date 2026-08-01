/**
 * The actual move-out date rollout is opt-in. Any value other than the
 * explicit string "true" keeps the write UI and date-aware reads disabled.
 */
export function isActualMoveOutDateEnabled(value = process.env.NEXT_PUBLIC_ACTUAL_MOVE_OUT_DATE_ENABLED) {
  return value?.trim().toLowerCase() === "true";
}
