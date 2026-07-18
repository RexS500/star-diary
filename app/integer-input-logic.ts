export function validEditableInteger(value: string, min = 1, max?: number) {
    return /^\d+$/.test(value) && Number(value) >= min && (max === undefined || Number(value) <= max);
}

export function normalizeEditableInteger(value: string, min = 1, max?: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return min;
    return Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, Math.floor(parsed)));
}

export function acceptsEditableIntegerDraft(value: string) {
    return /^-?\d*(?:\.\d*)?$/.test(value);
}
