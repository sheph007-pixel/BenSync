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
        if (dot) dot.style.color = active ? '#16714A' : '#1F8A5B';
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
    var send = document.getElementById('contact-send');
    if (!send) return;
    var who = document.getElementById('contact-who');
    var form = document.getElementById('contact-form');
    var sent = document.getElementById('contact-sent');
    var error = document.getElementById('contact-error');
    var fields = {
      name: document.getElementById('contact-name'),
      email: document.getElementById('contact-email'),
      phone: document.getElementById('contact-phone'),
      org: document.getElementById('contact-org'),
      msg: document.getElementById('contact-msg')
    };

    send.addEventListener('click', function (e) {
      e.preventDefault();
      if (error) error.style.display = 'none';
      var missing = false;
      ['name', 'email', 'phone', 'org', 'msg'].forEach(function (k) {
        var el = fields[k];
        if (!el) return;
        var ok = el.value.trim().length > 0;
        if (k === 'email' && ok) ok = /.+@.+\..+/.test(el.value.trim());
        el.style.borderColor = ok ? 'rgba(15,42,71,.14)' : '#B4483E';
        if (!ok) missing = true;
      });
      if (missing) {
        if (error) {
          error.textContent = 'Please fill in every field.';
          error.style.display = 'block';
        }
        return;
      }
      var role = who ? who.value : '';
      var payload = {
        name: fields.name.value.trim(),
        email: fields.email.value.trim(),
        phone: fields.phone.value.trim(),
        company: fields.org.value.trim(),
        message: ((role ? 'Role: ' + role + '. ' : '') + fields.msg.value.trim()).trim(),
        website: ''
      };
      send.disabled = true;
      submitInquiry(payload, function () {
        if (form) form.style.display = 'none';
        if (sent) sent.style.display = 'flex';
      }, function (message) {
        send.disabled = false;
        if (error) {
          error.textContent = message;
          error.style.display = 'block';
        }
      });
    });
  }

  // --- Partner popup: only "Get Started" CTAs open it. Contact Us and
  // other /contact links go to the general contact form, which fields
  // brokers, employers, and members. The program is broker-controlled:
  // employers ask their broker, members ask HR.
  function initQuoteModal() {
    var links = [];
    document.querySelectorAll('a[href="/contact"]').forEach(function (a) {
      if (a.textContent.trim() === 'Get Started') links.push(a);
    });
    if (!links.length) return;

    var wrap = document.createElement('div');
    wrap.id = 'quote-modal';
    wrap.style.cssText = 'display:none;position:fixed;inset:0;z-index:100;';
    wrap.innerHTML =
      '<div data-qm-overlay style="position:absolute;inset:0;background:rgba(15,42,71,.55);"></div>' +
      '<div role="dialog" class="qm-dialog" aria-modal="true" aria-labelledby="qm-title" style="position:relative;max-width:470px;margin:7vh auto 24px;background:#ffffff;border-radius:18px;padding:28px;box-shadow:0 30px 70px -30px rgba(15,42,71,.5);display:flex;flex-direction:column;gap:12px;max-height:84vh;overflow:auto;box-sizing:border-box;width:calc(100% - 32px);">' +
        '<button type="button" data-qm-close aria-label="Close" style="position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:8px;border:1px solid rgba(15,42,71,.14);background:#ffffff;cursor:pointer;font-size:16px;color:#0F2A47;line-height:1;">&#10005;</button>' +
        '<span id="qm-title" style="font-family:\'Sora\',sans-serif;font-size:20px;font-weight:700;letter-spacing:-.01em;color:#0F2A47;">Get Started</span>' +
        '<p style="font-size:14px;line-height:1.6;color:#47586B;margin:0;">For brokers and consultants interested in offering BenSync to their clients.</p>' +
        '<div id="qm-form" style="display:flex;flex-direction:column;gap:10px;">' +
          '<input id="qm-name" placeholder="Your name" aria-label="Your name" autocomplete="name" autocapitalize="words" style="border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:12px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;font-family:inherit;">' +
          '<input id="qm-email" type="email" placeholder="Work email" aria-label="Work email" autocomplete="email" inputmode="email" autocapitalize="off" style="border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:12px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;font-family:inherit;">' +
          '<input id="qm-phone" type="tel" placeholder="Phone number" aria-label="Phone number" autocomplete="tel" inputmode="tel" style="border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:12px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;font-family:inherit;">' +
          '<input id="qm-company" placeholder="Company name" aria-label="Company name" autocomplete="organization" autocapitalize="words" style="border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:12px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;font-family:inherit;">' +
          '<textarea id="qm-message" placeholder="Message (optional)" aria-label="Message" rows="3" style="border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:12px 14px;font-size:14px;color:#0F2A47;outline:none;resize:vertical;background:#ffffff;font-family:inherit;"></textarea>' +
          '<input id="qm-website" tabindex="-1" autocomplete="off" style="display:none;">' +
          '<button id="qm-send" type="button" class="btn-green" style="border:none;cursor:pointer;background:#1F8A5B;color:#ffffff;border-radius:10px;padding:14px;font-family:\'Manrope\',sans-serif;font-size:14.5px;font-weight:700;">Send Request</button>' +
          '<span id="qm-error" style="display:none;font-size:12.5px;color:#B4483E;text-align:center;"></span>' +
        '</div>' +
        '<div id="qm-sent" style="display:none;flex-direction:column;gap:8px;background:#E8F3ED;border:1px solid rgba(31,138,91,.3);border-radius:12px;padding:20px;">' +
          '<span style="font-family:\'Sora\',sans-serif;font-size:15.5px;font-weight:700;color:#16714A;">Request received.</span>' +
          '<span style="font-size:13.5px;line-height:1.6;color:#3B5A4C;">Thanks for reaching out. Our team will be in touch.</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    function open() {
      wrap.style.display = 'block';
      document.documentElement.style.overflow = 'hidden';
      var first = document.getElementById('qm-name');
      if (first) first.focus();
    }
    function close() {
      wrap.style.display = 'none';
      document.documentElement.style.overflow = '';
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
        phone: val('qm-phone'),
        company: val('qm-company'),
        message: val('qm-message'),
        website: val('qm-website')
      };
      if (!payload.name || !payload.email || !payload.phone || !payload.company) {
        error.textContent = 'Please fill in your name, email, phone, and company.';
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
        document.documentElement.style.overflow = open ? 'hidden' : '';
      }

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && header.classList.contains('nav-open')) setOpen(false);
      });

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

  // --- Leading-partner assembly (partner-network page) ---------------------
  // Autoplays once when scrolled into view, then stays scrubbable via the
  // range slider. All motion runs through the --p custom property in CSS.
  function initAssembly() {
    var stage = document.querySelector('[data-assemble]');
    if (!stage) return;
    var range = document.querySelector('[data-assemble-range]');

    function setP(v) {
      stage.style.setProperty('--p', String(v));
    }

    if (range) {
      range.addEventListener('input', function () {
        setP(range.value / 100);
      });
    }

    var played = false;
    function play() {
      if (played) return;
      played = true;
      var start = null;
      var dur = 1800;
      function step(ts) {
        if (start === null) start = ts;
        var t = Math.min(1, (ts - start) / dur);
        var e = 1 - Math.pow(1 - t, 3);
        setP(e);
        if (range) range.value = Math.round(e * 100);
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    if ('IntersectionObserver' in window) {
      setP(0);
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            play();
            io.disconnect();
          }
        });
      }, { threshold: 0.35 });
      io.observe(stage);
    } else {
      play();
    }
  }

  // --- Benefits page gate ----------------------------------------------------
  // Plan names are public on the page; the detail values live server-side
  // and are fetched only after the access code is verified, then written
  // into each card. Until then the detail rows are blurred placeholders.
  function initBenefits() {
    var unlock = document.getElementById('bn-unlock');
    if (!unlock) return;
    var codeInput = document.getElementById('bn-code');
    var error = document.getElementById('bn-error');
    var gate = document.getElementById('bn-gate');
    var note = document.getElementById('bn-note');

    function esc(s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    function reveal(data) {
      var byName = {};
      (data.categories || []).forEach(function (cat) {
        (cat.plans || []).forEach(function (p) { byName[p.name] = p; });
      });
      document.querySelectorAll('[data-plan]').forEach(function (card) {
        var plan = byName[card.getAttribute('data-plan')];
        var details = card.querySelector('.bn-details');
        var chip = card.querySelector('.bn-lockchip');
        if (chip) chip.style.display = 'none';
        if (!details) return;
        if (plan && plan.facts && plan.facts.length) {
          var html = '';
          plan.facts.forEach(function (f) {
            html += '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;">';
            html += '<span style="font-size:12px;color:#7A8A99;font-weight:600;">' + esc(f.label) + '</span>';
            html += '<span style="font-size:12.5px;color:#0F2A47;font-weight:700;text-align:right;">' + esc(f.value) + '</span>';
            html += '</div>';
          });
          details.innerHTML = html;
        } else {
          details.innerHTML = '<a href="/portal" style="font-size:12.5px;font-weight:700;">Full summary in the broker portal &#8594;</a>';
        }
        details.classList.remove('bn-locked');
        details.removeAttribute('aria-hidden');
      });
      if (gate) gate.style.display = 'none';
      var portal = document.getElementById('bn-portal');
      if (portal) portal.style.display = 'flex';
      if (note && data.note) {
        note.textContent = data.note;
        note.style.display = 'block';
      }
    }

    function fetchPlans(onLocked) {
      fetch('/api/benefits/plans', { headers: { 'Accept': 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('locked');
          return r.json();
        })
        .then(reveal)
        .catch(function () {
          if (onLocked) onLocked();
        });
    }

    // Already unlocked in this session? Reveal immediately.
    fetchPlans(null);

    function tryUnlock() {
      var code = codeInput && codeInput.value ? codeInput.value.trim() : '';
      if (error) error.style.display = 'none';
      if (!/^\d{4}$/.test(code)) {
        if (error) {
          error.textContent = 'Enter the 4 digit code.';
          error.style.display = 'block';
        }
        return;
      }
      unlock.disabled = true;
      fetch('/api/benefits/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code })
      })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          unlock.disabled = false;
          if (!res.ok) {
            if (error) {
              error.textContent = res.body && res.body.message ? res.body.message : 'That code is not right.';
              error.style.display = 'block';
            }
            return;
          }
          fetchPlans(function () {
            if (error) {
              error.textContent = 'Could not load plan details. Please try again.';
              error.style.display = 'block';
            }
          });
        })
        .catch(function () {
          unlock.disabled = false;
          if (error) {
            error.textContent = 'Could not reach the server. Please try again.';
            error.style.display = 'block';
          }
        });
    }

    unlock.addEventListener('click', tryUnlock);
    if (codeInput) {
      codeInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') tryUnlock();
      });
    }
  }

  // --- Dynamic years ---------------------------------------------------------
  // Keeps age-based copy fresh forever. Elements carry the static current
  // value as fallback text; JS recomputes from the clock:
  //   <span data-years-since="2013">13+</span>  ->  "14+" in 2027, etc.
  //   <span data-current-year>2026</span>       ->  the current year.
  function initDynamicYears() {
    var now = new Date().getFullYear();
    document.querySelectorAll('[data-years-since]').forEach(function (el) {
      var since = parseInt(el.getAttribute('data-years-since'), 10);
      if (since && now > since) el.textContent = (now - since) + '+';
    });
    document.querySelectorAll('[data-current-year]').forEach(function (el) {
      el.textContent = String(now);
    });
  }

  // --- Photo bands -----------------------------------------------------------
  // Slots stay hidden until their file actually exists in /photos/. A HEAD
  // probe decides (lazy images inside hidden containers never fire onload),
  // and the content-type check keeps the SPA's HTML fallback from counting
  // as a photo.
  function initPhotoBands() {
    document.querySelectorAll('[data-photo-band]').forEach(function (band) {
      band.querySelectorAll('img[src^="/photos/"]').forEach(function (img) {
        fetch(img.getAttribute('src'), { method: 'HEAD' })
          .then(function (r) {
            var ct = r.headers.get('content-type') || '';
            if (r.ok && ct.indexOf('image/') === 0) {
              img.parentElement.style.display = '';
              band.style.display = '';
            }
          })
          .catch(function () {});
      });
    });
  }

  function init() {
    initDynamicYears();
    initPhotoBands();
    initHeroSweep();
    initContactForm();
    initQuoteModal();
    initNavToggle();
    initNavDropdown();
    initAssembly();
    initBenefits();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
