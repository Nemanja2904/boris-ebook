/*
 * Ponuda drugog dela kompleta (checkout i druga šansa na hvala strani).
 * Deo 1 "Pregledi" = Recept, deo 2 "Upiti" = Kontent mašina. Prikazuje se samo deo koji kupac nema,
 * sa tri cene jedna ispod druge i dugmetom "Dodaj za X €". Komplet nikad nije unapred izabran.
 * Cene i nazivi dolaze sa servera; ova skripta samo crta.
 *
 *   var k = Komplet(el, { have: 'recept', names: {recept, upiti}, price, regular, bundle: {total, regular, savings},
 *                         reason: '...', onAdd: fn, onRemove: fn | null, removable: true });
 *   k.set(true|false)   // dodat ili ne (posle odgovora servera, ili odmah na checkoutu)
 *   k.busy(true|false)  // dugme dok traje plaćanje druge šanse
 *   o.payButton = true: dugme je plaćanje (hvala strana), žuto kao Plati
 *   o.mini = { name, why }: jedan red sa kvadratićem (checkout)
 *   o.labels = { headOff, headOn, on } menja tekst (hvala strana: "kupljeno" umesto "u korpi")
 */
(function () {
  'use strict';

  var PARTS = [
    { id: 'recept', no: 'Deo 1 · Pregledi' },
    { id: 'upiti', no: 'Deo 2 · Upiti' }
  ];

  function eur(c) { var v = c / 100; return (v % 1 === 0 ? String(v) : v.toFixed(2).replace('.', ',')) + '\u00a0€'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // Slika proizvoda: Recept je Borisova naslovna; sveska je korica od sesije B (/kupi/korica-sveske.png),
  // a dok je nema, tipografska pločica.
  function img(id, name) {
    if (id === 'recept') return '<div class="cover"><img src="/recept-za-viralan-video/assets/boris-cover.jpg" alt=""></div>';
    if (id === 'konsultacija') return '<div class="cover type"><span>1 na 1 · 60 min</span><b>Plan za 90 dana</b></div>';
    return '<div class="cover"><img src="/kupi/korica-sveske.png" alt="" onerror="this.parentNode.className=\'cover type\';this.parentNode.innerHTML=\'<span>Interaktivni priručnik</span><b>' +
      esc(name).replace(/'/g, '&#39;') + '</b>\'"></div>';
  }
  window.komplet_cover = img;

  // Cene dela koji fali, jedna ispod druge: redovna, uvodna, u kompletu. Poslednja je krupna i žuta.
  // Precrtane su obe cene koje se u kompletu ne plaćaju. Redovna se precrtava samo ako je stvarno važila
  // (soldAtRegular; za oba proizvoda potvrdio vlasnik 15.11.2026).
  function chainHtml(c) {
    var reg = c.soldAtRegular ? '<s>' + eur(c.regular) + '</s>' : '<span>' + eur(c.regular) + '</span>';
    return '<div class="kl"><span>Redovna cena</span>' + reg + '</div>' +
      '<div class="kl"><span>Uvodna cena</span><s>' + eur(c.intro) + '</s></div>' +
      '<div class="kl now"><span>U kompletu</span><b>' + eur(c.bundle) + '</b></div>';
  }

  // Prikazuje se samo deo koji kupac NEMA: ono što kupuje već stoji iznad (checkout) ili ga je platio (hvala).
  window.Komplet = function (el, o) {
    var added = false;
    var L = o.labels || {
      headOff: 'Dodaj i drugi deo kompleta',
      headOn: 'Oba dela su u korpi',
      on: 'Dodato u korpu'
    };
    var missing = o.have === 'recept' ? 'upiti' : 'recept';
    var part = PARTS.filter(function (p) { return p.id === missing; })[0];

    // Jedan red (checkout): cilj je da mejl, zbir i kartica stanu visoko na telefonu. Komplet ni ovde nije unapred izabran.
    if (o.mini) {
      el.className = 'kit mini';
      el.innerHTML = '<button type="button" class="kc" data-k="kc" aria-pressed="false"><span class="kc-box"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7.4l2.6 2.6L11 4.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
        img(missing, o.names[missing]) + '<span><b>Dodaj ' + esc(o.mini.name) + ' za <em>' + eur(o.price) + '</em> <s>redovno ' + eur((o.chain && o.chain.soldAtRegular && o.chain.regular) || o.regular) + '</s></b><small>' + esc(o.mini.why) + '</small></span></button>';
      var kc = el.querySelector('[data-k="kc"]');
      kc.addEventListener('click', function () { if (added) { if (o.onRemove) o.onRemove(); } else if (o.onAdd) o.onAdd(); });
      return {
        el: el,
        missing: missing,
        set: function (v) { added = !!v; el.classList.toggle('is-on', added); kc.setAttribute('aria-pressed', added ? 'true' : 'false'); },
        busy: function () {}
      };
    }

    el.className = 'kit';
    el.innerHTML =
      '<div class="kit-head" data-k="head"></div>' +
      '<div class="part">' + img(missing, o.names[missing]) +
        '<div class="part-txt"><div class="part-no">' + part.no + '</div><div class="part-name">' + esc(o.names[missing]) + '</div>' +
        '<div class="part-st" data-k="st"><svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7.4l2.6 2.6L11 4.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + esc(L.on) + '</div></div></div>' +
      (o.reason ? '<p class="kit-why">' + esc(o.reason) + '</p>' : '') +
      (o.chain ? '<div class="kit-prices" data-k="prices">' + chainHtml(o.chain) + '</div>' : '') +
      '<button type="button" class="btn-add' + (o.payButton ? ' pay' : '') + '" data-k="add">Dodaj za ' + eur(o.price) + '</button>' +
      '<div class="kit-done" data-k="done"><span>Komplet: <span class="price-new">' + eur(o.bundle.total) + '</span> umesto <s>' + eur(o.bundle.regular) + '</s>, <span class="price-new">' + eur(o.bundle.savings) + ' manje</span></span>' +
      (o.removable ? ' <button type="button" class="kit-remove" data-k="remove">Ukloni</button>' : '') + '</div>';

    var q = function (k) { return el.querySelector('[data-k="' + k + '"]'); };

    function draw() {
      el.classList.toggle('is-on', added);
      q('st').hidden = !added;
      q('head').textContent = added ? L.headOn : L.headOff;
      q('add').hidden = added;
      if (q('prices')) q('prices').hidden = added;
      q('done').hidden = !added;
      q('add').setAttribute('aria-pressed', 'false');
    }

    q('add').addEventListener('click', function () { if (o.onAdd) o.onAdd(); });
    if (q('remove')) q('remove').addEventListener('click', function () { if (o.onRemove) o.onRemove(); });
    draw();

    return {
      el: el,
      missing: missing,
      set: function (v) { added = !!v; draw(); },
      busy: function (on, label) {
        var b = q('add');
        b.disabled = !!on;
        b.innerHTML = on ? '<span class="spin dark"></span>' : (label || 'Dodaj za ' + eur(o.price));
      }
    };
  };
})();
