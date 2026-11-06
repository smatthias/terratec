export function validateProject(value) {
  if (!value || value.schemaVersion !== 1 || value.units !== 'm')
    throw new Error('Expected schemaVersion 1 and units m');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 120)
    throw new Error('Project name must contain 1–120 characters');
  if (!value.room || !['width', 'depth', 'height'].every(key =>
    typeof value.room[key] === 'number' && Number.isFinite(value.room[key]) &&
    value.room[key] >= 0.1 && value.room[key] <= 1000))
    throw new Error('Room dimensions must be numbers between 0.1 and 1000 metres');
  return { schemaVersion: 1, units: 'm', name: value.name.trim(), room: {
    width: value.room.width, depth: value.room.depth, height: value.room.height
  }};
}
