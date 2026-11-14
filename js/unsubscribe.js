/* Fills the unsubscribe mailto link with the address from the query string.
   This file does not call Brevo or any other outside service. */
(function () {
  var params = new URLSearchParams(window.location.search);
  var email = String(params.get('email') || '').trim();
  var link = document.getElementById('unsubMail');
  var subject = 'Unsubscribe daily devotional';
  var body = 'Please unsubscribe this address from the Clay Jar Treasure Bible daily devotional.';
  if (email) body += '\n\n' + email;
  if (link) {
    link.setAttribute('href', 'mailto:contact.clayjar@protonmail.com?subject=' +
      encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
  }
  var shown = document.getElementById('unsubEmail');
  if (shown && email) {
    shown.hidden = false;
    shown.textContent = 'The address on this link is ' + email + '.';
  }
})();
