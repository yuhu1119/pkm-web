/** 本地上传接受的后缀。 */
export const LOCAL_DOC_ACCEPT =
  ".md,.markdown,.txt,.html,.htm,.docx,.pdf,.xlsx,.xlsm,.xls,.csv,.json,.pptx";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 80;
const MAX_SHEET_ROWS = 3000;

/**
 * 把 HTML 收成可见文本。
 * @param {string} html
 */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body?.innerText || html.replace(/<[^>]+>/g, " ")).replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 去掉 PDF/Office 抽出来的控制字符，避免网关 JSON 反序列化失败。
 * @param {string} text
 */
function sanitizeExtractText(text: string): string {
  return Array.from(String(text || ""))
    .filter((ch) => {
      const code = ch.codePointAt(0) || 0;
      if (code === 9 || code === 10 || code === 13) return true;
      if (code < 32) return false;
      if (code >= 0x7f && code <= 0x9f) return false;
      if (code >= 0xd800 && code <= 0xdfff) return false;
      return true;
    })
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 解析 Word（.docx）。
 * @param {ArrayBuffer} buf
 */
async function readDocx(buf: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return (result.value || "").trim();
}

let pdfWorkerSrc = "";

/**
 * 按 PDF 文本项的纵坐标还原行，避免表格被拼成一句导致「产品是什么」对不上字段。
 * @param {unknown[]} items
 */
function pdfItemsToText(items: unknown[]): string {
  type PdfItem = { str?: string; transform?: number[]; width?: number };
  const rows: { y: number; parts: { x: number; str: string; width: number }[] }[] = [];
  items.forEach((raw) => {
    const item = raw as PdfItem;
    const str = String(item.str || "");
    if (!str) return;
    const transform = item.transform || [];
    const x = Number(transform[4] || 0);
    const y = Math.round(Number(transform[5] || 0) * 2) / 2;
    const width = Number(item.width || str.length * 6);
    const last = rows[rows.length - 1];
    if (!last || Math.abs(last.y - y) > 3.5) {
      rows.push({ y, parts: [{ x, str, width }] });
      return;
    }
    last.parts.push({ x, str, width });
  });
  return rows
    .map((row) =>
      row.parts
        .sort((a, b) => a.x - b.x)
        .map((part, index, list) => {
          const prev = list[index - 1];
          if (!prev) return part.str;
          const gap = part.x - (prev.x + prev.width);
          return gap > 6 ? ` ${part.str}` : part.str;
        })
        .join("")
        .replace(/[ \t]+/g, " ")
        .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "$1")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

/**
 * 解析 PDF。Worker 打成 Blob，避免线上静态托管拦 .mjs。
 * @param {ArrayBuffer} buf
 */
async function readPdf(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const { default: workerCode } = await import("pdfjs-dist/build/pdf.worker.min.mjs?raw");
    pdfWorkerSrc = URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" }));
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  }
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useWasm: false,
    useWorkerFetch: false,
  }).promise;
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const parts: string[] = [];
  for (let i = 1; i <= pages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = pdfItemsToText(content.items);
    if (line) parts.push(line);
  }
  if (pdf.numPages > MAX_PDF_PAGES) {
    parts.push(`…(仅解析前 ${MAX_PDF_PAGES} 页)`);
  }
  return parts.join("\n");
}

/**
 * 解析 Excel / CSV。
 * @param {ArrayBuffer} buf
 * @param {string} name
 */
async function readSpreadsheet(buf: ArrayBuffer, name: string): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    parts.push(`# ${sheetName}`);
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    rows.slice(0, MAX_SHEET_ROWS).forEach((row) => {
      const cells = (row || []).map((cell) => String(cell ?? "").trim()).filter(Boolean);
      if (cells.length) parts.push(cells.join(" | "));
    });
    if (rows.length > MAX_SHEET_ROWS) {
      parts.push(`…(工作表 ${sheetName} 仅解析前 ${MAX_SHEET_ROWS} 行)`);
    }
  });
  if (!parts.length && name.toLowerCase().endsWith(".csv")) {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  }
  return parts.join("\n");
}

/**
 * 解析 PPTX 幻灯片文字。
 * @param {ArrayBuffer} buf
 */
async function readPptx(buf: ArrayBuffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files)
    .filter((path) => /ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const parts: string[] = [];
  for (const path of slides) {
    const xml = await zip.files[path].async("string");
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1]).filter(Boolean);
    if (texts.length) parts.push(texts.join(""));
  }
  return parts.join("\n");
}

/**
 * 在浏览器把本地文档抽成纯文本，再交给 Worker。云上 Lua 无法解析 Word/PDF/Excel。
 * @param {File} file
 */
export async function readLocalDocument(file: File): Promise<{ title: string; content: string }> {
  const title = file.name || "upload.txt";
  const lower = title.toLowerCase();
  if (file.size > MAX_BYTES) {
    throw new Error("文件超过 25MB，请拆分后再上传");
  }
  if (/\.doc$/.test(lower) && !lower.endsWith(".docx")) {
    throw new Error("旧版 .doc 请另存为 .docx 后再上传");
  }
  const buf = await file.arrayBuffer();
  let content = "";
  if (/\.(md|markdown|txt|csv|json)$/i.test(lower)) {
    content = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } else if (/\.(html|htm)$/i.test(lower)) {
    content = htmlToText(new TextDecoder("utf-8", { fatal: false }).decode(buf));
  } else if (lower.endsWith(".docx")) {
    content = await readDocx(buf);
  } else if (lower.endsWith(".pdf")) {
    content = await readPdf(buf);
  } else if (/\.(xlsx|xlsm|xls)$/i.test(lower)) {
    content = await readSpreadsheet(buf, title);
  } else if (lower.endsWith(".pptx")) {
    content = await readPptx(buf);
  } else {
    content = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  }
  content = sanitizeExtractText(content.replace(/\u0000/g, ""));
  if (!content) {
    throw new Error("没有读到正文。扫描件 PDF 或纯图片页需要先转成可选中文字。");
  }
  return { title, content };
}
