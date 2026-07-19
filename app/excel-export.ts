import type { AnalyticsReport } from "./analytics-report.ts";

type LegacyWorkbookInput = {
    child: string;
    from: string;
    to: string;
    filter: string;
    rows: Array<{ date: string; type: "star" | "deduct"; title: string; amount: number }>;
    daily: Array<{ day: string; add: number; deduct: number }>;
    added: number;
    deducted: number;
};

type CellKind = "text" | "number" | "date" | "datetime" | "percent";
type Cell = { value: string | number; style?: number; kind?: CellKind };
type SheetDefinition = { name: string; rows: Cell[][]; filterRow?: number; widths?: number[] };

const STYLE = {
    plain: 0,
    title: 1,
    header: 2,
    label: 3,
    summaryNumber: 4,
    summaryPercent: 5,
    bodyText: 6,
    bodyNumber: 7,
    bodyDate: 8,
    bodyDateTime: 9,
    bodyPercent: 10,
    addText: 11,
    addNumber: 12,
    addDate: 13,
    addDateTime: 14,
    deductText: 15,
    deductNumber: 16,
    deductDate: 17,
    deductDateTime: 18,
    specialText: 19,
    specialNumber: 20,
    specialDate: 21,
    specialDateTime: 22,
} as const;

const encoder = new TextEncoder();
const xml = (value: string | number) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const bytes = (value: number, size: number) => { const result = new Uint8Array(size); for (let index = 0; index < size; index++) result[index] = value >>> (index * 8) & 255; return result; };
const merge = (parts: Uint8Array[]) => { const total = parts.reduce((sum, part) => sum + part.length, 0), result = new Uint8Array(total); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; };
const crcTable = (() => { const table = new Uint32Array(256); for (let number = 0; number < 256; number++) { let current = number; for (let bit = 0; bit < 8; bit++) current = current & 1 ? 0xedb88320 ^ current >>> 1 : current >>> 1; table[number] = current >>> 0; } return table; })();
const crc32 = (data: Uint8Array) => { let crc = 0xffffffff; for (const value of data) crc = crcTable[(crc ^ value) & 255] ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; };

function zip(files: Record<string, string>) {
    const localParts: Uint8Array[] = [], centralParts: Uint8Array[] = [];
    let offset = 0;
    for (const [name, content] of Object.entries(files)) {
        const nameData = encoder.encode(name), data = encoder.encode(content), checksum = crc32(data);
        const local = merge([bytes(0x04034b50, 4), bytes(20, 2), bytes(0, 2), bytes(0, 2), bytes(0, 2), bytes(0x0021, 2), bytes(checksum, 4), bytes(data.length, 4), bytes(data.length, 4), bytes(nameData.length, 2), bytes(0, 2), nameData, data]);
        const central = merge([bytes(0x02014b50, 4), bytes(20, 2), bytes(20, 2), bytes(0, 2), bytes(0, 2), bytes(0, 2), bytes(0x0021, 2), bytes(checksum, 4), bytes(data.length, 4), bytes(data.length, 4), bytes(nameData.length, 2), bytes(0, 2), bytes(0, 2), bytes(0, 2), bytes(0, 2), bytes(0, 4), bytes(offset, 4), nameData]);
        localParts.push(local);
        centralParts.push(central);
        offset += local.length;
    }
    const central = merge(centralParts);
    return merge([...localParts, central, merge([bytes(0x06054b50, 4), bytes(0, 2), bytes(0, 2), bytes(centralParts.length, 2), bytes(centralParts.length, 2), bytes(central.length, 4), bytes(offset, 4), bytes(0, 2)])]);
}

const columnName = (index: number) => { let name = ""; for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name; return name; };
const cell = (value: string | number, style: number = STYLE.bodyText, kind: CellKind = typeof value === "number" ? "number" : "text"): Cell => ({ value, style, kind });

function dateParts(value: string) {
    const dateKey = value.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
    if (dateKey) return { year: +dateKey.slice(0, 4), month: +dateKey.slice(5, 7), day: +dateKey.slice(8, 10), hour: 0, minute: 0, second: 0 };
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return null;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(timestamp);
    const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value || 0);
    return { year: pick("year"), month: pick("month"), day: pick("day"), hour: pick("hour"), minute: pick("minute"), second: pick("second") };
}

function excelDateSerial(value: string) {
    const parts = dateParts(value);
    if (!parts) return null;
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) / 86_400_000 + 25_569;
}

function widthOf(value: string | number) {
    const text = String(value);
    let width = 0;
    for (const character of text) width += character.charCodeAt(0) > 255 ? 2 : 1;
    return width;
}

function autoWidths(rows: Cell[][]) {
    const count = Math.max(1, ...rows.map(row => row.length));
    return Array.from({ length: count }, (_, column) => Math.min(42, Math.max(11, ...rows.map(row => widthOf(row[column]?.value ?? "") + 2))));
}

function worksheet(sheet: SheetDefinition) {
    const widths = sheet.widths || autoWidths(sheet.rows), lastColumn = columnName(Math.max(0, widths.length - 1));
    const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    const body = sheet.rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((item, columnIndex) => {
        const ref = `${columnName(columnIndex)}${rowIndex + 1}`, style = ` s="${item.style ?? STYLE.plain}"`;
        if (item.kind === "date" || item.kind === "datetime") {
            const serial = excelDateSerial(String(item.value));
            return serial === null ? `<c r="${ref}"${style} t="inlineStr"><is><t>${xml(item.value)}</t></is></c>` : `<c r="${ref}"${style} t="n"><v>${serial}</v></c>`;
        }
        return typeof item.value === "number" ? `<c r="${ref}"${style} t="n"><v>${item.value}</v></c>` : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(item.value)}</t></is></c>`;
    }).join("")}</row>`).join("");
    const filter = sheet.filterRow ? `<autoFilter ref="A${sheet.filterRow}:${lastColumn}${Math.max(sheet.filterRow, sheet.rows.length)}"/>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData>${filter}</worksheet>`;
}

function stylesXml() {
    const thinBorder = `<border><left style="thin"><color rgb="FFD7E1EC"/></left><right style="thin"><color rgb="FFD7E1EC"/></right><top style="thin"><color rgb="FFD7E1EC"/></top><bottom style="thin"><color rgb="FFD7E1EC"/></bottom><diagonal/></border>`;
    const xf = (fontId: number, fillId: number, borderId: number, numFmtId = 0, alignment = "") => `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1"${numFmtId ? ` applyNumberFormat="1"` : ""}${alignment ? ` applyAlignment="1"><alignment ${alignment}/></xf>` : "/>"}`;
    const styles = [
        xf(0, 0, 0),
        xf(2, 2, 1, 0, `horizontal="left" vertical="center"`),
        xf(1, 2, 1, 0, `horizontal="center" vertical="center" wrapText="1"`),
        xf(1, 3, 1, 0, `vertical="center"`),
        xf(1, 0, 1, 0, `horizontal="right" vertical="center"`),
        xf(1, 0, 1, 166, `horizontal="right" vertical="center"`),
        xf(0, 0, 1, 0, `vertical="center" wrapText="1"`),
        xf(0, 0, 1, 0, `horizontal="right" vertical="center"`),
        xf(0, 0, 1, 164, `horizontal="center" vertical="center"`),
        xf(0, 0, 1, 165, `horizontal="center" vertical="center"`),
        xf(0, 0, 1, 166, `horizontal="right" vertical="center"`),
        xf(0, 4, 1, 0, `vertical="center" wrapText="1"`),
        xf(0, 4, 1, 0, `horizontal="right" vertical="center"`),
        xf(0, 4, 1, 164, `horizontal="center" vertical="center"`),
        xf(0, 4, 1, 165, `horizontal="center" vertical="center"`),
        xf(0, 5, 1, 0, `vertical="center" wrapText="1"`),
        xf(0, 5, 1, 0, `horizontal="right" vertical="center"`),
        xf(0, 5, 1, 164, `horizontal="center" vertical="center"`),
        xf(0, 5, 1, 165, `horizontal="center" vertical="center"`),
        xf(0, 6, 1, 0, `vertical="center" wrapText="1"`),
        xf(0, 6, 1, 0, `horizontal="right" vertical="center"`),
        xf(0, 6, 1, 164, `horizontal="center" vertical="center"`),
        xf(0, 6, 1, 165, `horizontal="center" vertical="center"`),
    ].join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/><numFmt numFmtId="166" formatCode="0%"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Aptos"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="14"/><name val="Aptos Display"/></font></fonts><fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${thinBorder}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="23">${styles}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function normalizedReport(input: AnalyticsReport | LegacyWorkbookInput): AnalyticsReport {
    if ("summary" in input) return input;
    const days = input.daily.map(row => ({ date: row.day, added: row.add, deducted: row.deduct, special: 0, net: row.add - row.deduct, scheduledTasks: 0, completedTasks: 0, incompleteTasks: 0, skippedTasks: 0, completionRate: null }));
    return {
        childName: input.child,
        range: { preset: "custom", label: input.filter, start: input.from, end: input.to, days: input.daily.map(row => row.day) },
        exportedAt: new Date().toISOString(),
        starAnalysis: { period: { key: "custom", label: input.filter, start: input.from, end: input.to, days: input.daily.map(row => row.day) }, days: [], starTotal: input.added, deductTotal: input.deducted, net: input.added - input.deducted, starItems: [], deductItems: [], recordCount: input.rows.length },
        summary: { added: input.added, deducted: input.deducted, special: 0, net: input.added - input.deducted, redemptionCost: 0, taskCompletionRate: null, streak: 0, completedTasks: 0, incompleteTasks: 0, skippedTasks: 0 },
        starDetails: input.rows.map(row => ({ occurredAt: row.date, createdAt: row.date, type: row.type === "star" ? "加星" : "扣星", source: "手動補登", content: row.title, amount: row.amount, note: "" })),
        dailyStatistics: days,
        taskRows: [],
        redemptionRows: [],
        redemptionSummary: { count: 0, quantity: 0, totalCost: 0, mostFrequentReward: "無", highestCostReward: "無" },
    };
}

function reportSheets(report: AnalyticsReport): SheetDefinition[] {
    const summaryRows: Cell[][] = [
        [cell("報表項目", STYLE.header), cell("內容", STYLE.header)],
        [cell("孩子姓名", STYLE.label), cell(report.childName)],
        [cell("日期區間", STYLE.label), cell(`${report.range.start} 至 ${report.range.end}`)],
        [cell("匯出時間", STYLE.label), cell(report.exportedAt, STYLE.bodyDateTime, "datetime")],
        [cell("加星總數", STYLE.label), cell(report.summary.added, STYLE.summaryNumber)],
        [cell("扣星總數（行為扣星）", STYLE.label), cell(report.summary.deducted, STYLE.summaryNumber)],
        [cell("特殊獎勵總數", STYLE.label), cell(report.summary.special, STYLE.summaryNumber)],
        [cell("淨星星", STYLE.label), cell(report.summary.net, STYLE.summaryNumber)],
        [cell("已兌換消耗星星", STYLE.label), cell(report.summary.redemptionCost, STYLE.summaryNumber)],
        [cell("每日任務完成率", STYLE.label), report.summary.taskCompletionRate === null ? cell("—") : cell(report.summary.taskCompletionRate / 100, STYLE.summaryPercent, "percent")],
        [cell("連續達標天數", STYLE.label), cell(report.summary.streak, STYLE.summaryNumber)],
        [cell("每日任務完成數", STYLE.label), cell(report.summary.completedTasks, STYLE.summaryNumber)],
        [cell("每日任務未完成數", STYLE.label), cell(report.summary.incompleteTasks, STYLE.summaryNumber)],
        [cell("每日任務不適用數", STYLE.label), cell(report.summary.skippedTasks, STYLE.summaryNumber)],
    ];

    const detailRows: Cell[][] = [["發生日期", "建立時間", "類型", "來源", "內容", "星星數", "備註"].map(value => cell(value, STYLE.header))];
    for (const row of report.starDetails) {
        const palette = row.type === "扣星" ? { text: STYLE.deductText, number: STYLE.deductNumber, date: STYLE.deductDate, dateTime: STYLE.deductDateTime } : row.type === "特殊獎勵" ? { text: STYLE.specialText, number: STYLE.specialNumber, date: STYLE.specialDate, dateTime: STYLE.specialDateTime } : { text: STYLE.addText, number: STYLE.addNumber, date: STYLE.addDate, dateTime: STYLE.addDateTime };
        detailRows.push([
            cell(row.occurredAt.slice(0, 10), palette.date, "date"),
            cell(row.createdAt, palette.dateTime, "datetime"),
            cell(row.type, palette.text),
            cell(row.source, palette.text),
            cell(row.content, palette.text),
            cell(row.amount, palette.number),
            cell(row.note, palette.text),
        ]);
    }

    const dailyRows: Cell[][] = [["日期", "當日加星", "當日扣星", "特殊獎勵", "淨星星", "排定任務數", "完成任務數", "未完成任務數", "今日不適用數", "完成率(%)"].map(value => cell(value, STYLE.header))];
    dailyRows.push(...report.dailyStatistics.map(row => [
        cell(row.date, STYLE.bodyDate, "date"), cell(row.added, STYLE.bodyNumber), cell(row.deducted, STYLE.bodyNumber), cell(row.special, STYLE.bodyNumber), cell(row.net, STYLE.bodyNumber), cell(row.scheduledTasks, STYLE.bodyNumber), cell(row.completedTasks, STYLE.bodyNumber), cell(row.incompleteTasks, STYLE.bodyNumber), cell(row.skippedTasks, STYLE.bodyNumber), row.completionRate === null ? cell("—") : cell(row.completionRate / 100, STYLE.bodyPercent, "percent"),
    ]));

    const taskRows: Cell[][] = [["日期", "任務名稱", "狀態", "完成時間", "獎勵星星", "適用孩子"].map(value => cell(value, STYLE.header))];
    taskRows.push(...report.taskRows.map(row => [cell(row.date, STYLE.bodyDate, "date"), cell(row.title), cell(row.status), row.completedAt ? cell(row.completedAt, STYLE.bodyDateTime, "datetime") : cell(""), cell(row.rewardStars, STYLE.bodyNumber), cell(row.applicableChild)]));

    const redemptionRows: Cell[][] = [
        [cell("兌換統計摘要", STYLE.title), cell("數值", STYLE.header)],
        [cell("兌換總次數", STYLE.label), cell(report.redemptionSummary.count, STYLE.summaryNumber)],
        [cell("兌換總數量", STYLE.label), cell(report.redemptionSummary.quantity, STYLE.summaryNumber)],
        [cell("總消耗星星", STYLE.label), cell(report.redemptionSummary.totalCost, STYLE.summaryNumber)],
        [cell("最常兌換商品", STYLE.label), cell(report.redemptionSummary.mostFrequentReward)],
        [cell("消耗最多星星商品", STYLE.label), cell(report.redemptionSummary.highestCostReward)],
        [],
        ["兌換日期", "獎品名稱", "數量", "單價星星", "消耗星星", "狀態"].map(value => cell(value, STYLE.header)),
        ...report.redemptionRows.map(row => [cell(row.redeemedAt, STYLE.bodyDateTime, "datetime"), cell(row.rewardName), cell(row.quantity, STYLE.bodyNumber), cell(row.unitCost, STYLE.bodyNumber), cell(row.totalCost, STYLE.bodyNumber), cell(row.status)]),
    ];

    return [
        { name: "報表摘要", rows: summaryRows, filterRow: 1 },
        { name: "星星明細", rows: detailRows, filterRow: 1 },
        { name: "每日統計", rows: dailyRows, filterRow: 1 },
        { name: "每日任務完成紀錄", rows: taskRows, filterRow: 1 },
        { name: "兌換統計", rows: redemptionRows, filterRow: 8 },
    ];
}

export function buildAnalyticsWorkbook(input: AnalyticsReport | LegacyWorkbookInput): ArrayBuffer {
    const sheets = reportSheets(normalizedReport(input));
    const overrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
    const workbookSheets = sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
    const relationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
    const files: Record<string, string> = {
        "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
        "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`,
        "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
        "xl/styles.xml": stylesXml(),
    };
    sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = worksheet(sheet); });
    const result = zip(files);
    return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
}
