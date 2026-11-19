export interface InvoiceLine {
  id: string;
  payeeLabel: string;
  payeeId: `0x${string}`;
  payeeAccount?: `0x${string}`;
  reference: string;
  amount: string; // human units, e.g. "125.50"
  source?: string;
}

export interface ParseResult {
  lines: InvoiceLine[];
  warnings: string[];
  format: "csv" | "tsv" | "json" | "email" | "statement" | "empty";
}

function warn(warnings: string[], message: string) {
  if (!warnings.includes(message)) warnings.push(message);
}

/** Stable id derived from a label, so a payee can be looked up on-chain.
 *  Must match keccak256(label) computed in the UI before calling the contract. */
export function makePayeeId(label: string): `0x${string}` {
  return label as `0x${string}`;
}

function parseAmount(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const s = String(raw);
    return /^\d+(\.\d{1,6})?$/.test(s) ? s : null;
  }
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[$€£,\s]/g, "").replace(/[()]/g, "");
  if (!/^\d+(\.\d{1,6})?$/.test(cleaned)) return null;
  return cleaned;
}

const PAYEE_KEYS = ["payee", "vendor", "supplier", "name", "company", "contractor"];
const AMOUNT_KEYS = ["amount", "total", "price", "value", "sum", "due"];
const REF_KEYS = ["reference", "ref", "invoice", "invoiceNumber", "memo", "id"];

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of Object.keys(obj)) {
    if (keys.includes(k.toLowerCase().replace(/[\s_-]/g, ""))) return obj[k];
  }
  return undefined;
}

function makeLine(label: string, amountRaw: unknown, reference: string, index: number): InvoiceLine | null {
  const amount = parseAmount(amountRaw);
  if (!label || !amount || Number(amount) <= 0) return null;
  return {
    id: `line-${index}-${label.replace(/\W/g, "")}`,
    payeeLabel: label,
    payeeId: makePayeeId(label),
    reference,
    amount,
  };
}

/** Deterministic parse of one labelled block, e.g.
 *  Vendor: Studio North
 *  Amount: 0.05
 *  Reference: INV-014 */
function parseLabeledBlock(text: string, warnings: string[]): InvoiceLine[] {
  const out: InvoiceLine[] = [];
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (const block of blocks) {
    const fields: Record<string, string> = {};
    for (const line of block.split(/\r?\n/)) {
      const m = /^([A-Za-z ]{2,20}):\s*(.+)$/.exec(line.trim());
      if (m) fields[m[1].toLowerCase().trim()] = m[2].trim();
    }
    const label = fields.payee ?? fields.vendor ?? fields.supplier ?? fields.company ?? fields.to;
    const amount = fields.amount ?? fields.total ?? fields.value ?? fields.due;
    const ref = fields.reference ?? fields.ref ?? fields.invoice ?? fields.memo ?? "Invoice";
    const line = makeLine(label ?? "", amount, ref, out.length);
    if (line) out.push(line);
  }
  if (out.length === 0 && blocks.length > 0) {
    warn(warnings, "Email/text blocks need Payee, Amount and Reference lines.");
  }
  return out;
}

/** PDFs and plain statements often look like:
 *    Studio North Ltd
 *    Amount: 0.05
 *    Reference: INV-014
 *  The payee is the unlabelled heading right before the amount line. */
function parseStatement(text: string, warnings: string[]): InvoiceLine[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: InvoiceLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[A-Za-z ]{2,20}\s*[:=]/.test(line)) continue;
    if (!/[A-Za-z]/.test(line)) continue;
    const window = lines.slice(i + 1, i + 5);
    const amountLine = window.find((l) => /^(amount|total|value|due)\s*[:=]/i.test(l));
    if (!amountLine) continue;
    const amount = amountLine.replace(/^[^:=]*[:=]\s*/, "");
    const refLine = window.find((l) => /^(reference|ref|invoice|memo)\s*[:=]/i.test(l));
    const reference = refLine ? refLine.replace(/^[^:=]*[:=]\s*/, "") : `Invoice ${out.length + 1}`;
    const parsed = makeLine(line, amount, reference, out.length);
    if (parsed) out.push(parsed);
  }
  if (out.length === 0) warn(warnings, "Could not find payee/amount pairs in that text.");
  return out;
}

/**
 * Deterministic, key-free intake. Accepts:
 *  - JSON array of invoice objects (payee/vendor, amount/total, reference/invoice)
 *  - TSV or CSV with an optional header row
 *  - labelled email/text blocks (Vendor / Amount / Reference)
 * No network, no model. Every field is shown to the operator before staging.
 */
export function parseInvoices(input: string): ParseResult {
  const warnings: string[] = [];
  const text = input.trim();
  if (!text) return { lines: [], warnings: ["Nothing to parse."], format: "empty" };

  // JSON
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const data = JSON.parse(text);
      const rows: unknown[] = Array.isArray(data) ? data : (data.invoices ?? data.lines ?? data.items ?? []);
      if (!Array.isArray(rows)) throw new Error("expected an array");
      const lines: InvoiceLine[] = [];
      rows.forEach((raw, i) => {
        if (!raw || typeof raw !== "object") return;
        const obj = raw as Record<string, unknown>;
        const label = String(pick(obj, PAYEE_KEYS) ?? "").trim();
        const amount = pick(obj, AMOUNT_KEYS);
        const ref = String(pick(obj, REF_KEYS) ?? `Invoice ${i + 1}`).trim();
        const line = makeLine(label, amount, ref, i);
        if (line) lines.push(line);
        else warn(warnings, `JSON item ${i + 1} is missing a payee or a valid amount.`);
      });
      if (lines.length === 0) warn(warnings, "No valid invoice objects found.");
      return { lines, warnings, format: "json" };
    } catch {
      warn(warnings, "Looks like JSON but could not be parsed; trying CSV.");
    }
  }

  // Labelled blocks (email/text)
  const hasLabels = /(^|\n)\s*(vendor|payee|supplier|company|to)\s*:/i.test(text) && /(^|\n)\s*(amount|total|value|due)\s*:/i.test(text);
  if (hasLabels && !text.includes(",")) {
    const lines = parseLabeledBlock(text, warnings);
    if (lines.length) {
      for (const l of lines) l.source = "email";
      return { lines, warnings, format: "email" };
    }
  }

  // Statement / PDF layout: payee heading followed by Amount: and Reference: lines.
  const hasAmountLabels = /(^|\n)\s*(amount|total|value|due)\s*[:=]/i.test(text);
  if (hasAmountLabels && !text.includes(",") && !text.includes("\t")) {
    const lines = parseStatement(text, warnings);
    if (lines.length) {
      for (const l of lines) l.source = "statement";
      return { lines, warnings, format: "statement" };
    }
  }

  // Delimited (CSV/TSV). Detect the delimiter from the first line.
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  let rows = rawLines;
  const first = rawLines[0]?.toLowerCase() ?? "";
  if (/payee|vendor|name|supplier/.test(first) && /amount|total|price|value/.test(first)) rows = rawLines.slice(1);

  const parsed: InvoiceLine[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cols = splitDelimited(rows[i], delimiter);
    if (cols.length < 2) { warn(warnings, `Row ${i + 1} has fewer than two columns; skipped.`); continue; }
    const line = makeLine(cols[0], cols[1], cols.length >= 3 ? cols.slice(2).join(delimiter) : `Invoice ${i + 1}`, i);
    if (line) parsed.push(line);
    else warn(warnings, `Row ${i + 1} is missing a payee or a valid amount; skipped.`);
  }

  if (parsed.length === 0) warn(warnings, "No valid lines found.");
  return { lines: parsed, warnings, format: delimiter === "\t" ? "tsv" : "csv" };
}

/** Split one delimited row, respecting double-quoted fields (so "Ltd, Inc" survives). */
function splitDelimited(row: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (quoted && row[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(cur.trim()); cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function toUnits(human: string, decimals = 6): bigint {
  const [whole, fraction = ""] = human.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function fromUnits(units: bigint, decimals = 6): string {
  const base = 10n ** BigInt(decimals);
  const whole = units / base;
  const fraction = units % base;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}
