export const UNLINKED_PROPERTY_SCOPE = "__unlinked__";

export function allPropertyIds(properties: Array<{ id: string }>) {
  return properties.map((property) => property.id).filter(Boolean);
}

export function allPaymentPropertyScopeIds(properties: Array<{ id: string }>) {
  return [...allPropertyIds(properties), UNLINKED_PROPERTY_SCOPE];
}

export function isAllPropertyScope(selectedIds: string[], properties: Array<{ id: string }>, includeUnlinked = false) {
  const ids = includeUnlinked ? allPaymentPropertyScopeIds(properties) : allPropertyIds(properties);
  return ids.length > 0 && selectedIds.length === ids.length && ids.every((id) => selectedIds.includes(id));
}

export function paymentMatchesPropertyScope(propertyId: string | null | undefined, selectedIds: string[]) {
  return selectedIds.includes(propertyId || UNLINKED_PROPERTY_SCOPE);
}

export function togglePropertyScope(selectedIds: string[], propertyId: string) {
  return selectedIds.includes(propertyId)
    ? selectedIds.filter((id) => id !== propertyId)
    : [...selectedIds, propertyId];
}
