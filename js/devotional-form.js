(function () {
      var ready = window.ctbDevotionalEmailReady && window.ctbDevotionalEmailReady();
      var box = document.getElementById('email-signup');
      var form = document.getElementById('email-form');
      if (!box || !form) return;

      var tz = '';
      try { tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').trim(); } catch (e) { tz = ''; }
      var zone = form.querySelector('input[name="TIMEZONE"]');
      if (!zone) {
        zone = document.createElement('input');
        zone.type = 'hidden';
        zone.name = 'TIMEZONE';
        form.appendChild(zone);
      }
      zone.value = tz;
      form.addEventListener('submit', function (event) {
        var action = form.getAttribute('action') || '';
        if (!/^https:\/\/\S+$/i.test(action)) event.preventDefault();
      });
      if (!ready) return;
      form.setAttribute('action', ready.formAction);
      box.hidden = false;
    })();
