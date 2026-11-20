/*
 * Praćenje Borisovog shopa (borisprproj.com). Ubacuje se na kraj strane:
 *   <body data-p="recept">            landing Recepta (ili data-p="upiti" za svesku)
 *   <body data-site="saradnja">       landing za pozive: posetioci se broje odvojeno od shopa (ADS → Besplatan poziv)
 *   <section data-section="cena">     sekcije koje merimo (koliko ljudi stigne do njih)
 *   <script src="/shop/track.js" defer></script>
 *
 * Šta radi sam:
 *  - sid po browseru (localStorage), prvi izvor posete (čuva se zauvek) i poslednji (ceo skup iz poslednje adrese sa utm/fbclid),
 *  - Meta Pixel 4374976512714502 (ako ga strana već nema): PageView, a na landingu i ViewContent,
 *    uz optOut ESTRuleEngine (lažni Purchase iz codeless pravila na drugom nalogu),
 *  - lp_view, skrol 25/50/75/100, sekcije na ekranu, napuštanje taba,
 *  - linkovima ka /kupi/ dodaje poslednji skup utm i fbclid (tačno taj, bez mešanja) i beleži klik ('cta').
 * Izlaže window.shopTrack(type, value, opts) i shopTrack.pixel(event, params, eventID).
 * Strane sa data-page="checkout" ili "hvala" ne dobijaju automatski lp_view ni ViewContent (rade ih same).
 * Server: webapp/src/app/api/public/shop/event/route.ts
 */
(function () {
  'use strict';
  if (window.shopTrack) return;

  var PIXEL_ID = '4374976512714502';
  var API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:3000' : 'https://edgecut.app';
  var T0 = Date.now();
  var body = document.body;
  // Sajt: shop (ebooks) ili saradnja (pozivi). Svaki ima svog posetioca, da se brojke ne mešaju.
  var site = (body && body.getAttribute('data-site')) === 'saradnja' ? 'saradnja' : 'shop';
  var SUFFIX = site === 'shop' ? '' : '_' + site;
  var SID_KEY = 'shop_sid' + SUFFIX;
  var ATTR_KEY = 'shop_attr' + SUFFIX;
  var page = (body && body.getAttribute('data-page')) || 'lp';
  var product = body && body.getAttribute('data-p');

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privatni prozor */ } }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  var sid = lsGet(SID_KEY);
  if (!sid || !/^[0-9a-f-]{36}$/i.test(sid)) { sid = uuid(); lsSet(SID_KEY, sid); }

  /*
   * Izvor posete. Pravilo (isto kao webapp/src/lib/shop/attribution.ts):
   *  - poslednji dodir je CEO skup utm_* i fbclid iz jedne adrese: ako trenutna adresa ima bilo koji od njih,
   *    poslednji dodir je tačno taj skup i ništa iz ranije posete; ako nema nijedan, ostaje poslednji sačuvan skup,
   *  - prvi dodir se pamti posebno i nikad ne ide na linkove ka /kupi/.
   * Mešanje (utm_source iz nove posete + utm_content iz stare) bi kupovinu pripisalo pogrešnom oglasu.
   */
  var qs = new URLSearchParams(location.search);
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
  var LAST_KEY = 'shop_last' + SUFFIX;
  function touchOf(src, get) {
    var t = {};
    UTM.forEach(function (k) { var v = get ? src.get(k) : src && src[k]; if (v) t[k] = String(v).slice(0, 500); });
    return t;
  }
  function hasTouch(t) { return Object.keys(t).length > 0; }
  var current = touchOf(qs, true);
  if (current.fbclid) current.fbc = 'fb.1.' + T0 + '.' + current.fbclid;

  // Prvi dodir: čuva se samo prvi put, kasnije posete ga ne prepisuju.
  var attr = null;
  try { attr = JSON.parse(lsGet(ATTR_KEY) || 'null'); } catch (e) { attr = null; }
  if (!attr) {
    attr = { landing_url: location.href.slice(0, 1000), referrer: document.referrer || null, query: {} };
    qs.forEach(function (v, k) { if (Object.keys(attr.query).length < 30) attr.query[k] = String(v).slice(0, 300); });
    for (var ck in current) attr[ck] = current[ck];
    lsSet(ATTR_KEY, JSON.stringify(attr));
  }

  // Poslednji dodir: trenutna adresa kao celina, inače poslednji sačuvan skup (stari browser bez njega: prvi dodir).
  var last = null;
  try { last = JSON.parse(lsGet(LAST_KEY) || 'null'); } catch (e) { last = null; }
  if (hasTouch(current)) {
    last = current;
    lsSet(LAST_KEY, JSON.stringify(last));
  } else if (!last) {
    last = touchOf(attr, false);
    if (attr.fbc) last.fbc = attr.fbc;
  }

  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function fullAttr() {
    var a = {
      first: touchOf(attr, false),
      last: touchOf(last, false),
      landing_url: attr.landing_url || null,
      referrer: attr.referrer || null,
      query: attr.query || null
    };
    a.fbp = cookie('_fbp');
    a.fbc = cookie('_fbc') || last.fbc || attr.fbc || null;
    a.screen = (window.screen && screen.width + 'x' + screen.height) || null;
    a.language = navigator.language || null;
    return a;
  }

  function send(payload, beacon) {
    var json = JSON.stringify(payload);
    try {
      if (beacon && navigator.sendBeacon && navigator.sendBeacon(API + '/api/public/shop/event', new Blob([json], { type: 'text/plain' }))) return;
      fetch(API + '/api/public/shop/event', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: json, keepalive: true }).catch(function () {});
    } catch (e) { /* praćenje nikad ne ruši stranu */ }
  }

  function shopTrack(type, value, opts) {
    opts = opts || {};
    send({
      sid: sid,
      site: site,
      type: type,
      // data-p se čita pri svakom pozivu: checkout ga postavlja tek kad pročita ?p= iz linka.
      p: opts.p || (document.body && document.body.getAttribute('data-p')) || product || undefined,
      page: opts.page || page,
      order: opts.order || undefined,
      value: value && typeof value === 'object' ? value : value === undefined ? undefined : { v: value },
      ms: Date.now() - T0,
      attr: fullAttr(),
    }, !!opts.beacon);
  }

  /* ---------- Meta Pixel ---------- */
  if (!window.fbq) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
    s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', PIXEL_ID);
    window.fbq('optOut', PIXEL_ID, 'ESTRuleEngine');
    window.fbq('track', 'PageView');
  }

  function pixel(event, params, eventID) {
    try {
      if (eventID) window.fbq('track', event, params || {}, { eventID: eventID });
      else window.fbq('track', event, params || {});
    } catch (e) { /* bez Pixela */ }
  }

  shopTrack.sid = sid;
  shopTrack.site = site;

  /* ---------- Microsoft Clarity (snimci sesija i heatmape) ----------
   * Uključuje se upisom ID-ja projekta ispod. Priručnik (/sveska/) ga nema: to su kupčevi odgovori.
   * Kartica je u Stripe iframe-u, Clarity je ne vidi; polja forme Clarity maskira sam.
   * Sesija nosi naš sid, pa se snimak nađe po posetiocu iz Ebooks admina (Clarity filter: Custom tag sid). */
  var CLARITY_ID = 'zf378qm3nd';
  if (CLARITY_ID && !window.clarity) {
    /* eslint-disable */
    (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,'clarity','script',CLARITY_ID);
    /* eslint-enable */
    // Sve što posetilac kuca (mejl na checkoutu) je maskirano u snimku, bez obzira na Clarity podešavanje.
    var maskInputs = function () { Array.prototype.forEach.call(document.querySelectorAll('input, textarea, select'), function (el) { el.setAttribute('data-clarity-mask', 'true'); }); };
    maskInputs();
    document.addEventListener('DOMContentLoaded', maskInputs);
    try {
      window.clarity('set', 'sid', sid);
      window.clarity('set', 'strana', page);
      window.clarity('set', 'sajt', site);
      if (product) window.clarity('set', 'proizvod', product);
    } catch (e) { /* bez Clarity-ja */ }
  }
  shopTrack.attr = fullAttr;
  shopTrack.pixel = pixel;
  shopTrack.api = API;
  window.shopTrack = shopTrack;

  /* ---------- linkovi ka checkoutu ---------- */
  function decorate(a) {
    try {
      var u = new URL(a.getAttribute('href'), location.href);
      if (u.origin !== location.origin || u.pathname.indexOf('/kupi/') !== 0) return;
      // Na link ide tačno poslednji skup: ključevi kojih u njemu nema se brišu, da se ništa ne pomeša.
      UTM.forEach(function (k) { if (last[k]) u.searchParams.set(k, last[k]); else u.searchParams.delete(k); });
      a.setAttribute('href', u.pathname + u.search + u.hash);
      if (!a.__shop) {
        a.__shop = 1;
        a.addEventListener('click', function () {
          shopTrack('cta', { cta: a.getAttribute('data-cta') || null, href: u.pathname + u.search }, { p: u.searchParams.get('p') || product, beacon: true });
        });
      }
    } catch (e) { /* loš href */ }
  }
  Array.prototype.forEach.call(document.querySelectorAll('a[href*="/kupi/"]'), decorate);

  // Podstrane landinga za pozive (primeri klijenata): poseta se beleži, levak landinga ne.
  if (site !== 'shop' && page !== 'lp') shopTrack('page_view', { page: page });
  if (page !== 'lp') return;

  /* ---------- landing ---------- */
  shopTrack('lp_view', { title: document.title.slice(0, 120) });
  if (product) pixel('ViewContent', { content_ids: [product], content_type: 'product' });

  var marks = [25, 50, 75, 100];
  var hit = {};
  function onScroll() {
    var doc = document.documentElement;
    var max = Math.max(1, doc.scrollHeight - window.innerHeight);
    var pct = Math.min(100, Math.round((window.scrollY / max) * 100));
    marks.forEach(function (m) {
      if (pct >= m && !hit[m]) { hit[m] = 1; shopTrack('scroll', { pct: m }); }
    });
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    setTimeout(function () { ticking = false; onScroll(); }, 250);
  }, { passive: true });

  var sections = document.querySelectorAll('[data-section]');
  if (sections.length && 'IntersectionObserver' in window) {
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var name = e.target.getAttribute('data-section');
        if (e.isIntersecting && !seen[name]) {
          seen[name] = 1;
          shopTrack('section', { name: String(name).slice(0, 40) });
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.35 });
    Array.prototype.forEach.call(sections, function (s) { io.observe(s); });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') shopTrack('hidden', { scroll: Object.keys(hit).length ? Math.max.apply(null, Object.keys(hit).map(Number)) : 0 }, { beacon: true });
  });
})();
