export type QuickTemplateType = "star" | "deduct" | "special";

export type OrderableQuickTemplate = {
  id: string;
  type: QuickTemplateType;
  sortOrder?: number;
};

const numericOrder = (value: unknown, fallback: number) =>
  Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;

export function orderedTemplatesByType<T extends OrderableQuickTemplate>(templates: T[], type: QuickTemplateType): T[] {
  return templates
    .map((template, index) => ({ template, index }))
    .filter(item => item.template.type === type)
    .sort((left, right) => numericOrder(left.template.sortOrder, left.index) - numericOrder(right.template.sortOrder, right.index) || left.index - right.index)
    .map(item => item.template);
}

export function normalizeTemplateSortOrders<T extends OrderableQuickTemplate>(templates: T[]): T[] {
  const orderById = new Map<string, number>();
  for (const type of ["star", "deduct", "special"] as const) {
    orderedTemplatesByType(templates, type).forEach((template, index) => orderById.set(template.id, index));
  }
  return templates.map(template => ({ ...template, sortOrder: orderById.get(template.id) ?? 0 }));
}

export function moveTemplateWithinType<T extends OrderableQuickTemplate>(templates: T[], id: string, direction: -1 | 1): T[] {
  const normalized = normalizeTemplateSortOrders(templates), current = normalized.find(template => template.id === id);
  if (!current) return templates;
  const group = orderedTemplatesByType(normalized, current.type), index = group.findIndex(template => template.id === id), target = index + direction;
  if (index < 0 || target < 0 || target >= group.length) return templates;
  const targetId = group[target].id;
  return normalized.map(template => template.id === id ? { ...template, sortOrder: target } : template.id === targetId ? { ...template, sortOrder: index } : template);
}

export function changeTemplateType<T extends OrderableQuickTemplate>(templates: T[], id: string, type: QuickTemplateType): T[] {
  const normalized = normalizeTemplateSortOrders(templates), targetOrder = orderedTemplatesByType(normalized, type).length;
  const changed = normalized.map(template => template.id === id ? { ...template, type, sortOrder: targetOrder } : template);
  return normalizeTemplateSortOrders(changed);
}
