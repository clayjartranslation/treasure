(function () {
      var ready = window.ctbDevotionalEmailReady && window.ctbDevotionalEmailReady();
      var box = document.getElementById('email-signup');
      var form = document.getElementById('email-form');
      if (!box || !form) return;
      form.addEventListener('submit', function (event) {
        var action = form.getAttribute('action') || '';
        if (!/^https:\/\/\S+$/i.test(action)) event.preventDefault();
      });
      if (!ready) return;
      form.setAttribute('action', ready.formAction);
      box.hidden = false;
    })();
