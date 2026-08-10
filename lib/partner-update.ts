export function partnerUpdatePayload({
  displayName,
  isFreeSingle,
  sortOrder
}: {
  displayName: string;
  isFreeSingle: boolean;
  sortOrder: number;
}) {
  const normalizedName = displayName.trim();
  return isFreeSingle
    ? { displayName: normalizedName }
    : { displayName: normalizedName, sortOrder };
}
