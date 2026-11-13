/* Daily devotional email — one file for this site.
   Full steps: SETUP-EMAIL.md.

   Leave formAction and listId empty to hide the signup form. Reading the
   devotional on the page stays free, with no email address required.

   formAction is the Brevo hosted form’s https address (the form’s action).
   listId is that form’s Brevo list, a number. The Clay Jar Translation may
   use the same Brevo account, but it should use a different list.

   A test may set window.CTB_DEVOTIONAL_EMAIL before this file runs. A filled-in
   test config is kept so the committed file can stay empty. */
(function () {
  function ready(cfg) {
    if (!cfg) return null;
    var formAction = String(cfg.formAction || '').trim();
    var listId = String(cfg.listId || '').trim();
    if (!/^https:\/\/\S+$/i.test(formAction)) return null;
    if (!/^[1-9]\d*$/.test(listId)) return null;
    return { formAction: formAction, listId: listId };
  }
  var existing = window.CTB_DEVOTIONAL_EMAIL;
  if (!ready(existing)) {
    window.CTB_DEVOTIONAL_EMAIL = {
      formAction: '',
      listId: ''
    };
  }
  window.ctbDevotionalEmailReady = function () {
    return ready(window.CTB_DEVOTIONAL_EMAIL);
  };
})();
