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

  // --- Shared submit: POST to the real contact endpoint ---
  function submitInquiry(payload, onOk, onErr) {
    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.ok) return onOk();
      return res.json().then(function (b) {
        onErr((b && b.message) || 'Something went wrong. Please email support@bensync.com.');
      }).catch(function () {
        onErr('Something went wrong. Please email support@bensync.com.');
      });
    }).catch(function () {
      onErr('Something went wrong. Please email support@bensync.com.');
    });
  }

  // --- Contact page form: adapts placeholders, submits for real ---
  function initContactForm() {
    var who = document.getElementById('contact-who');
    var org = document.getElementById('contact-org');
    var msg = document.getElementById('contact-msg');
    var form = document.getElementById('contact-form');
    var sent = document.getElementById('contact-sent');
    var send = document.getElementById('contact-send');
    if (!who && !send) return;

    var name = form ? form.querySelector('input[placeholder="Your name"]') : null;
    var email = form ? form.querySelector('input[type="email"]') : null;

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
        var role = who ? who.value : '';
        var payload = {
          name: name && name.value ? name.value : '',
          email: email && email.value ? email.value : '',
          company: org && org.value ? org.value : '',
          message: ((role ? 'Role: ' + role + '. ' : '') + (msg && msg.value ? msg.value : '')).trim(),
          website: ''
        };
        send.disabled = true;
        submitInquiry(payload, function () {
          if (form) form.style.display = 'none';
          if (sent) sent.style.display = 'flex';
        }, function (message) {
          send.disabled = false;
          window.alert(message);
        });
      });
    }
  }

  // --- Site-wide quote popup: every /contact CTA opens one shared form ---
  function initQuoteModal() {
    // The contact page keeps its own inline form.
    if (document.getElementById('contact-form')) return;
    var links = document.querySelectorAll('a[href="/contact"]');
    if (!links.length) return;

    var wrap = document.createElement('div');
    wrap.id = 'quote-modal';
    wrap.style.cssText = 'display:none;position:fixed;inset:0;z-index:100;';
    wrap.innerHTML =
      '<div data-qm-overlay style="position:absolute;inset:0;background:rgba(15,42,71,.55);"></div>' +
      '<div role="dialog" aria-modal="true" aria-labelledby="qm-title" style="position:relative;max-width:470px;margin:7vh auto 24px;background:#ffffff;border-radius:18px;padding:28px;box-shadow:0 30px 70px -30px rgba(15,42,71,.5);display:flex;flex-direction:column;gap:12px;max-height:84vh;overflow:auto;box-sizing:border-box;width:calc(100% - 32px);">' +
        '<button type="button" data-qm-close aria-label="Close" style="position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:8px;border:1px solid rgba(15,42,71,.14);background:#ffffff;cursor:pointer;font-size:16px;color:#0F2A47;line-height:1;">&#10005;</button>' +
        '<span id="qm-title" style="font-family:\'Sora\',sans-serif;font-size:20px;font-weight:700;letter-spacing:-.01em;color:#0F2A47;">Get A Quote</span>' +
        '<p style="font-size:14px;line-height:1.6;color:#47586B;margin:0;">Tell us about your group and the right person will follow up within one business day.</p>' +
        '<div id="qm-form" style="display:flex;flex-direction:column;gap:10px;">' +
          '<input id="qm-name" placeholder="Your name" style="border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:12px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;font-family:inherit;">' +
          '<input id="qm-email" type="email" placeholder="Work email" style="border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:12px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;font-family:inherit;">' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
            '<input id="qm-company" placeholder="Company or agency" style="min-width:0;border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:12px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;font-family:inherit;">' +
            '<input id="qm-employees" placeholder="# of employees" style="min-width:0;border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:12px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;font-family:inherit;">' +
          '</div>' +
          '<textarea id="qm-message" placeholder="What would you like help with?" rows="3" style="border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:12px 14px;font-size:14px;color:#0F2A47;outline:none;resize:vertical;background:#ffffff;font-family:inherit;"></textarea>' +
          '<input id="qm-website" tabindex="-1" autocomplete="off" style="display:none;">' +
          '<button id="qm-send" type="button" class="btn-green" style="border:none;cursor:pointer;background:#1F8A5B;color:#ffffff;border-radius:10px;padding:14px;font-family:\'Manrope\',sans-serif;font-size:14.5px;font-weight:700;">Send Request</button>' +
          '<span id="qm-error" style="display:none;font-size:12.5px;color:#B4483E;text-align:center;"></span>' +
        '</div>' +
        '<div id="qm-sent" style="display:none;flex-direction:column;gap:8px;background:#E8F3ED;border:1px solid rgba(31,138,91,.3);border-radius:12px;padding:20px;">' +
          '<span style="font-family:\'Sora\',sans-serif;font-size:15.5px;font-weight:700;color:#16714A;">Request received.</span>' +
          '<span style="font-size:13.5px;line-height:1.6;color:#3B5A4C;">Thanks for reaching out. The right person will follow up within one business day.</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    function open() {
      wrap.style.display = 'block';
      document.body.style.overflow = 'hidden';
      var first = document.getElementById('qm-name');
      if (first) first.focus();
    }
    function close() {
      wrap.style.display = 'none';
      document.body.style.overflow = '';
    }

    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        open();
      });
    });
    wrap.querySelector('[data-qm-overlay]').addEventListener('click', close);
    wrap.querySelector('[data-qm-close]').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && wrap.style.display === 'block') close();
    });

    var send = document.getElementById('qm-send');
    var error = document.getElementById('qm-error');
    send.addEventListener('click', function () {
      var val = function (id) {
        var el = document.getElementById(id);
        return el && el.value ? el.value.trim() : '';
      };
      error.style.display = 'none';
      var payload = {
        name: val('qm-name'),
        email: val('qm-email'),
        company: val('qm-company'),
        employees: val('qm-employees'),
        message: val('qm-message'),
        website: val('qm-website')
      };
      if (!payload.name || !payload.email || !payload.company) {
        error.textContent = 'Please fill in your name, email, and company.';
        error.style.display = 'block';
        return;
      }
      send.disabled = true;
      submitInquiry(payload, function () {
        document.getElementById('qm-form').style.display = 'none';
        document.getElementById('qm-sent').style.display = 'flex';
      }, function (message) {
        send.disabled = false;
        error.textContent = message;
        error.style.display = 'block';
      });
    });
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

  // --- "Who It's For" dropdown: click to open, outside click / Escape closes ---
  function initNavDropdown() {
    var drops = document.querySelectorAll('.nav-drop');
    if (!drops.length) return;
    drops.forEach(function (drop) {
      var btn = drop.querySelector('.nav-drop-btn');
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        drop.classList.toggle('open');
        btn.setAttribute('aria-expanded', drop.classList.contains('open') ? 'true' : 'false');
      });
    });
    document.addEventListener('click', function (e) {
      drops.forEach(function (drop) {
        if (!drop.contains(e.target)) drop.classList.remove('open');
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        drops.forEach(function (drop) { drop.classList.remove('open'); });
      }
    });
  }

  function init() {
    initHeroSweep();
    initContactForm();
    initQuoteModal();
    initNavToggle();
    initNavDropdown();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
