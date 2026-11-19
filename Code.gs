/**
 * V-Guard ceiling fan study: response collector and assigner.
 * Bound to a Google Sheet. Deploy as a Web app (Execute as: Me, Who has access: Anyone).
 *
 * It does two jobs:
 *  1. assign: chooses each respondent's arm (survey / experiment) and version (A-D),
 *     keeping the four versions balanced and the survey's region x age quotas.
 *  2. save:   appends a finished or screened-out response to the right sheet.
 */

// ---------------- Settings ----------------
const QUOTA_PER_CELL = 75;   // survey completes per region x age-group cell (4 cells, about 300 collected)
const VERSION_CAP    = 48;   // experiment completes per version (4 versions, about 190 collected)
const P_EXPERIMENT   = 0.4;  // share sent to the experiment while both arms are open

// ---------------- Sheet layouts ----------------
const BRAND_KEYS = ["trust","quality","different","new","easy_to_find","shortlist","likely_to_buy"];
const HEADERS = {
  Survey_Responses: ["id","age","gender","region","first_time_buyer","last_purchase_channel","heard_vguard","heard_atomberg","how_knew_vguard"]
    .concat(BRAND_KEYS.map(k => "vguard_" + k), BRAND_KEYS.map(k => "atomberg_" + k))
    .concat(["compare_online_myself","go_with_dealer_advice","brand_order","works_in_industry","started_at","completed_at","is_test","rid"]),
  Experiment_Responses: ["id","version","trust_line_shown","new_line_shown","shortlist","likely_to_buy","page_made_vguard_trustworthy","page_made_fan_seem_new",
    "age","gender","region","first_time_buyer","heard_vguard","works_in_industry","seconds_on_page","started_at","completed_at","is_test","rid"],
  Screened_Out: ["rid","screen_reason","arm","version","age","gender","region","works_in_industry","first_time_buyer","heard_vguard","started_at","is_test"]
};
const SHEET_FOR = { survey: "Survey_Responses", experiment: "Experiment_Responses", screened: "Screened_Out" };
const ID_PREFIX = { survey: "R", experiment: "E" };

// ---------------- Web app entry points ----------------
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "bad_json" }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    ensureSheets_();
    if (body.action === "assign") return json(assign_(body));
    if (body.action === "save") return json(save_(body));
    return json({ ok: false, error: "unknown_action" });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  ensureSheets_();
  return json({ ok: true, counts: counts_() });
}

// ---------------- Assignment ----------------
function ageBand_(age) { return Number(age) <= 29 ? "Gen Z" : "Millennial"; }

function counts_() {
  const ss = SpreadsheetApp.getActive();
  const read = name => {
    const sh = ss.getSheetByName(name);
    const n = sh.getLastRow() - 1;
    if (n < 1) return [];
    const h = HEADERS[name];
    return sh.getRange(2, 1, n, h.length).getValues()
      .map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])))
      .filter(r => r.is_test !== true && String(r.is_test).toUpperCase() !== "TRUE");
  };
  const survey = read("Survey_Responses"), exp = read("Experiment_Responses");
  const cells = {};
  ["South India", "Rest of India"].forEach(reg => ["Gen Z", "Millennial"].forEach(band => {
    cells[reg + "|" + band] = survey.filter(r => r.region === reg && ageBand_(r.age) === band).length;
  }));
  const versions = {};
  ["A", "B", "C", "D"].forEach(v => versions[v] = exp.filter(r => r.version === v).length);
  return { cells: cells, versions: versions, survey_total: survey.length, experiment_total: exp.length };
}

function assign_(b) {
  const c = counts_();
  const cellFull = (c.cells[b.region + "|" + ageBand_(b.age)] || 0) >= QUOTA_PER_CELL;
  const open = Object.keys(c.versions).filter(v => c.versions[v] < VERSION_CAP);
  let arm;
  if (cellFull && !open.length) return { ok: true, arm: null, reason: "quota_full" };
  if (cellFull) arm = "experiment";
  else if (!open.length) arm = "survey";
  else arm = Math.random() < P_EXPERIMENT ? "experiment" : "survey";
  let version = null;
  if (arm === "experiment") {
    // Least-filled version; ties broken at random (keeps cells balanced, like Qualtrics "evenly present").
    const min = Math.min.apply(null, open.map(v => c.versions[v]));
    const tied = open.filter(v => c.versions[v] === min);
    version = tied[Math.floor(Math.random() * tied.length)];
  }
  return { ok: true, arm: arm, version: version };
}

// ---------------- Saving ----------------
function save_(b) {
  const sheetName = SHEET_FOR[b.kind];
  if (!sheetName || !b.row || !b.row.rid) return { ok: false, error: "bad_payload" };
  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const h = HEADERS[sheetName];
  // Ignore a repeat of the same response (for example a retried save).
  const ridCol = h.indexOf("rid") + 1;
  if (sh.getLastRow() > 1) {
    const found = sh.getRange(2, ridCol, sh.getLastRow() - 1, 1).createTextFinder(String(b.row.rid)).matchEntireCell(true).findNext();
    if (found) return { ok: true, duplicate: true };
  }
  const row = Object.assign({}, b.row);
  if (ID_PREFIX[b.kind]) {
    const n = sh.getLastRow(); // header + existing rows, so this is the next number
    row.id = (row.is_test ? "TEST-" : "") + ID_PREFIX[b.kind] + String(n).padStart(3, "0");
  }
  sh.appendRow(h.map(k => (row[k] === undefined || row[k] === null) ? "" : row[k]));
  return { ok: true, id: row.id || null };
}

// ---------------- Setup ----------------
function ensureSheets_() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(HEADERS[name]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, HEADERS[name].length).setFontWeight("bold");
    }
  });
}

/** Run once from the editor (select "setup", press Run) to create the sheets and grant permissions. */
function setup() {
  ensureSheets_();
  Logger.log(JSON.stringify(counts_()));
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
