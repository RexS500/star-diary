export const WEEKDAY_OPTIONS = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 7, label: "日" },
] as const;

export const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7] as const;
export const WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const WEEKEND = [6, 7] as const;

export type WeekdayPreset = "everyday" | "weekdays" | "weekend" | null;

export function normalizeWeekdays(value: readonly unknown[]): number[] {
  return [...new Set(value.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7))]
    .sort((left, right) => left - right);
}

export function weekdayPreset(value: readonly unknown[]): WeekdayPreset {
  const key = normalizeWeekdays(value).join(",");
  if (key === EVERY_DAY.join(",")) return "everyday";
  if (key === WEEKDAYS.join(",")) return "weekdays";
  if (key === WEEKEND.join(",")) return "weekend";
  return null;
}
