import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalyticsWorkbook } from "../app/excel-export.ts";

function unzipStored(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer), decoder = new TextDecoder();
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true), extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30, dataStart = nameStart + nameLength + extraLength;
    files.set(decoder.decode(bytes.slice(nameStart, nameStart + nameLength)), decoder.decode(bytes.slice(dataStart, dataStart + size)));
    offset = dataStart + size;
  }
  return files;
}

test("Excel workbook contains five formatted analysis sheets", () => {
  const workbook = buildAnalyticsWorkbook({
    child: "Vanessa",
    from: "2026-07-12",
    to: "2026-07-25",
    filter: "上週＋本週",
    rows: [{ date: "2026-07-12T08:00:00.000Z", type: "star", title: "刷牙", amount: 1 }],
    daily: [{ day: "2026-07-12", add: 1, deduct: 0 }],
    added: 1,
    deducted: 0,
  });
  const files = unzipStored(workbook), workbookXml = files.get("xl/workbook.xml"), styles = files.get("xl/styles.xml");
  assert.ok(workbook.byteLength > 5_000);
  for (const name of ["報表摘要", "星星明細", "每日統計", "每日任務完成紀錄", "兌換統計"]) assert.match(workbookXml, new RegExp(`name="${name}"`));
  assert.equal([...files.keys()].filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).length, 5);
  assert.match(styles, /formatCode="yyyy-mm-dd"/);
  assert.match(styles, /formatCode="yyyy-mm-dd hh:mm"/);
  assert.match(styles, /FFE2F0D9/);
  assert.match(styles, /FFFCE4D6/);
  assert.match(styles, /FFFFF2CC/);
  for (let index = 1; index <= 5; index++) assert.match(files.get(`xl/worksheets/sheet${index}.xml`), /state="frozen"/);
  assert.match(files.get("xl/worksheets/sheet2.xml"), /<autoFilter ref="A1:G2"\/>/);
});
