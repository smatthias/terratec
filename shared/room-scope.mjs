export function roomScope(project) {
  const entry=project.rooms?.find(r=>r.id===project.activeRoomId);
  return entry?{roomId:entry.id,roomName:entry.name}:undefined;
}
export function roomScopedTitle(project) {
  const scope=roomScope(project);
  return project.name+(scope?' · '+scope.roomName:'');
}
