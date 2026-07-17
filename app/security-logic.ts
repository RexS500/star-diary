const PASSWORD_PREFIX = "pbkdf2-sha256";
const PASSWORD_ITERATIONS = 100_000;
const MAX_SUPPORTED_PBKDF2_ITERATIONS = 100_000;
const PASSWORD_MIN_LENGTH = 4;
const encoder = new TextEncoder();

function toHex(bytes: Uint8Array) {
    return Array.from(bytes).map(value => value.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
    if (!/^[0-9a-f]+$/i.test(value) || value.length % 2) return null;
    const bytes = new Uint8Array(value.length / 2);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    return bytes;
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
    return difference === 0;
}

export function normalizeSecurityAnswer(value: string) {
    return value.trim().toLocaleLowerCase("en-US");
}

export function validatePasswordPair(password: string, confirmation: string, currentPassword?: string) {
    if (!password.trim()) return "新密碼不可為空";
    if (!confirmation.trim()) return "請再次輸入新密碼";
    if (password.length < PASSWORD_MIN_LENGTH) return "密碼至少 4 個字元";
    if (password !== confirmation) return "兩次輸入的密碼不一致";
    if (currentPassword !== undefined && password === currentPassword) return "新密碼不可與原始密碼相同";
    return "";
}

export function validateSecuritySetup(questionType: string, questionText: string, answer: string, confirmation: string) {
    if (!questionType) return "請選擇安全提示問題";
    if (questionType === "custom" && !questionText.trim()) return "請填寫自訂安全問題";
    if (!answer.trim()) return "安全問題答案不可為空";
    if (!confirmation.trim()) return "請再次輸入安全問題答案";
    if (normalizeSecurityAnswer(answer) !== normalizeSecurityAnswer(confirmation)) return "兩次輸入的安全問題答案不一致";
    return "";
}

export async function sha256Hex(value: string) {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
    return toHex(new Uint8Array(digest));
}

async function derivePbkdf2(value: string, salt: Uint8Array, iterations: number) {
    const key = await crypto.subtle.importKey("raw", encoder.encode(value), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
    return new Uint8Array(bits);
}

export async function hashSecret(value: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const digest = await derivePbkdf2(value, salt, PASSWORD_ITERATIONS);
    return `${PASSWORD_PREFIX}$${PASSWORD_ITERATIONS}$${toHex(salt)}$${toHex(digest)}`;
}

export async function verifySecret(value: string, storedHash: string) {
    if (!storedHash) return true;
    const parts = storedHash.split("$");
    if (parts.length === 4 && parts[0] === PASSWORD_PREFIX) {
        const iterations = Number(parts[1]), salt = fromHex(parts[2]), expected = fromHex(parts[3]);
        if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > MAX_SUPPORTED_PBKDF2_ITERATIONS || !salt || !expected) return false;
        const actual = await derivePbkdf2(value, salt, iterations);
        return equalBytes(actual, expected);
    }
    return (await sha256Hex(value)) === storedHash;
}

export function securityLockStatus(failedAttempts: number, lockedUntil: string | undefined, now = Date.now()) {
    const until = lockedUntil ? Date.parse(lockedUntil) : Number.NaN;
    return {
        failedAttempts: Number.isFinite(Number(failedAttempts)) ? Math.max(0, Math.floor(Number(failedAttempts))) : 0,
        locked: Number.isFinite(until) && until > now,
        lockedUntil: Number.isFinite(until) && until > now ? new Date(until).toISOString() : undefined,
    };
}

export function createRecoveryToken() {
    return toHex(crypto.getRandomValues(new Uint8Array(32)));
}
