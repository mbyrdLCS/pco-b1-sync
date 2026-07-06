// Import PCO form DEFINITIONS into B1's forms module so the church starts
// with all their forms ready to use (submission history stays in PCO).
//
//   node scripts/import-forms.mjs           # DRY RUN — prints the plan
//   node scripts/import-forms.mjs --apply   # create forms + questions in B1
//
// Field type mapping (imperfect ones are reported):
//   string -> Textbox        text     -> Text Area      date    -> Date
//   number -> Decimal        boolean  -> Yes/No         phone_number -> Phone Number
//   dropdown -> Multiple Choice (single-select)   checkboxes -> Checkbox (multi-select)
//   address -> expanded into four Textbox questions (Street/City/State/Zip)
//   heading/file/workflow_checkbox -> skipped (no B1 equivalent), listed per form
//
// Idempotent: forms matched by name; existing forms are left untouched.

import fs from "fs";

const envText = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}
const PCO_BASE = env.PCO_API_BASE || "https://api.planningcenteronline.com";
const B1_BASE = env.B1_API_BASE || "https://api.churchapps.org";
const PCO_AUTH = "Basic " + Buffer.from(`${env.PCO_APP_ID}:${env.PCO_SECRET}`).toString("base64");
const APPLY = process.argv.includes("--apply");

async function pco(path) {
  const res = await fetch(PCO_BASE + path, { headers: { Authorization: PCO_AUTH } });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, (Number(res.headers.get("retry-after")) || 20) * 1000));
    return pco(path);
  }
  if (!res.ok) throw new Error(`PCO ${path} -> ${res.status}`);
  return res.json();
}
async function pcoAll(path) {
  const out = [], inc = [];
  let url = path;
  while (url) {
    const page = await pco(url);
    out.push(...page.data);
    inc.push(...(page.included ?? []));
    url = page.links?.next ? page.links.next.replace(PCO_BASE, "") : null;
  }
  return { data: out, included: inc };
}
async function b1(path, init = {}) {
  const res = await fetch(B1_BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${env.B1_API_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`B1 ${init.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 150)}`);
  return text ? JSON.parse(text) : null;
}

const TYPE_MAP = {
  string: "Textbox",
  text: "Text Area",
  date: "Date",
  number: "Decimal",
  boolean: "Yes/No",
  phone_number: "Phone Number",
  dropdown: "Multiple Choice",
  checkboxes: "Checkbox", // B1 Checkbox = one checkbox per choice (true multi-select)
};
const SKIP_TYPES = new Set(["heading", "file", "workflow_checkbox"]);

console.log(APPLY ? "\nAPPLY MODE — creating in B1\n" : "\nDRY RUN — no changes will be made (use --apply to create)\n");

const forms = (await pcoAll("/people/v2/forms?per_page=100")).data.filter((f) => !f.attributes.archived_at);
const plan = [];
const emptySkipped = [];
for (const f of forms) {
  const { data: fields, included } = await pcoAll(`/people/v2/forms/${f.id}/fields?per_page=100&include=options`);
  const optsByField = {};
  for (const o of included) {
    if (o.type !== "FormFieldOption") continue;
    const ff = o.relationships?.form_field?.data?.id;
    if (ff) (optsByField[ff] ??= []).push(o.attributes.label);
  }
  const questions = [];
  const skipped = [];
  for (const fld of fields.sort((a, b) => (a.attributes.sequence ?? 0) - (b.attributes.sequence ?? 0))) {
    const a = fld.attributes;
    const pcoType = a.field_type;
    if (SKIP_TYPES.has(pcoType)) { skipped.push(`${a.label} (${pcoType})`); continue; }
    if (pcoType === "address") {
      // B1 has no structured address field — expand into four Textboxes so
      // the form still collects the same information
      const base = (a.label ?? "Address").slice(0, 200);
      for (const part of ["Street Address", "City", "State", "Zip"]) {
        questions.push({ title: `${base} — ${part}`.slice(0, 255), fieldType: "Textbox", required: a.required === true });
      }
      continue;
    }
    const fieldType = TYPE_MAP[pcoType] ?? "Textbox";
    const choices = (optsByField[fld.id] ?? []).map((label) => ({ value: label, text: label }));
    questions.push({
      title: (a.label ?? "").slice(0, 255) || "Question",
      description: (a.description ?? "") || undefined,
      fieldType,
      required: a.required === true,
      choices: choices.length ? choices : undefined,
    });
  }
  if (questions.length === 0) { emptySkipped.push(f.attributes.name.trim()); continue; }
  plan.push({ name: f.attributes.name.trim(), active: f.attributes.active !== false, questions, skipped });
}

let totalQ = 0, totalSkipped = 0;
for (const p of plan) {
  totalQ += p.questions.length;
  totalSkipped += p.skipped.length;
  const notes = [];
  if (p.skipped.length) notes.push(`${p.skipped.length} field(s) skipped`);
  console.log(`  - ${p.name}  (${p.questions.length} questions${notes.length ? "; " + notes.join("; ") : ""})`);
  for (const s of p.skipped) console.log(`      ⤷ skipped: ${s}`);
}
if (emptySkipped.length) console.log(`  (skipping ${emptySkipped.length} empty/abandoned forms: ${[...new Set(emptySkipped)].slice(0,5).join(", ")}…)`);
console.log(`\nTotals: ${plan.length} forms, ${totalQ} questions (${totalSkipped} fields skipped)`);
if (!APPLY) process.exit(0);

const existing = new Map((((await b1("/membership/forms")) ?? [])).map((f) => [f.name?.trim().toLowerCase(), f]));
let created = 0, skippedForms = 0;
for (const p of plan) {
  if (existing.has(p.name.toLowerCase())) { skippedForms++; continue; }
  const form = (await b1("/membership/forms", {
    method: "POST",
    body: JSON.stringify([{ name: p.name, contentType: "form", restricted: false, archived: !p.active }]),
  }))[0];
  const payload = p.questions.map((q, i) => ({
    formId: form.id,
    title: q.title,
    description: q.description,
    fieldType: q.fieldType,
    required: q.required,
    choices: q.choices,
    sort: String(i + 1),
  }));
  for (let i = 0; i < payload.length; i += 50) {
    await b1("/membership/questions", { method: "POST", body: JSON.stringify(payload.slice(i, i + 50)) });
  }
  existing.set(p.name.toLowerCase(), form);
  created++;
}
console.log(`\n✅ ${created} forms created with their questions, ${skippedForms} already existed (untouched)`);
