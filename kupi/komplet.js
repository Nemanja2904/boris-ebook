/*
 * Ostatak kompleta (checkout i druga šansa na hvala strani). Komplet su Recept, Kontent mašina i video Trik za 19,99 €.
 * Prikazuje se samo ono što kupac nema; stavka sa gift: true je poklon. Komplet nikad nije unapred izabran,
 * osim kad je kupac na landingu sam kliknuo "Uzmi komplet" (?komplet=1, to rešava checkout).
 * Cene i nazivi dolaze sa servera; ova skripta samo crta.
 *
 *   var k = Komplet(el, { items: [{id, name, tagline, alone, gift}], price, bundle: {total, regular, savings, current},
 *                         reason: '...', onAdd: fn, onRemove: fn | null });
 *   k.set(true|false)   // dodat ili ne (posle odgovora servera, ili odmah na checkoutu)
 *   k.busy(true|false)  // dugme dok traje plaćanje druge šanse
 *   o.payButton = true: dugme je plaćanje (hvala strana), žuto kao Plati
 *   o.mini = { why }: jedan red sa kvadratićem (checkout)
 *   o.labels = { headOff, headOn, on } menja tekst (hvala strana: "kupljeno" umesto "u korpi")
 */
(function () {
  'use strict';

  function eur(c) { var v = c / 100; return (v % 1 === 0 ? String(v) : v.toFixed(2).replace('.', ',')) + '\u00a0€'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // Slika proizvoda: Recept je Borisova naslovna; sveska je korica od sesije B (/kupi/korica-sveske.png),
  // a dok je nema, tipografska pločica.
  function img(id, name) {
    if (id === 'recept') return '<div class="cover"><img src="/recept-za-viralan-video/assets/boris-cover.jpg" alt=""></div>';
    if (id === 'trik') return '<div class="cover"><img src="/trik/img/korica.jpg" alt=""></div>';
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
      '<div class="kl now"><span>Sada, uz ono što imaš</span><b>' + eur(c.bundle) + '</b></div>';
  }

  var CHECK = '<svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7.4l2.6 2.6L11 4.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  window.Komplet = function (el, o) {
    var added = false;
    var L = o.labels || { headOff: 'Uzmi ceo komplet', headOn: 'Ceo komplet je u korpi', on: 'Dodato u korpu' };
    var main = o.items[0];

    // Jedan red (checkout): cilj je da mejl, zbir i kartica stanu visoko na telefonu.
    if (o.mini) {
      el.className = 'kit mini';
      el.innerHTML = '<button type="button" class="kc" data-k="kc" aria-pressed="false"><span class="kc-box">' + CHECK.replace(/12/g, '14') + '</span>' +
        img(main.id, main.name) + '<span><b>Ceo komplet za <em>' + eur(o.bundle.total) + '</em> <s>redovno ' + eur(o.bundle.regular) + '</s></b><small>' + esc(o.mini.why) + '</small></span></button>';
      var kc = el.querySelector('[data-k="kc"]');
      kc.addEventListener('click', function () { if (added) { if (o.onRemove) o.onRemove(); } else if (o.onAdd) o.onAdd(); });
      return {
        el: el,
        set: function (v) { added = !!v; el.classList.toggle('is-on', added); kc.setAttribute('aria-pressed', added ? 'true' : 'false'); },
        busy: function () {}
      };
    }

    el.className = 'kit';
    el.innerHTML =
      '<div class="kit-head" data-k="head"></div>' +
      o.items.map(function (i) {
        return '<div class="part">' + img(i.id, i.name) +
          '<div class="part-txt"><div class="part-no">' + esc(i.tagline || '') + '</div><div class="part-name">' + esc(i.name) + '</div>' +
          '<div class="part-pr">' + (i.gift ? '<b>poklon</b> <s>' + eur(i.alone) + '</s>' : 'posebno ' + eur(i.alone)) + '</div>' +
          '<div class="part-st" data-st>' + CHECK + ' ' + esc(L.on) + '</div></div></div>';
      }).join('') +
      (o.reason ? '<p class="kit-why">' + esc(o.reason) + '</p>' : '') +
      (o.chain ? '<div class="kit-prices" data-k="prices">' + chainHtml(o.chain) + '</div>' : '') +
      '<button type="button" class="btn-add' + (o.payButton ? ' pay' : '') + '" data-k="add">Dodaj za ' + eur(o.price) + '</button>';

    var q = function (k) { return el.querySelector('[data-k="' + k + '"]'); };

    function draw() {
      el.classList.toggle('is-on', added);
      Array.prototype.forEach.call(el.querySelectorAll('[data-st]'), function (n) { n.hidden = !added; });
      Array.prototype.forEach.call(el.querySelectorAll('.part-pr'), function (n) { n.hidden = added; });
      q('head').textContent = added ? L.headOn : L.headOff;
      q('add').hidden = added;
      if (q('prices')) q('prices').hidden = added;
    }

    q('add').addEventListener('click', function () { if (o.onAdd) o.onAdd(); });
    draw();

    return {
      el: el,
      set: function (v) { added = !!v; draw(); },
      busy: function (on, label) {
        var b = q('add');
        b.disabled = !!on;
        b.innerHTML = on ? '<span class="spin dark"></span>' : (label || 'Dodaj za ' + eur(o.price));
      }
    };
  };
})();
