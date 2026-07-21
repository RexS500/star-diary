export type PullDirection = "pending" | "horizontal" | "vertical";

export const PULL_DIRECTION_LOCK_PX = 8;
export const PULL_REFRESH_THRESHOLD_PX = 72;
export const PULL_REFRESH_MAX_PX = 112;

export function pullDirection(deltaX: number, deltaY: number): PullDirection {
  const horizontal = Math.abs(deltaX);
  const vertical = Math.abs(deltaY);
  if (Math.max(horizontal, vertical) < PULL_DIRECTION_LOCK_PX) return "pending";
  if (horizontal > vertical) return "horizontal";
  if (deltaY > 0 && vertical > horizontal * 1.15) return "vertical";
  return "pending";
}

export function resistedPullDistance(deltaY: number) {
  return Math.min(PULL_REFRESH_MAX_PX, Math.max(0, deltaY) * 0.58);
}

export function pullReady(distance: number) {
  return distance >= PULL_REFRESH_THRESHOLD_PX;
}
