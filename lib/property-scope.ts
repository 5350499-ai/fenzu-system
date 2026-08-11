export function allPropertyIds(properties: Array<{ id: string }>) {
  return properties.map((property) => property.id).filter(Boolean);
}

export function isAllPropertyScope(selectedIds: string[], properties: Array<{ id: string }>) {
  const ids = allPropertyIds(properties);
  return ids.length > 0 && selectedIds.length === ids.length && ids.every((id) => selectedIds.includes(id));
}

export function togglePropertyScope(selectedIds: string[], propertyId: string) {
  return selectedIds.includes(propertyId)
    ? selectedIds.filter((id) => id !== propertyId)
    : [...selectedIds, propertyId];
}
