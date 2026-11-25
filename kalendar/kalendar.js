/*
 * Edge Cut kalendar za pozive (Borisovi landinzi).
 * Termini dolaze iz Calendlyja preko edgecut.app (/api/public/lm/poziv/slots), zakazivanje ide
 * preko /api/public/lm/poziv/book, pa Calendly šalje pozivnicu i Meet link kao i inače.
 *
 * Upotreba na landingu:
 *   <div data-ec-kalendar data-landing="poziv" data-redirect="hvala/"></div>
 *   <script src="/kalendar/kalendar.js" defer></script>
 *
 * Boje se menjaju CSS promenljivama na elementu ili roditelju:
 *   --eck-accent, --eck-accent-text, --eck-bg, --eck-surface, --eck-border, --eck-text, --eck-muted
 *
 * Ako strana ima /shop/track.js, svaki korak ide i u naše praćenje (ADS → Besplatan poziv → Levak):
 *   cal_view (kalendar na ekranu), cal_day, slot_pick, form_start, book_submit, booked, book_error,
 *   a uz zakazivanje ide sid posetioca, pa se poziv vezuje za ceo put.
 *
 * Po zakazivanju: Pixel Schedule + Lead (eventID = id reda, server šalje CAPI sa istim id-jem),
 * događaj `ec-kalendar:booked` na window (detail: {id, label}), pa redirect ako postoji data-redirect.
 * Ako API ne odgovori, prikazuje se običan Calendly link (fallback).
 *
 * Plaćena konsultacija (/kupi/termin/) koristi isti widget sa drugim rutama:
 *   data-slots, data-book (putanje na edgecut.app), data-extra (JSON koji ide uz zakazivanje, npr. porudžbina),
 *   data-email (mejl je poznat, polje se ne prikazuje), data-minutes, data-done (naslov posle zakazivanja),
 *   data-fallback (link kad kalendar ne radi), data-no-pixel (bez Schedule/Lead: to nije lead za Borisov poziv).
 *
 * Landinzi za poziv (/saradnja i podstrane) dodaju:
 *   data-pitanja   posle termina, pre kontakta, četiri pitanja na klik (odgovori idu u call_bookings.kvalifikacija;
 *                  ko je kvalifikovan odlučuje server u lib/lead-magnet/poziv.ts, pa uz Schedule i Lead ide SubmitApplication),
 *                  data-pitanja="profil" (strana kupljenog videa /trik/gledaj/) pita analitiku profila: dva pitanja na klik i dva
 *                  broja (prosek pregleda, ukupno videa), a kontakt traži Instagram profil,
 *   data-predlog-mejl  mejl je poznat, upisan je u formu ali može da se promeni,
 *   data-popup     svaki <a href="#poziv"> otvara popup sa ovim istim kalendarom (isti element se preseli u <dialog> i nazad,
 *                  pa izabrano ostaje), a i izbor vremena na strani nastavlja u popupu. Nazad na telefonu zatvara popup.
 * Praćenje za to: q_answer {q, a}, q_done, popup_open {gde}, popup_close {korak}.
 */
(function () {
  'use strict';
  var host = document.querySelector('[data-ec-kalendar]');
  if (!host) return;

  var API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:3000' : 'https://edgecut.app';
  var FALLBACK = 'https://calendly.com/borisprproj/30min';
  var T0 = Date.now();
  var landing = host.getAttribute('data-landing') || location.pathname.replace(/^\/|\/$/g, '') || 'poziv';
  var redirect = host.getAttribute('data-redirect');
  var SLOTS = API + (host.getAttribute('data-slots') || '/api/public/lm/poziv/slots');
  var BOOK = API + (host.getAttribute('data-book') || '/api/public/lm/poziv/book');
  var EXTRA = {};
  try { EXTRA = JSON.parse(host.getAttribute('data-extra') || '{}'); } catch (e) { EXTRA = {}; }
  var FIXED_EMAIL = host.getAttribute('data-email');
  var MIN = host.getAttribute('data-minutes') || '30';
  var DONE = host.getAttribute('data-done') || 'Poziv je zakazan';
  var NO_PIXEL = host.hasAttribute('data-no-pixel');
  var POPUP = host.hasAttribute('data-popup') && typeof window.HTMLDialogElement === 'function' && !!window.HTMLDialogElement.prototype.showModal;

  // Pitanja pre kontakta. Vrednosti (prvi član) moraju da se poklope sa KVALIFIKACIJA u webapp lib/lead-magnet/poziv.ts.
  var PROFIL = host.getAttribute('data-pitanja') === 'profil';
  var PITANJA = PROFIL ? [
    { k: 'videa', t: 'Koliko videa mesečno objavljuješ?',
      o: [['0', 'Nijedan'], ['1-4', '1 do 4'], ['5-10', '5 do 10'], ['11-20', '11 do 20'], ['20+', 'Preko 20']] },
    { k: 'radi', t: 'Ko ti radi videe?', o: [['sam', 'Radim ih sam'], ['agencija', 'Radi ih agencija'], ['tim', 'Imam svoj tim']] },
    { k: 'prosek', t: 'Koliki ti je prosek pregleda na poslednjih 30 videa?', num: true, ph: 'na primer 1200',
      h: 'Otvori rilsove na svom profilu, pogledaj brojke na poslednjih 30 i upiši koliko je to po klipu, može otprilike.' },
    { k: 'ukupno', t: 'Koliko ukupno videa imaš na profilu?', num: true, ph: 'na primer 85' }
  ] : host.hasAttribute('data-pitanja') ? [
    { k: 'zaposleni', t: 'Koliko zaposlenih imaš?', grid: true,
      o: [['0', 'Samo ja'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6+', '6+']] },
    { k: 'agencija', t: 'Da li je neka agencija već radila sadržaj za tebe?', o: [['da', 'Da'], ['ne', 'Ne']] },
    { k: 'kad', t: 'Ako ti se svidi ono što čuješ na pozivu, kada krećeš?',
      o: [['odmah', 'Odmah posle poziva'], ['uskoro', 'U naredna dva meseca'], ['raspitujem', 'Za sad se samo raspitujem']] },
    { k: 'budzet', t: 'Koliko mesečno možeš da uložiš u sadržaj?', if: function (a) { return a.kad !== 'raspitujem'; },
      o: [['do500', 'Do 500 €'], ['500-1000', '500 do 1.000 €'], ['1000-2000', '1.000 do 2.000 €'], ['2000+', 'Preko 2.000 €']] }
  ] : [];
  if (host.getAttribute('data-fallback')) FALLBACK = host.getAttribute('data-fallback');

  // ---------- tracking ----------
  var qs = new URLSearchParams(location.search);
  var utm = {
    source: qs.get('utm_source'), medium: qs.get('utm_medium'), campaign: qs.get('utm_campaign'),
    content: qs.get('utm_content'), term: qs.get('utm_term')
  };
  function cookie(n) { var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
  function fbc() {
    var c = cookie('_fbc'); if (c) return c;
    var id = qs.get('fbclid'); return id ? 'fb.1.' + Date.now() + '.' + id : null;
  }
  function track(type, value, beacon) {
    try { if (window.shopTrack) window.shopTrack(type, value, beacon ? { beacon: true } : undefined); } catch (e) { /* praćenje nikad ne ruši kalendar */ }
  }
  function pixel(kind, name, data, opts) { if (NO_PIXEL) return; try { if (window.fbq) window.fbq(kind, name, data || {}, opts || {}); } catch (e) {} }
  function fallbackUrl() {
    var q = new URLSearchParams();
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) { if (qs.get(k)) q.set(k, qs.get(k)); });
    q.set('hide_gdpr_banner', '1');
    if (!/^https:\/\/calendly\.com\//.test(FALLBACK)) return FALLBACK;
    return FALLBACK + '?' + q.toString();
  }

  // ---------- stil ----------
  var css = [
    '.eck{--a:var(--eck-accent,#0e7490);--at:var(--eck-accent-text,#fff);--bg:var(--eck-bg,#fff);--sf:var(--eck-surface,#f6f8fa);',
    '--bd:var(--eck-border,#e3e8ee);--tx:var(--eck-text,#101828);--mu:var(--eck-muted,#5b6472);',
    'color:var(--tx);background:var(--bg);border:1px solid var(--bd);border-radius:16px;padding:16px;font:inherit;text-align:left;max-width:560px;margin:0 auto;box-sizing:border-box}',
    '.eck *{box-sizing:border-box}',
    '.eck-h{font-weight:700;font-size:15px;margin:0 0 10px}',
    '.eck-days{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;margin:0 -2px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}',
    '.eck-days::-webkit-scrollbar{height:0}',
    '.eck-day{flex:0 0 auto;scroll-snap-align:start;min-width:72px;padding:10px 8px;border:1px solid var(--bd);border-radius:12px;background:var(--sf);color:var(--tx);font:inherit;cursor:pointer;line-height:1.2;text-align:center}',
    '.eck-day b{display:block;font-size:13px;font-weight:600;color:var(--mu)}',
    '.eck-day span{display:block;font-size:16px;font-weight:700;margin-top:2px}',
    '.eck-day[aria-pressed="true"]{background:var(--a);border-color:var(--a);color:var(--at)}',
    '.eck-day[aria-pressed="true"] b{color:var(--at);opacity:.85}',
    '.eck-times{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px}',
    '@media(min-width:480px){.eck-times{grid-template-columns:repeat(4,1fr)}}',
    '.eck-t{padding:12px 4px;border:1px solid var(--a);border-radius:10px;background:var(--bg);color:var(--a);font:inherit;font-weight:700;font-size:15px;cursor:pointer}',
    '.eck-t:active,.eck-day:active,.eck-btn:active{transform:scale(.97)}',
    '.eck-note{font-size:13px;color:var(--mu);margin:12px 0 0}',
    '.eck-picked{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--sf);border-radius:12px;padding:12px;margin-bottom:14px}',
    '.eck-picked b{display:block;font-size:15px}',
    '.eck-picked small{color:var(--mu);font-size:13px}',
    '.eck-link{background:none;border:0;color:var(--a);font:inherit;font-weight:600;text-decoration:underline;cursor:pointer;padding:4px;white-space:nowrap}',
    '.eck-f{display:flex;flex-direction:column;gap:12px}',
    '.eck-f label{display:flex;flex-direction:column;gap:5px;font-size:14px;font-weight:600}',
    '.eck-f label small{font-weight:400;color:var(--mu)}',
    '.eck-f input,.eck-f select,.eck-f textarea{font:inherit;font-size:16px;color:var(--tx);background:var(--bg);border:1px solid var(--bd);border-radius:10px;padding:12px;width:100%}',
    '.eck-f textarea{min-height:76px;resize:vertical}',
    '.eck-f input:focus,.eck-f select:focus,.eck-f textarea:focus{outline:2px solid var(--a);outline-offset:1px;border-color:var(--a)}',
    '.eck-f [aria-invalid="true"]{border-color:#d92d20}',
    '.eck-ph{display:flex;gap:8px}',
    '.eck-ph select{flex:0 0 112px}',
    '.eck-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}',
    '.eck-btn{margin-top:4px;padding:15px;border:0;border-radius:12px;background:var(--a);color:var(--at);font:inherit;font-weight:700;font-size:16px;cursor:pointer}',
    '.eck-btn[disabled]{opacity:.6;cursor:wait}',
    '.eck-err{color:#d92d20;font-size:14px;margin:0}',
    '.eck-ok{text-align:center;padding:12px 4px}',
    '.eck-ok .eck-check{width:44px;height:44px;border-radius:50%;background:var(--a);color:var(--at);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:22px;font-weight:700}',
    '.eck-ok p{margin:6px 0 0;color:var(--mu)}',
    '.eck-sk{display:flex;gap:8px;overflow:hidden}.eck-sk i{flex:0 0 72px;height:58px;border-radius:12px;background:var(--sf)}',
    '.eck-skt{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}.eck-skt i{height:46px;border-radius:10px;background:var(--sf)}',
    '.eck-pr{display:flex;gap:6px;margin:0 0 14px}.eck-pr i{flex:1;height:4px;border-radius:2px;background:var(--bd)}.eck-pr i.on{background:var(--a)}',
    '.eck-q{font-weight:800;font-size:19px;line-height:1.25;margin:0 0 14px;text-wrap:balance}',
    '.eck-o{display:grid;gap:8px}.eck-o.g{grid-template-columns:repeat(3,1fr)}.eck-o.g button:first-child{grid-column:1/-1}',
    '.eck-o button{min-height:52px;padding:12px 14px;border:1px solid var(--bd);border-radius:12px;background:var(--sf);color:var(--tx);font:inherit;font-weight:700;font-size:16px;text-align:center;cursor:pointer}',
    '.eck-o button:active{transform:scale(.98)}',
    '.eck-o button[aria-pressed="true"]{background:var(--a);border-color:var(--a);color:var(--at)}',
    '@media(hover:hover){.eck-o button:hover,.eck-t:hover,.eck-day:hover{border-color:var(--a)}}',
    '.eck button:focus-visible,.eckd-x:focus-visible{outline:2px solid var(--a,#0e7490);outline-offset:2px}',
    '.eck-backrow{margin-top:14px}',
    'dialog.eckd{width:min(600px,calc(100vw - 32px));max-width:none;max-height:min(760px,calc(100dvh - 48px));margin:auto;padding:0;border:0;border-radius:20px;overflow:hidden;background:#fff;color:#0c1a2b;box-shadow:0 30px 80px -20px rgba(0,0,0,.6)}',
    'dialog.eckd[open]{display:flex;flex-direction:column}',
    'dialog.eckd::backdrop{background:rgba(6,14,24,.72)}',
    '.eckd-h{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 10px 12px 20px;border-bottom:1px solid #e1e4e9}',
    '.eckd-h b{font-weight:800;font-size:17px;line-height:1.2;outline:0}.eckd-h small{display:block;font-size:13px;font-weight:500;color:#5b6472;margin-top:2px}',
    '.eckd-x{flex:0 0 44px;height:44px;border:0;background:none;border-radius:12px;font-size:26px;line-height:1;color:#4a5565;cursor:pointer}',
    '.eckd-b{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:4px 4px calc(12px + env(safe-area-inset-bottom))}',
    '.eckd-b .eck{border:0;max-width:none;border-radius:0}',
    '.eckd-b form .eck-btn{position:sticky;bottom:0;z-index:1;box-shadow:0 0 0 8px #fff}',
    'html.eckd-on{overflow:hidden}',
    '@media(max-width:599px){dialog.eckd{width:100vw;max-height:calc(100dvh - 28px);margin:auto 0 0;border-radius:20px 20px 0 0}}',
    '@media(prefers-reduced-motion:no-preference){dialog.eckd[open]{animation:eckdin .22s ease-out}@keyframes eckdin{from{transform:translateY(24px)}}}',
    '@media(prefers-reduced-motion:no-preference){.eck-sk i,.eck-skt i{animation:eckp 1.2s ease-in-out infinite alternate}}',
    '@keyframes eckp{to{opacity:.45}}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ---------- stanje ----------
  var S = { days: [], day: null, slot: null, busy: false, korak: 'termin', odg: {} };
  host.classList.add('eck');

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(html) { host.innerHTML = html; }

  // Traka koraka (termin, pitanja, podaci) postoji samo kad strana ima pitanja.
  function progress(n) {
    if (!PITANJA.length) return '';
    return '<div class="eck-pr" role="img" aria-label="Korak ' + n + ' od 3"><i class="on"></i><i' + (n > 1 ? ' class="on"' : '') + '></i><i' + (n > 2 ? ' class="on"' : '') + '></i></div>';
  }
  function top() { var b = host.closest && host.closest('.eckd-b'); if (b) b.scrollTop = 0; }

  function renderSkeleton() {
    el('<p class="eck-h">Izaberi dan</p><div class="eck-sk"><i></i><i></i><i></i><i></i><i></i></div><div class="eck-skt"><i></i><i></i><i></i><i></i><i></i><i></i></div>');
  }

  function renderFallback(msg) {
    el('<p class="eck-h">' + esc(msg) + '</p><a class="eck-btn" style="display:block;text-align:center;text-decoration:none" href="' +
      esc(fallbackUrl()) + '" target="_blank" rel="noopener">Otvori kalendar</a>');
  }

  function renderPicker() {
    S.korak = 'termin';
    if (!S.days.length) { renderFallback('Trenutno nema slobodnih termina ovde. Pogledaj kalendar direktno:'); return; }
    var d = S.days.filter(function (x) { return x.date === S.day; })[0] || S.days[0];
    S.day = d.date;
    var days = S.days.map(function (x) {
      var p = x.label.split(' ');
      return '<button type="button" class="eck-day" data-day="' + x.date + '" aria-pressed="' + (x.date === S.day) + '"><b>' +
        esc(p[0]) + '</b><span>' + esc(p.slice(1).join(' ')) + '</span></button>';
    }).join('');
    var times = d.slots.map(function (s) {
      return '<button type="button" class="eck-t" data-iso="' + s.iso + '">' + esc(s.time) + '</button>';
    }).join('');
    el(progress(1) + '<p class="eck-h">Izaberi dan</p><div class="eck-days">' + days + '</div>' +
      '<p class="eck-h" style="margin-top:6px">Izaberi vreme</p><div class="eck-times">' + times + '</div>' +
      '<p class="eck-note">Poziv traje ' + esc(MIN) + ' minuta, preko Google Meeta. Vreme je po Beogradu.</p>');
    host.querySelectorAll('.eck-day').forEach(function (b) {
      b.onclick = function () { S.day = b.getAttribute('data-day'); track('cal_day', { day: S.day }); renderPicker(); };
    });
    host.querySelectorAll('.eck-t').forEach(function (b) {
      b.onclick = function () {
        var iso = b.getAttribute('data-iso');
        S.slot = { iso: iso, time: b.textContent, day: d.label };
        pixel('trackCustom', 'IzabraoTermin', { landing: landing });
        track('slot_pick', { day: d.label, time: b.textContent });
        next();
        openPopup('termin');
      };
    });
    var on = host.querySelector('.eck-day[aria-pressed="true"]');
    if (on && on.scrollIntoView && on.offsetLeft > host.clientWidth - 80) on.parentNode.scrollLeft = on.offsetLeft - 16;
  }

  // ---------- pitanja ----------
  function active() { return PITANJA.filter(function (q) { return !q.if || q.if(S.odg); }); }
  /** Prvo pitanje bez odgovora, a kad ih nema, kontakt. */
  function next() {
    var list = active();
    for (var i = 0; i < list.length; i++) if (!S.odg[list[i].k]) { renderQuestion(i); return; }
    if (PITANJA.length && !S.qDone) { S.qDone = true; track('q_done'); }
    renderForm();
  }
  function renderQuestion(i) {
    var list = active(), q = list[i];
    S.korak = 'pitanje ' + q.k;
    if (q.num) { renderNumber(q, i); return; }
    el(progress(2) + '<p class="eck-q" tabindex="-1">' + esc(q.t) + '</p><div class="eck-o' + (q.grid ? ' g' : '') + '">' +
      q.o.map(function (o) {
        return '<button type="button" data-v="' + esc(o[0]) + '" aria-pressed="' + (S.odg[q.k] === o[0]) + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div><div class="eck-backrow"><button type="button" class="eck-link" data-back>Nazad</button></div>');
    host.querySelector('[data-back]').onclick = function () { if (i) renderQuestion(i - 1); else renderPicker(); };
    host.querySelectorAll('.eck-o button').forEach(function (b) {
      b.onclick = function () {
        var val = b.getAttribute('data-v');
        S.odg[q.k] = val;
        // Promenjen odgovor može da sakrije kasnije pitanje: njegov odgovor se ne šalje.
        PITANJA.forEach(function (x) { if (x.if && !x.if(S.odg)) delete S.odg[x.k]; });
        track('q_answer', { q: q.k, a: val });
        var rest = active();
        if (i + 1 < rest.length) renderQuestion(i + 1); else next();
      };
    });
    top();
  }

  // Broj: jedno polje, tačke i razmaci se brišu ("1.200" je 1200).
  function renderNumber(q, i) {
    el(progress(2) + '<form class="eck-f" novalidate><label class="eck-q" style="margin:0;display:block;font-weight:800;font-size:19px" for="eckn">' + esc(q.t) + '</label>' +
      (q.h ? '<p class="eck-note" style="margin:0">' + esc(q.h) + '</p>' : '') +
      '<input id="eckn" name="n" inputmode="numeric" autocomplete="off" placeholder="' + esc(q.ph || '') + '" value="' + esc(S.odg[q.k] || '') + '">' +
      '<p class="eck-err" role="alert" hidden>Upiši broj, može i otprilike.</p>' +
      '<button class="eck-btn" type="submit">Dalje</button></form>' +
      '<div class="eck-backrow"><button type="button" class="eck-link" data-back>Nazad</button></div>');
    var form = host.querySelector('form');
    host.querySelector('[data-back]').onclick = function () { if (i) renderQuestion(i - 1); else renderPicker(); };
    form.elements.n.focus({ preventScroll: true });
    form.onsubmit = function (e) {
      e.preventDefault();
      var v = form.elements.n.value.replace(/[\s.,]/g, '');
      if (!/^\d{1,9}$/.test(v)) {
        form.elements.n.setAttribute('aria-invalid', 'true');
        host.querySelector('.eck-err').hidden = false;
        return;
      }
      S.odg[q.k] = String(parseInt(v, 10));
      track('q_answer', { q: q.k, a: S.odg[q.k] });
      var rest = active();
      if (i + 1 < rest.length) renderQuestion(i + 1); else next();
    };
    top();
  }

  var saved = { email: host.getAttribute('data-predlog-mejl') || '' };
  function renderForm(error, field) {
    S.korak = 'podaci';
    var v = function (k) { return esc(saved[k] || ''); };
    var pre = saved.pre || '+381';
    var opts = [['+381', 'RS +381'], ['+385', 'HR +385'], ['+387', 'BA +387'], ['+382', 'ME +382'], ['', 'Drugo']].map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === pre ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
    el(progress(3) + '<div class="eck-picked"><div><b>' + esc(S.slot.day) + ' u ' + esc(S.slot.time) + '</b><small>' + esc(MIN) + ' min, Google Meet</small></div>' +
      '<button type="button" class="eck-link" data-back>Promeni</button></div>' +
      '<form class="eck-f" novalidate>' +
      '<label>Ime i prezime<input name="name" autocomplete="name" required value="' + v('name') + '"></label>' +
      (FIXED_EMAIL ? '<input name="email" type="hidden" value="' + esc(FIXED_EMAIL) + '">' :
        '<label>Mejl<small>Na njega stiže link za poziv.</small><input name="email" type="email" autocomplete="email" inputmode="email" required value="' + v('email') + '"></label>') +
      '<label>Telefon<span class="eck-ph"><select name="pre" aria-label="Pozivni broj">' + opts + '</select>' +
      '<input name="phone" type="tel" autocomplete="tel-national" inputmode="tel" placeholder="64 123 4567" required value="' + v('phone') + '"></span></label>' +
      '<label>' + (PROFIL ? 'Instagram profil' : 'Instagram, sajt ili naziv biznisa') + '<input name="instagram" autocomplete="off" autocapitalize="none" placeholder="' + (PROFIL ? '@tvojprofil' : '@tvojbiznis') + '" required value="' + v('instagram') + '"></label>' +
      '<label>' + (PROFIL ? 'Napomena' : 'Šta treba da znam pre poziva') + '<small>Nije obavezno.</small><textarea name="note">' + v('note') + '</textarea></label>' +
      '<div class="eck-hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>' +
      (error ? '<p class="eck-err" role="alert">' + esc(error) + '</p>' : '') +
      '<button class="eck-btn" type="submit">Zakaži poziv</button></form>' +
      (PITANJA.length ? '<div class="eck-backrow"><button type="button" class="eck-link" data-q>Nazad na pitanja</button></div>' : ''));
    host.querySelector('[data-back]').onclick = function () { keep(); renderPicker(); };
    if (PITANJA.length) host.querySelector('[data-q]').onclick = function () { keep(); renderQuestion(active().length - 1); };
    top();
    var form = host.querySelector('form');
    if (field) {
      var map = { name: 'name', email: 'email', phone: 'phone', instagram: 'instagram' };
      var bad = map[field] && form.elements[map[field]];
      if (bad) { bad.setAttribute('aria-invalid', 'true'); bad.focus(); }
    }
    form.onsubmit = function (e) { e.preventDefault(); submit(form); };
    function keep() { ['name', 'email', 'phone', 'instagram', 'note', 'pre'].forEach(function (k) { saved[k] = form.elements[k].value; }); }
    form.addEventListener('input', keep);
    form.addEventListener('input', function () { if (!S.formStarted) { S.formStarted = true; track('form_start'); } });
    form.addEventListener('change', keep);
  }

  function phoneValue(pre, raw) {
    var s = String(raw || '').trim();
    if (/^(\+|00)/.test(s) || !pre) return s;
    return pre + s.replace(/^0+/, '');
  }

  function submit(form) {
    if (S.busy) return;
    var f = form.elements;
    var body = {
      o: EXTRA.o, k: EXTRA.k, t: EXTRA.t,
      start: S.slot.iso, name: f.name.value, email: f.email.value, phone: phoneValue(f.pre.value, f.phone.value),
      instagram: f.instagram.value, note: f.note.value, website: f.website.value,
      kvalifikacija: PITANJA.length ? S.odg : undefined,
      tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || null), landing: landing, utm: utm,
      fbclid: qs.get('fbclid'), fbc: fbc(), fbp: cookie('_fbp'), page: location.href.slice(0, 600),
      ref: document.referrer || null, ms: Date.now() - T0,
      sid: (window.shopTrack && window.shopTrack.sid) || undefined
    };
    track('book_submit');
    S.busy = true;
    var btn = form.querySelector('.eck-btn'); btn.disabled = true; btn.textContent = 'Zakazujem...';
    fetch(BOOK, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (res) {
        S.busy = false;
        if (res.ok && res.id) {
          track('booked', { id: res.id }, true);
          if (landing !== 'kalendar-test') {
            pixel('track', 'Schedule', { content_name: 'Poziv sa Borisom', landing: landing }, { eventID: res.id });
            pixel('track', 'Lead', { content_name: 'Poziv sa Borisom', landing: landing }, { eventID: res.id });
            if (res.kvalifikovan) pixel('track', 'SubmitApplication', { content_name: 'Poziv sa Borisom', landing: landing }, { eventID: res.id });
          }
          S.korak = 'zakazano';
          el('<div class="eck-ok" role="status"><div class="eck-check">✓</div><p class="eck-h" style="margin:0">' + esc(DONE) + '</p>' +
            '<p><b style="color:var(--tx)">' + esc(res.label) + '</b></p><p>Link za Google Meet stiže ti na mejl.</p></div>');
          try { window.dispatchEvent(new CustomEvent('ec-kalendar:booked', { detail: { id: res.id, label: res.label } })); } catch (e) {}
          if (redirect) setTimeout(function () {
            var q = new URLSearchParams(location.search); q.set('termin', res.label); q.set('bid', res.id);
            location.href = redirect + (redirect.indexOf('?') > -1 ? '&' : '?') + q.toString();
          }, 1200);
          return;
        }
        if (res.taken) {
          track('book_error', { error: 'termin zauzet' });
          S.slot = null;
          load(true, 'Taj termin je upravo zauzet. Izaberi drugi.');
          return;
        }
        track('book_error', { error: String(res.error || (res.taken ? 'zauzet' : 'greška')).slice(0, 120) });
        if (res.fallback) { renderFallback(res.error || 'Zakazivanje nije prošlo. Zakaži direktno:'); return; }
        renderForm(res.error || 'Nešto nije u redu, probaj ponovo.', res.field);
      })
      .catch(function () {
        S.busy = false;
        renderForm('Nema veze sa serverom. Proveri internet i probaj ponovo.');
      });
  }

  function load(fresh, notice) {
    if (!S.days.length) renderSkeleton();
    fetch(SLOTS + (fresh ? (SLOTS.indexOf('?') > -1 ? '&' : '?') + 'fresh=1' : ''))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) { renderFallback('Kalendar trenutno ne može da se učita. Zakaži direktno:'); return; }
        if (res.fallback) FALLBACK = res.fallback;
        S.days = res.days || [];
        if (S.day && !S.days.some(function (x) { return x.date === S.day; })) S.day = null;
        renderPicker();
        if (notice) host.insertAdjacentHTML('afterbegin', '<p class="eck-err" role="alert" style="margin:0 0 10px">' + esc(notice) + '</p>');
      })
      .catch(function () { renderFallback('Kalendar trenutno ne može da se učita. Zakaži direktno:'); });
  }

  // ---------- popup ----------
  var dlg = null, home = null;
  function openPopup(gde) {
    if (!POPUP || (dlg && dlg.open)) return;
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'eckd';
      dlg.setAttribute('aria-label', 'Zakaži besplatan poziv');
      dlg.innerHTML = '<div class="eckd-h"><b tabindex="-1">Besplatan poziv<small>' + esc(MIN) + ' minuta, online</small></b>' +
        '<button type="button" class="eckd-x" aria-label="Zatvori">×</button></div><div class="eckd-b"></div>';
      document.body.appendChild(dlg);
      // Boje kalendara su na roditelju na strani, pa ih popup preuzima.
      var cs = getComputedStyle(host);
      ['accent', 'accent-text', 'bg', 'surface', 'border', 'text', 'muted'].forEach(function (k) {
        var v = cs.getPropertyValue('--eck-' + k); if (v) dlg.style.setProperty('--eck-' + k, v);
      });
      dlg.querySelector('.eckd-x').onclick = function () { dlg.close(); };
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener('close', function () {
        track('popup_close', { korak: S.korak });
        home.appendChild(host);
        home.style.minHeight = '';
        document.documentElement.classList.remove('eckd-on');
        if (history.state && history.state.eckd) history.back();
      });
      // Dugme nazad na telefonu zatvara popup, ne izbacuje sa strane.
      window.addEventListener('popstate', function () { if (dlg.open) dlg.close(); });
    }
    home = host.parentNode;
    home.style.minHeight = home.offsetHeight + 'px';
    dlg.querySelector('.eckd-b').appendChild(host);
    document.documentElement.classList.add('eckd-on');
    dlg.showModal();
    dlg.querySelector('.eckd-h b').focus();
    top();
    try { history.pushState({ eckd: 1 }, ''); } catch (e) {}
    track('popup_open', { gde: gde });
  }
  if (POPUP) document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#poziv"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    openPopup(a.getAttribute('data-gde') || 'strana');
  });

  // Kalendar je stvarno bio na ekranu (ne samo učitan na dnu strane).
  if ('IntersectionObserver' in window) {
    var seenCal = false;
    var calIo = new IntersectionObserver(function (en) {
      if (!seenCal && en.some(function (x) { return x.isIntersecting; })) { seenCal = true; track('cal_view'); calIo.disconnect(); }
    }, { threshold: 0.3 });
    calIo.observe(host);
  }

  load(false);
})();
