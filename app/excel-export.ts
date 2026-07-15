type WorkbookRow = { date: string; type: "star" | "deduct"; title: string; amount: number };
type DailyRow = { day: string; add: number; deduct: number };
type Cell = { value: string | number; style?: 1 | 2 };

const encoder = new TextEncoder();
const xml = (value: string | number) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const bytes = (value: number, size: number) => { const result = new Uint8Array(size); for (let i = 0; i < size; i++) result[i] = value >>> (i * 8) & 255; return result; };
const merge = (parts: Uint8Array[]) => { const total = parts.reduce((sum, part) => sum + part.length, 0), result = new Uint8Array(total); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; };
const crcTable = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; table[n] = c >>> 0; } return table; })();
const crc32 = (data: Uint8Array) => { let crc = 0xffffffff; for (const value of data) crc = crcTable[(crc ^ value) & 255] ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; };

function zip(files: Record<string, string>) {
    const localParts: Uint8Array[] = [], centralParts: Uint8Array[] = []; let offset = 0;
    for (const [name, content] of Object.entries(files)) {
        const nameData = encoder.encode(name), data = encoder.encode(content), checksum = crc32(data);
        const local = merge([bytes(0x04034b50, 4), bytes(20, 2), bytes(0, 2), bytes(0, 2), bytes(0, 2), bytes(0, 2), bytes(checksum, 4), bytes(data.length, 4), bytes(data.length, 4), bytes(nameData.length, 2), bytes(0, 2), nameData, data]);
        const central = merge([bytes(0x02014b50, 4), bytes(20, 2), bytes(20, 2), bytes(0, 2), bytes(0, 2), bytes(0, 2), bytes(0, 2), bytes(checksum, 4), bytes(data.length, 4), bytes(data.length, 4), bytes(nameData.length, 2), bytes(0, 2), bytes(0, 2), bytes(0, 2), bytes(0, 2), bytes(0, 4), bytes(offset, 4), nameData]);
        localParts.push(local); centralParts.push(central); offset += local.length;
    }
    const central = merge(centralParts), end = merge([bytes(0x06054b50, 4), bytes(0, 2), bytes(0, 2), bytes(centralParts.length, 2), bytes(centralParts.length, 2), bytes(central.length, 4), bytes(offset, 4), bytes(0, 2)]);
    return merge([...localParts, central, end]);
}

const columnName = (index: number) => { let name = ""; for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name; return name; };
const text = (value: string | number, style?: 1 | 2): Cell => ({ value, style });
function worksheet(rows: Cell[][], widths: number[]) {
    const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => { const ref = `${columnName(columnIndex)}${rowIndex + 1}`, style = cell.style ? ` s="${cell.style}"` : ""; return typeof cell.value === "number" ? `<c r="${ref}"${style} t="n"><v>${cell.value}</v></c>` : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(cell.value)}</t></is></c>`; }).join("")}</row>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

export function buildAnalyticsWorkbook(input: { child: string; from: string; to: string; filter: string; rows: WorkbookRow[]; daily: DailyRow[]; added: number; deducted: number }): ArrayBuffer {
    const detail: Cell[][] = [
        [text("星星分析報表", 1)], [text("孩子"), text(input.child)], [text("日期區間"), text(`${input.from} 至 ${input.to}`)], [text("篩選"), text(input.filter)],
        [text("加星合計"), text(input.added)], [text("扣星合計"), text(input.deducted)], [text("淨星星"), text(input.added - input.deducted)], [],
        [text("日期時間", 2), text("類型", 2), text("內容", 2), text("星星數", 2)],
        ...input.rows.map(row => [text(row.date), text(row.type === "star" ? "加星" : "扣星"), text(row.title), text(row.amount)]),
    ];
    const daily: Cell[][] = [[text("日期", 2), text("加星", 2), text("扣星", 2), text("淨星星", 2)], ...input.daily.map(row => [text(row.day), text(row.add), text(row.deduct), text(row.add - row.deduct)])];
    const files = {
        "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
        "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="星星分析" sheetId="1" r:id="rId1"/><sheet name="每日統計" sheetId="2" r:id="rId2"/></sheets></workbook>`,
        "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
        "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6F2E8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
        "xl/worksheets/sheet1.xml": worksheet(detail, [22, 12, 36, 12]),
        "xl/worksheets/sheet2.xml": worksheet(daily, [16, 12, 12, 12]),
    };
    const result = zip(files);
    return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
}
