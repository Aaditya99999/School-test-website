/**
 * Radha Krishna Memorial Education Centre — admission enquiries sheet
 * -------------------------------------------------------------------
 * Paste this whole file into the Google Sheet's Apps Script editor
 * (Extensions -> Apps Script), set SECRET below, then Deploy as a web
 * app. Full steps are in HOSTINGER-SETUP.md.
 *
 * The website's api/leads.php posts each enquiry here with the secret;
 * anything without the right secret is ignored.
 */

// Must match 'sheet_secret' in config.php on Hostinger. Long and random.
var SECRET = 'PASTE_THE_SAME_SECRET_AS_IN_CONFIG_PHP';

var SHEET_NAME = 'Leads';
var HEADERS = ['Date', 'Name', 'Phone', 'Class / programme', 'Message', 'Page', 'Status', 'Note'];
var STATUSES = ['New', 'Contacted', 'Enrolled', 'Lost'];

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'Malformed request.' });
  }

  if (!data || data.secret !== SECRET || SECRET === 'PASTE_THE_SAME_SECRET_AS_IN_CONFIG_PHP') {
    return reply({ ok: false, error: 'Unauthorized.' });
  }

  // Two enquiries arriving together must not overwrite each other's row.
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    getSheet().appendRow([
      new Date(),
      text(data.name),
      text(data.phone),
      text(data.class),
      text(data.message),
      text(data.source),
      'New',
      ''
    ]);
  } finally {
    lock.releaseLock();
  }

  return reply({ ok: true });
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;

  // First enquiry: create the tab with headers and a Status dropdown.
  sheet = ss.insertSheet(SHEET_NAME);
  sheet.appendRow(HEADERS);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  sheet.getRange('A2:A').setNumberFormat('dd mmm yyyy, hh:mm');
  sheet.getRange('G2:G').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build()
  );
  return sheet;
}

// Store visitor text as plain text. A leading = + - @ would otherwise be
// read as a formula (and "+91 ..." phone numbers would show as #ERROR!).
function text(value) {
  var s = String(value == null ? '' : value).slice(0, 2000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
