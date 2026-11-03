/**
 * J-Hills integration for the Google Form whose answers are in:
 * https://docs.google.com/spreadsheets/d/1o_eKa_94XWEPvf-0m2kTnF7aA2SWmLgloCyzFAcoAi4
 *
 * Set Script Properties:
 * JHILLS_API_URL=https://YOUR-SERVICE.onrender.com
 * JHILLS_FORMS_SECRET=<same strong secret set on Render as GOOGLE_FORMS_SECRET>
 *
 * Run installJHillsTrigger ONCE, then authorize access to Forms, Drive and UrlFetch.
 * Form submit creates an INACTIVE apartment, then uploads photos.
 */
const JHILLS_SHEET_ID = "1o_eKa_94XWEPvf-0m2kTnF7aA2SWmLgloCyzFAcoAi4";

function jHillsConfig_() {
  const p = PropertiesService.getScriptProperties();
  const url = (p.getProperty("JHILLS_API_URL") || "").replace(/\/$/, "");
  const secret = p.getProperty("JHILLS_FORMS_SECRET") || "";
  if (!/^https:\/\//.test(url) || !secret) {
    throw new Error("Configure Script Properties JHILLS_API_URL (https) and JHILLS_FORMS_SECRET first.");
  }
  return {url: url, secret: secret};
}

function jHillsForm_() {
  const formUrl = SpreadsheetApp.openById(JHILLS_SHEET_ID).getFormUrl();
  if (!formUrl) throw new Error("The sheet is not connected to a Google Form.");
  return FormApp.openByUrl(formUrl);
}

function installJHillsTrigger() {
  jHillsConfig_();  // validate before creating a trigger
  const form = jHillsForm_();
  const existing = ScriptApp.getProjectTriggers().some(function(t) {
    return t.getHandlerFunction() === "onJHillsFormSubmit";
  });
  if (!existing) ScriptApp.newTrigger("onJHillsFormSubmit").forForm(form).onFormSubmit().create();
  Logger.log("Installed trigger for form: " + form.getEditUrl());
}

function jHillsPost_(path, body) {
  const cfg = jHillsConfig_();
  const res = UrlFetchApp.fetch(cfg.url + path, {
    method: "post",
    contentType: "application/json",
    headers: {"X-Forms-Secret": cfg.secret},
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const responseText = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("J-Hills API failed (" + code + "): " + responseText.slice(0, 500));
  }
  return JSON.parse(responseText);
}

function onJHillsFormSubmit(e) {
  if (!e || !e.response) throw new Error("Install a Form submit trigger; do not run this function manually.");
  jHillsImportResponse_(e.response);
}

function jHillsImportResponse_(response) {
  const formId = jHillsForm_().getId();
  const responseId = response.getId();
  if (!responseId) throw new Error("Response has no ID.");
  const answers = {};
  const fileIds = [];
  response.getItemResponses().forEach(function(itemResponse) {
    const item = itemResponse.getItem();
    const title = item.getTitle();
    const value = itemResponse.getResponse();
    if (item.getType() === FormApp.ItemType.FILE_UPLOAD) {
      (Array.isArray(value) ? value : [value]).forEach(function(id) {
        if (id) fileIds.push(String(id));
      });
    } else {
      answers[title] = value instanceof Date
        ? Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm")
        : Array.isArray(value) ? value.map(String) : String(value == null ? "" : value);
    }
  });
  // Google Form upload answer isn't an ordinary text value, but backend only
  // needs question numbers 1-57; photo IDs are transferred separately.
  const result = jHillsPost_("/api/integrations/google-forms/submissions", {
    form_id: formId, response_id: responseId, answers: answers
  });
  let success = 0;
  const errors = [];
  fileIds.forEach(function(fileId) {
    try {
      const file = DriveApp.getFileById(fileId);
      const blob = file.getBlob();
      const type = blob.getContentType();
      if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
        throw new Error("Unsupported type " + type + " for " + file.getName());
      }
      jHillsPost_("/api/integrations/google-forms/submissions/" + result.apartment_id + "/photos", {
        drive_file_id: fileId,
        filename: file.getName(),
        content_type: type,
        data_base64: Utilities.base64Encode(blob.getBytes())
      });
      success++;
    } catch (err) {
      errors.push(fileId + ": " + err.message);
    }
  });
  Logger.log("J-Hills draft apartment: " + result.apartment_id + ", images: " + success);
  if (errors.length) throw new Error("Apartment imported, but some photos failed. Retry response " + responseId + ": " + errors.join("; "));
}

// Retry an existing form response without duplicating the apartment or its photos.
// Put the response ID (from Apps Script execution log) in this function's call.
function retryJHillsResponse(responseId) {
  if (!responseId) throw new Error("Pass the Google Form response ID.");
  jHillsImportResponse_(jHillsForm_().getResponse(responseId));
}

// Test previously submitted responses one by one, beginning with the most recent.
// CAUTION: Running this creates a real inactive draft on the target server.
function importLatestJHillsResponse() {
  const responses = jHillsForm_().getResponses();
  if (!responses.length) throw new Error("No responses have been submitted.");
  jHillsImportResponse_(responses[responses.length - 1]);
}
