// BenSync site interactivity: the homepage hero "sync sweep" and the contact form.
(function () {
  'use strict';

  // --- Homepage hero: staggered fade-in (CSS), then a looping highlight sweep ---
  function initHeroSweep() {
    var items = document.querySelectorAll('[data-hero-item]');
    if (!items.length) return;
    var bill = document.getElementById('hero-bill');
    var tick = -1;

    setInterval(function () {
      tick = (tick + 1) % 10;
      items.forEach(function (el, i) {
        var active = tick === i;
        var dot = el.querySelector('[data-hero-dot]');
        var label = el.querySelector('[data-hero-label]');
        el.style.background = active ? '#E8F3ED' : '#F6F8F7';
        el.style.borderColor = active ? 'rgba(31,138,91,.45)' : 'rgba(15,42,71,.06)';
        el.style.transform = active ? 'translateY(-2px)' : 'none';
        if (label) label.style.color = active ? '#16714A' : '#16385C';
        if (dot) dot.style.boxShadow = active
          ? '0 0 0 4px rgba(31,138,91,.18)'
          : '0 0 0 0 rgba(31,138,91,0)';
      });
      if (bill) {
        var billActive = tick === 8;
        bill.style.color = billActive ? '#1F8A5B' : '#0F2A47';
        bill.style.transform = billActive ? 'scale(1.25)' : 'scale(1)';
      }
    }, 1000);
  }

  // --- Contact form: "Who are you?" adapts placeholders; submit shows confirmation ---
  function initContactForm() {
    var who = document.getElementById('contact-who');
    var org = document.getElementById('contact-org');
    var msg = document.getElementById('contact-msg');
    var form = document.getElementById('contact-form');
    var sent = document.getElementById('contact-sent');
    var send = document.getElementById('contact-send');
    if (!who && !send) return;

    var orgP = ['Company name', 'Agency name', 'Employer name'];
    var msgP = [
      'What would you like help with?',
      'Tell us about your book of business.',
      'What do you need help with?'
    ];

    if (who) {
      who.addEventListener('change', function () {
        var i = who.selectedIndex;
        if (org) org.placeholder = orgP[i];
        if (msg) msg.placeholder = msgP[i];
      });
    }

    if (send) {
      send.addEventListener('click', function (e) {
        e.preventDefault();
        if (form) form.style.display = 'none';
        if (sent) sent.style.display = 'flex';
      });
    }
  }

  // --- Mobile nav: hamburger toggle for the sticky header ---
  function initNavToggle() {
    var toggles = document.querySelectorAll('.nav-toggle');

    toggles.forEach(function (btn) {
      var header = btn.closest('header');
      var nav = header ? header.querySelector('nav') : null;
      var menuIcon = btn.querySelector('[data-icon-menu]');
      var closeIcon = btn.querySelector('[data-icon-close]');
      if (!header || !nav) return;

      function setOpen(open) {
        header.classList.toggle('nav-open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (menuIcon) menuIcon.style.display = open ? 'none' : 'block';
        if (closeIcon) closeIcon.style.display = open ? 'block' : 'none';
      }

      btn.addEventListener('click', function () {
        setOpen(!header.classList.contains('nav-open'));
      });

      nav.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () { setOpen(false); });
      });

      window.addEventListener('resize', function () {
        if (window.innerWidth > 860) setOpen(false);
      });
    });
  }

  function init() {
    initHeroSweep();
    initContactForm();
    initNavToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
