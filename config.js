// Paste the Web app URL from Apps Script here (Deploy > Manage deployments > Web app URL).
// Leave it empty to run the form without saving (answers stay in the browser only).
window.STUDY_CONFIG = {
  APPS_SCRIPT_URL: "",

  // Used only if the Apps Script can't be reached. The live split, quotas and
  // version caps are set in apps-script/Code.gs.
  P_EXPERIMENT_FALLBACK: 0.4,

  // Seconds the product page must stay on screen before answers can be sent.
  MIN_VIEW_SECONDS: 8
};
