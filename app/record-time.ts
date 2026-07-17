import { isCalendarDateKey, taipeiDateKey } from "./daily-task-logic.ts";

const TIME_ZONE = "Asia/Taipei";
const TAIPEI_OFFSET_HOURS = 8;

function timeParts(value: number | Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(value);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
    return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

export function taipeiDateTimeInput(value: number | Date = Date.now()) {
    const parts = timeParts(value);
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${parts.hour}:${parts.minute}`,
    };
}

export function taipeiLocalToIso(date: string, time: string) {
    if (!isCalendarDateKey(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return "";
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const instant = new Date(Date.UTC(year, month - 1, day, hour - TAIPEI_OFFSET_HOURS, minute));
    const roundTrip = taipeiDateTimeInput(instant);
    return roundTrip.date === date && roundTrip.time === time ? instant.toISOString() : "";
}

export function isFutureTaipeiDateTime(date: string, time: string, now = Date.now()) {
    const iso = taipeiLocalToIso(date, time);
    return !iso || Date.parse(iso) > now;
}

export function formatTaipeiOccurrence(value: string | number | Date) {
    const instant = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(instant.getTime())) return "";
    return instant.toLocaleString("zh-TW", {
        timeZone: TIME_ZONE,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

export function occurrenceDateKey(value: string | number | Date) {
    const instant = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
    return Number.isFinite(instant) ? taipeiDateKey(instant) : "";
}
