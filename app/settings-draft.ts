import {
  taskSettingsForChild,
  type DailyTaskDefinition,
  type DailyTaskSettingsMap,
} from "./daily-task-logic.ts";

type ComparableSettingsState = {
  children: Array<{ id: string; name: string; gender: string; avatar: string }>;
  templates: Array<{ id: string; title: string; amount: number; type: string }>;
  rewards: Array<{ id: string; icon: string; name: string; cost: number; image?: string }>;
  rewardIconLibrary: Array<{ id: string; name: string; image: string; hash?: string }>;
  dailyTasks: DailyTaskDefinition[];
  dailyTaskSettings: DailyTaskSettingsMap;
};

const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function normalizeSettingsForComparison(state: ComparableSettingsState, newPasswordDraft = "") {
  return {
    children: state.children.map(child => ({
      id: text(child.id),
      name: text(child.name),
      gender: text(child.gender),
      avatar: text(child.avatar),
    })),
    templates: state.templates.map(template => ({
      id: text(template.id),
      title: text(template.title),
      amount: number(template.amount),
      type: text(template.type),
    })),
    rewards: state.rewards.map(reward => ({
      id: text(reward.id),
      icon: text(reward.icon),
      name: text(reward.name),
      cost: number(reward.cost),
      image: text(reward.image),
    })),
    rewardIconLibrary: state.rewardIconLibrary.map(asset => ({
      id: text(asset.id),
      name: text(asset.name),
      image: text(asset.image),
      hash: text(asset.hash),
    })),
    dailyTasks: state.dailyTasks.map(task => ({
      id: text(task.id),
      childId: text(task.childId),
      title: text(task.title),
      icon: text(task.icon),
      rewardStars: number(task.rewardStars),
      weekdays: [...new Set(task.weekdays.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort((left, right) => left - right),
      enabled: task.enabled !== false,
      sortOrder: number(task.sortOrder),
    })),
    dailyTaskSettings: state.children.map(child => {
      const settings = taskSettingsForChild(state.dailyTaskSettings, child.id);
      return { childId: child.id, goalMode: settings.goalMode, goalValue: settings.goalValue, completionMode: settings.completionMode };
    }),
    newPasswordDraft,
  };
}

export function settingsSignature(state: ComparableSettingsState, newPasswordDraft = "") {
  return JSON.stringify(normalizeSettingsForComparison(state, newPasswordDraft));
}

export function clonePersistedState<T>(state: T): T {
  return structuredClone(state);
}
