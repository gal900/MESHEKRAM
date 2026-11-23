/* Sends the site's own forms to the MyPrice lead system in the background (hidden).
   MyPrice fields: full name, phone, email, notes. Every other field goes into notes. */
(function () {
  var ENDPOINT = 'https://www.myprice.co.il/myprice/ajax/affiliate_service_submit.ashx';
  // Exactly what MyPrice's own form (#form1) serializes, in the same order. These values are static for this form.
  var FIXED = {
    __VIEWSTATE: '/wEPDwULLTEyMzg3MDYwNTRkZPLKuw2Etk3ZmqC6IDajQlUFNfV2XrCZEGbSFOm01TGv',
    __VIEWSTATEGENERATOR: 'F17C4103',
    __EVENTVALIDATION: '/wEdAAU6k7rSAmZ7k1iphhcPJ8anJL9Sv3RP6Va36YFE7xlFZaxJKqgkkwrpGycN/woiMmpZgELG/yaC318vAswmzf9MirvmLAyY3945UhpkK6XlMMHnqcLxggbCVJChewariwFF0fomrNp3tRgWAotBF+OL',
    hdn_psrc: '', fk_md_product_id: '0', fk_affiliate_id: '21126171', fk_service_id: '10310', fk_dynamic_content_by_profile_id: ''
  };
  var F = { name: 'txt_form_field_11623', phone: 'txt_form_field_11624', email: 'txt_form_field_11625', notes: 'txt_form_field_11626' };

  var sink = document.createElement('iframe');
  sink.name = 'mp_sink'; sink.title = 'mp'; sink.tabIndex = -1; sink.setAttribute('aria-hidden', 'true');
  sink.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(sink);

  function labelOf(el) {
    var l = el.closest('label');
    if (!l) return el.name || el.type;
    var t = '';
    l.childNodes.forEach(function (n) { if (n.nodeType === 3) t += n.textContent; });
    return t.trim() || el.name || el.type;
  }

  function kind(form) {
    if (form.closest('footer')) return 'הרשמה לעדכונים';
    if (form.querySelector('select')) return 'טופס צור קשר';
    if (form.querySelector('textarea')) return 'טופס יצרנים – הצטרפות למדפים';
    return 'טופס באתר';
  }

  function send(form) {
    var data = { name: '', phone: '', email: '' }, notes = [];
    var msg = form.querySelector('.mp-msg');
    var els = form.querySelectorAll('input, select, textarea');
    els.forEach(function (el) {
      var v = el.type === 'checkbox' ? (el.checked ? 'כן' : 'לא') : String(el.value || '').trim();
      if (el.type === 'email' && !data.email) { data.email = v; return; }
      if (el.type === 'tel' && !data.phone) { data.phone = v.replace(/^\+?972/, '0').replace(/\D/g, ''); return; }
      if (el.type === 'text' && !data.name && /שם/.test(labelOf(el))) { data.name = v; return; }
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
      notes.push(labelOf(el) + ': ' + (v || 'לא צוין'));
    });
    var isNews = form.closest('footer');
    if (!isNews && data.phone && !/^0\d{8,9}$/.test(data.phone)) {
      msg.textContent = 'מספר הטלפון לא תקין. נסו שוב, למשל 0501234567.';
      msg.setAttribute('role', 'alert');
      return;
    }
    if (isNews ? !data.email : (!data.name || !data.phone)) {
      msg.textContent = isNews ? 'צריך כתובת אימייל.' : 'צריך שם מלא וטלפון כדי שנוכל לחזור אליך.';
      msg.setAttribute('role', 'alert');
      return;
    }
    notes.unshift('מקור: ' + kind(form) + ' | עמוד: ' + location.pathname);
    var post = document.createElement('form');
    post.method = 'POST'; post.action = ENDPOINT; post.acceptCharset = 'UTF-8'; post.enctype = 'application/x-www-form-urlencoded'; post.target = 'mp_sink'; post.style.display = 'none';
    var vals = {};
    vals.__VIEWSTATE = FIXED.__VIEWSTATE;
    vals.__VIEWSTATEGENERATOR = FIXED.__VIEWSTATEGENERATOR;
    vals.__EVENTVALIDATION = FIXED.__EVENTVALIDATION;
    vals[F.name] = data.name || 'הרשמה לעדכונים';
    vals[F.phone] = data.phone;
    vals[F.email] = data.email;
    vals[F.notes] = notes.join(' | ').slice(0, 900);
    ['hdn_psrc', 'fk_md_product_id', 'fk_affiliate_id', 'fk_service_id', 'fk_dynamic_content_by_profile_id'].forEach(function (k) { vals[k] = FIXED[k]; });
    Object.keys(vals).forEach(function (k) {
      var i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = vals[k]; post.appendChild(i);
    });
    document.body.appendChild(post); post.submit();
    setTimeout(function () { post.remove(); }, 4000);
    form.reset();
    msg.removeAttribute('role');
    msg.setAttribute('role', 'status');
    msg.textContent = isNews ? 'נרשמת. תודה!' : 'תודה! קיבלנו את הפנייה ונחזור אליך בהקדם.';
  }

  document.querySelectorAll('main form, footer form').forEach(function (form) {
    var msg = document.createElement('p');
    msg.className = 'mp-msg'; msg.setAttribute('aria-live', 'polite');
    msg.style.cssText = 'margin:6px 0 0;font-weight:700;grid-column:1/-1';
    form.appendChild(msg);
    form.querySelectorAll('button').forEach(function (b) { b.type = 'submit'; });
    form.addEventListener('submit', function (e) { e.preventDefault(); send(form); });
  });
})();
