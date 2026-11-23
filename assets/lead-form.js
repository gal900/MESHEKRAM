/* Lead forms: validate in the browser (for convenience only), then POST to /api/lead on this site.
   The server re-checks everything and forwards valid leads to MyPrice. No MyPrice IDs or URL here. */
(function () {
  var ENDPOINT = '/api/lead';
  var F = { name: 'txt_form_field_11623', phone: 'txt_form_field_11624', email: 'txt_form_field_11625', msg: 'txt_form_field_11626' };

  var css = document.createElement('style');
  css.textContent = '.yc-err{display:block;margin-top:6px;font-size:14px;font-weight:700;color:#9B1C1C}' +
    '.yc-field.is-invalid input,.yc-field.is-invalid textarea,.yc-field.is-invalid select{border-color:#9B1C1C !important;box-shadow:0 0 0 1px #9B1C1C}' +
    '.yc-status{grid-column:1/-1;margin:4px 0 0;font-weight:700;color:#9B1C1C}' +
    '.yc-thanks{padding:28px;border-radius:6px;background:#172F1B;color:#EBE7D7;font-size:20px;font-weight:700;line-height:1.5}' +
    'form.yc-form button[disabled]{opacity:.7;cursor:progress}';
  document.head.appendChild(css);

  function normalizePhone(v) { var d = String(v || '').replace(/\D/g, ''); if (d.indexOf('972') === 0) d = '0' + d.slice(3); return d; }
  function validPhone(d) { if (/(\d)\1{6}$/.test(d)) return false; return /^05\d{8}$/.test(d) || /^0[23489]\d{7}$/.test(d) || /^07[2-9]\d{7}$/.test(d) || /^1(599|700|800)\d{6}$/.test(d); }
  function validName(v) { if (!v || v.length > 60 || /\d/.test(v)) return false; if (!/^[A-Za-zא-ת][A-Za-zא-ת \-'"׳״.]*$/.test(v)) return false; return (v.match(/[A-Za-zא-ת]/g) || []).length >= 2; }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  function labelText(el) {
    var l = el.closest('label'); if (!l) return el.name || el.type; var t = '';
    l.childNodes.forEach(function (n) { if (n.nodeType === 3) t += n.textContent; }); return t.trim() || el.name || el.type;
  }
  function role(el) { return el.getAttribute('data-role'); }

  function setError(el, text) {
    var wrap = el.closest('.yc-field') || el.parentNode;
    var err = wrap.querySelector('.yc-err');
    if (!err) { err = document.createElement('span'); err.className = 'yc-err'; err.id = 'err-' + Math.random().toString(36).slice(2); wrap.appendChild(err); }
    err.textContent = text || '';
    wrap.classList.toggle('is-invalid', !!text);
    if (text) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', err.id); } else { el.removeAttribute('aria-invalid'); }
  }

  function prepare(form) {
    form.querySelectorAll('label').forEach(function (l) { l.classList.add('yc-field'); });
    var status = document.createElement('p'); status.className = 'yc-status'; status.setAttribute('aria-live', 'polite'); form.appendChild(status);
  }

  function collect(form) {
    var d = { name: '', phone: '', email: '', extra: [] }, els = {};
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.name === 'yc_website' || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
      var r = role(el), v = el.type === 'checkbox' ? (el.checked ? 'כן' : 'לא') : String(el.value || '').trim();
      if (r === 'name' || r === 'phone' || r === 'email') { d[r] = v; els[r] = el; return; }
      d.extra.push(labelText(el) + ': ' + (v || 'לא צוין'));
    });
    return { d: d, els: els };
  }

  function validate(c) {
    var e = {};
    if (!validName(c.d.name)) e.name = 'נא להזין שם באותיות עברית או אנגלית';
    if (!validPhone(normalizePhone(c.d.phone))) e.phone = 'נא להזין מספר טלפון ישראלי תקין';
    if (c.d.email && !validEmail(c.d.email)) e.email = 'כתובת המייל לא נראית תקינה';
    return e;
  }

  function showErrors(c, errors) {
    var first = null;
    ['name', 'phone', 'email'].forEach(function (r) { if (c.els[r]) { setError(c.els[r], errors[r]); if (errors[r] && !first) first = c.els[r]; } });
    if (first) first.focus();
    return !!first;
  }

  function submit(form) {
    if (form.dataset.sending) return;
    var c = collect(form), status = form.querySelector('.yc-status'), btn = form.querySelector('button');
    status.textContent = '';
    if (showErrors(c, validate(c))) return;
    var h1 = (document.querySelector('h1') || {}).textContent || document.title;
    var msg = c.d.extra.concat(['נשלח מהעמוד: ' + h1.trim().replace(/\s+/g, ' '), location.origin + location.pathname]).join(' | ');
    var body = new URLSearchParams();
    body.set(F.name, c.d.name); body.set(F.phone, normalizePhone(c.d.phone)); body.set(F.email, c.d.email); body.set(F.msg, msg);
    body.set('yc_website', (form.querySelector('[name=yc_website]') || {}).value || '');
    body.set('yc_source', form.getAttribute('data-source') || location.pathname);
    form.dataset.sending = '1'; var label = btn.textContent; btn.disabled = true; btn.textContent = 'שולחים…';
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: body.toString() })
      .then(function (r) { return r.json().catch(function () { return { ok: false, message: 'תקלה זמנית. נסו שוב או התקשרו: 074-7361723' }; }); })
      .then(function (j) {
        if (j.ok) {
          var t = document.createElement('div'); t.className = 'yc-thanks'; t.setAttribute('role', 'status'); t.tabIndex = -1;
          t.textContent = 'תודה! קיבלנו את הפנייה ונחזור אליך בהקדם.';
          form.style.display = 'none'; form.parentNode.insertBefore(t, form.nextSibling); t.focus();
          return;
        }
        if (j.errors) showErrors(c, j.errors);
        if (j.message || (j.errors && j.errors.turnstile)) status.textContent = j.message || j.errors.turnstile;
      })
      .catch(function () { status.textContent = 'אין חיבור כרגע. נסו שוב או התקשרו: 074-7361723'; })
      .then(function () { delete form.dataset.sending; btn.disabled = false; btn.textContent = label; });
  }

  document.querySelectorAll('form.yc-form').forEach(prepare);
  document.addEventListener('submit', function (e) {
    var form = e.target.closest && e.target.closest('form.yc-form'); if (!form) return;
    e.preventDefault(); e.stopImmediatePropagation(); submit(form);
  }, true);
})();
