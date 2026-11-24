/*
 * Zajedničko za /saradnja i podstrane: donja traka sa dugmetom (telefon) i praćenje klikova na dugmad.
 * Popup otvara /kalendar/kalendar.js (data-popup) na svaki <a href="#poziv">.
 * Traka se vidi uvek kad na ekranu nema nijednog drugog dugmeta za poziv ni kalendara, pa je put do poziva uvek na ekranu.
 */
(function () {
  'use strict';
  var bar = document.getElementById('bar');
  var links = Array.prototype.slice.call(document.querySelectorAll('a[href="#poziv"]'));
  links.forEach(function (a) {
    if (a.getAttribute('data-gde')) return;
    var sec = a.closest('[data-section]');
    a.setAttribute('data-gde', a.closest('header') ? 'meni' : a.closest('#bar') ? 'traka' : a.classList.contains('pk') ? 'izbor' : sec ? sec.getAttribute('data-section') : 'strana');
  });

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a || !window.shopTrack) return;
    if (a.getAttribute('href') === '#poziv') window.shopTrack('cta', { gde: a.getAttribute('data-gde') });
    if (a.classList.contains('pk')) {
      var h = a.querySelector('h3');
      window.shopTrack('pick', { title: (h ? h.textContent : a.textContent).trim().slice(0, 80) }, { beacon: true });
    }
  });

  if (!bar) return;
  function show(on) {
    bar.classList.toggle('on', on);
    bar.setAttribute('aria-hidden', on ? 'false' : 'true');
    bar.querySelector('a').tabIndex = on ? 0 : -1;
  }
  if (!('IntersectionObserver' in window)) { show(true); return; }
  var seen = [];
  var targets = links.filter(function (a) { return !a.closest('header') && !a.closest('#bar'); });
  var cal = document.querySelector('.cal-card'); // kartica, ne sam kalendar: on se seli u popup
  if (cal) targets.push(cal);
  var io = new IntersectionObserver(function (en) {
    en.forEach(function (x) {
      var i = seen.indexOf(x.target);
      if (x.isIntersecting && i < 0) seen.push(x.target);
      if (!x.isIntersecting && i > -1) seen.splice(i, 1);
    });
    show(!seen.length);
  }, { rootMargin: '-60px 0px -8px 0px' });
  targets.forEach(function (t) { io.observe(t); });
})();
