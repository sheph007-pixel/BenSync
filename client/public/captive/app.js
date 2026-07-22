/* BenSync Captive Analytics — client SPA.
 * A faithful port of the design prototype (Captive Portal.dc.html): same markup,
 * same inline styles, same business logic (status/flag/tie-out/cash/formatting),
 * but driven by the live API + Postgres instead of a static data file. */
(() => {
  'use strict';
  const root = document.getElementById('root');
  const EM_DASH = '—';

  const state = {
    authed: null, db: null, thr: { lossPct: 50, minLoss: 0 }, notes: {},
    loginErr: '', locked: false, minutes: 0, busy: false,
    page: 'overview', captive: 'all', period: 'ytd', groupCode: null,
    sortKey: 'n', sortDir: 1, search: '', fStatus: 'all', fLR: 'all', chartTable: false,
    from: '2026-1', to: '2026-5', rail: true, tieCap: 'VT', wlTab: 'flagged',
    noteDraft: '', email: '', pw: '', pw2: '', theme: 'light', density: 'comfortable',
    needsSetup: false, setupErr: '',
  };

  /* ------------------------------ formatting ------------------------------ */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function f$(v) { if (v == null) return EM_DASH; const a = Math.round(Math.abs(v)).toLocaleString('en-US'); return v < 0 ? '($' + a + ')' : '$' + a; }
  function fS(v) { if (v == null) return EM_DASH; const a = Math.abs(v); const s = a >= 1e6 ? '$' + (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? '$' + Math.round(a / 1e3) + 'K' : '$' + Math.round(a); return v < 0 ? '(' + s + ')' : s; }
  const lr = (c, p) => (p > 0 ? Math.round((c / p) * 100) : null);
  function lrS(c, p) { const r = lr(c, p); return r == null ? EM_DASH : r.toLocaleString('en-US') + '%'; }
  function lrV(c, p) { const r = lr(c, p); if (r == null) return '--muted'; if (r < 70) return '--good'; if (r < 100) return '--warn'; if (r < 150) return '--serious'; return '--crit'; }
  const nFg = (v) => (v < 0 ? 'var(--crit)' : 'var(--text)');
  const cFg = (v) => (v < 0 ? 'var(--good)' : 'var(--text)');

  /* --------------------------- data-model helpers ------------------------- */
  function units() { const u = []; for (const y of [2020, 2021, 2022, 2023, 2024, 2025]) u.push({ id: String(y), label: 'FY ' + y }); for (let m = 1; m <= 5; m++) u.push({ id: '2026-' + m, label: ['Jan', 'Feb', 'Mar', 'Apr', 'May'][m - 1] + ' 2026' }); return u; }
  function getWin() {
    const s = state;
    if (s.period === 'ytd') return { yrs: [2026], mFrom: null, mTo: null, label: 'YTD 2026 (thru May)' };
    if (s.period === 'all') return { yrs: [2020, 2021, 2022, 2023, 2024, 2025, 2026], mFrom: null, mTo: null, label: 'All-time 2020–2026' };
    if (s.period !== 'custom') return { yrs: [+s.period], mFrom: null, mTo: null, label: 'FY ' + s.period };
    const us = units(), ids = us.map((u) => u.id);
    let a = ids.indexOf(s.from), b = ids.indexOf(s.to); if (a < 0) a = 0; if (b < 0) b = ids.length - 1; if (a > b) { const t = a; a = b; b = t; }
    const sel = ids.slice(a, b + 1);
    const yrs = sel.filter((x) => !x.includes('-')).map(Number);
    const ms = sel.filter((x) => x.includes('-')).map((x) => +x.split('-')[1]);
    let mFrom = null, mTo = null;
    if (ms.length === 5) yrs.push(2026);
    else if (ms.length) { mFrom = Math.min(...ms); mTo = Math.max(...ms); }
    const label = a === b ? us[a].label : us[a].label + ' – ' + us[b].label;
    return { yrs, mFrom, mTo, label };
  }
  function sumG(g, win) {
    let p = 0, c = 0, t = 0;
    for (const y of win.yrs) { const e = g.yr[y]; if (e) { p += e[0]; c += e[1]; t += e[2]; } }
    if (win.mFrom != null) { const e = g.yr[2026]; if (e) { const f = (win.mTo - win.mFrom + 1) / 5; p += e[0] * f; t += e[2] * f; if (g.mc) { for (let i = win.mFrom - 1; i < win.mTo; i++) c += g.mc[i]; } else c += e[1] * f; } }
    return { p, c, t, n: p - c };
  }
  function scope(cap) { const c = cap ?? state.captive; return state.db.groups.filter((g) => c === 'all' || g.cap === c); }
  let _mm = null;
  function mvMaps() { if (_mm) return _mm; const a2v = {}, v2a = {}; for (const mo of state.db.moves || []) { a2v[mo.al] = mo.vt; v2a[mo.vt] = mo.al; } _mm = { a2v, v2a }; return _mm; }
  const gById = (code) => state.db.groups.find((x) => x.code === code);
  const movedTo = (g) => mvMaps().v2a[g.code];
  const movedFrom = (g) => mvMaps().a2v[g.code];
  const primaryCode = (code) => mvMaps().v2a[code] || code;
  function gStatus(g) { const e = g.yr[2026]; if (!e) return 'Inactive'; const ys = Object.keys(g.yr).map(Number); if (ys.some((y) => y < 2025) && !g.yr[2025]) return 'True-up'; if (e[0] - e[2] > 0) return 'Active'; return 'Run-out'; }
  const yearsOf = (g) => Object.keys(g.yr).map(Number).sort();
  function flagsFor(g) {
    const t = state.thr; const e = g.yr[2026];
    const empty = { reasons: [], e, netLoss: 0, lossMonths: 0, activeMonths: 0 };
    if (!e || !g.mc || gStatus(g) !== 'Active') return empty;
    const monthsClosed = g.mc.length;
    const monthlyPrem = e[0] / monthsClosed;
    let lossMonths = 0; g.mc.forEach((c) => { if (c > monthlyPrem) lossMonths++; });
    const activeMonths = monthsClosed;
    const netLoss = e[1] - e[0];
    const share = activeMonths ? lossMonths / activeMonths : 0;
    const chronic = lossMonths === activeMonths || share > t.lossPct / 100;
    const reasons = [];
    if (netLoss > t.minLoss && chronic) {
      const every = lossMonths === activeMonths;
      reasons.push((every ? 'Lost money every closed month' : 'Lost money in ' + lossMonths + ' of ' + activeMonths + ' closed months') + ' — ' + fS(netLoss) + ' net short, 2026 YTD');
    }
    return { reasons, e, netLoss, lossMonths, activeMonths };
  }
  function watchSet(groups) { const s = new Set(); for (const g of groups) if (flagsFor(g).reasons.length) s.add(g.code); return s; }

  /* -------------------------------- markup -------------------------------- */
  const NAV = [
    ['overview', 'Overview', 'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z'],
    ['captive', 'Captives', 'M2 6l6-3.5L14 6M3 6v6M6.5 6v6M9.5 6v6M13 6v6M2 12.5h12'],
    ['cash', 'Cash', 'M1.5 4.5h13v7h-13zM8 10a2 2 0 100-4 2 2 0 000 4z'],
    ['groups', 'Groups', 'M2 3h12M2 6.5h12M2 10h12M2 13.5h8'],
    ['watchlist', 'Flagged', 'M8 2.2L14.5 13.5H1.5zM8 6.5v3M8 11.6v.3'],
    ['uploads', 'Uploads & Data', 'M8 10.5V3M5 6l3-3 3 3M2.5 13h11'],
    ['reports', 'Reports', 'M4 1.5h5l3 3v10H4zM9 1.5v3h3M6 8h4M6 11h4'],
    ['settings', 'Settings', 'M2 4.5h12M2 11.5h12M5.5 2.8v3.4M10.5 9.8v3.4'],
  ];
  const capName = { VT: 'Vermont Captive (PHIC)', AL: 'Alabama Captive (OTIC IC)' };

  const th = (label, al = 'left', extra = '') => `<th style="text-align:${al};padding:6px 14px;font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--text2);border-bottom:1px solid var(--line2);${extra}">${label}</th>`;
  const lrPill = (c, p) => { const v = lrV(c, p); return `<span style="font-size:11.5px;font-weight:600;padding:1px 6px;border-radius:3px;color:var(${v});background:var(${v}-soft)">${lrS(c, p)}</span>`; };
  function optionsHtml(list, sel) { return list.map((o) => `<option value="${esc(o.id)}"${o.id === sel ? ' selected' : ''}>${esc(o.label)}</option>`).join(''); }

  function kpiTile(k) {
    return `<div style="flex:1;min-width:148px;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:11px 13px">
      <div style="font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text2);margin-bottom:5px;white-space:nowrap">${esc(k.label)}</div>
      <div style="font-size:20px;font-weight:600;letter-spacing:-.01em;color:${k.fg};white-space:nowrap">${esc(k.val)}</div>
      <div style="font-size:10.5px;margin-top:3px;color:${k.dFg || 'var(--text2)'};white-space:nowrap">${esc(k.delta || '')}</div>
    </div>`;
  }

  /* ------------------------------- setup ---------------------------------- */
  function renderSetup() {
    const errBox = state.setupErr
      ? `<div style="background:var(--crit-soft);border:1px solid var(--crit);border-radius:5px;padding:9px 12px;font-size:12px;color:var(--crit);line-height:1.4">${esc(state.setupErr)}</div>`
      : '';
    root.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center">
      <div style="width:360px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:34px 32px 26px;display:flex;flex-direction:column;gap:13px;box-shadow:0 1px 3px rgba(0,0,0,.05)">
        <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:6px">
          <img class="bs-logo" src="/captive/wordmark-color.png" alt="BenSync" style="width:150px;display:block">
          <div style="font-size:10px;color:var(--text2);letter-spacing:.09em;text-transform:uppercase">Captive Analytics · First-time setup</div>
        </div>
        <div style="font-size:12.5px;color:var(--text2);line-height:1.5">Create the password for <b style="color:var(--text)">${esc(state.email || 'hunter@kennion.com')}</b>. This is the only account, and this screen appears only once.</div>
        ${errBox}
        <label style="display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--text2);font-weight:600;letter-spacing:.03em">NEW PASSWORD
          <input data-act="pw" type="password" value="${esc(state.pw)}" placeholder="at least 8 characters" autocomplete="new-password" style="border:1px solid var(--line2);border-radius:5px;padding:9px 10px;font-size:13px;background:var(--inset);color:var(--text);outline-color:var(--accent)">
        </label>
        <label style="display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--text2);font-weight:600;letter-spacing:.03em">CONFIRM PASSWORD
          <input data-act="pw2" type="password" value="${esc(state.pw2)}" placeholder="re-enter password" autocomplete="new-password" style="border:1px solid var(--line2);border-radius:5px;padding:9px 10px;font-size:13px;background:var(--inset);color:var(--text);outline-color:var(--accent)">
        </label>
        <button data-act="setup" ${state.busy ? 'disabled' : ''} style="margin-top:6px;background:var(--accent);color:var(--accent-ink);border:none;border-radius:5px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;opacity:${state.busy ? 0.45 : 1}">${state.busy ? 'Creating…' : 'Create login'}</button>
      </div>
    </div>`;
  }

  /* ------------------------------- login ---------------------------------- */
  function renderLogin() {
    const lockBox = state.locked
      ? `<div style="background:var(--warn-soft);border:1px solid var(--warn);border-radius:5px;padding:10px 12px;font-size:12px;color:var(--warn);line-height:1.45">Too many attempts. You're locked out — try again in <b>${state.minutes} minute${state.minutes === 1 ? '' : 's'}</b>. Your data is safe; no one else can attempt sign-in either.</div>`
      : '';
    const errBox = state.loginErr && !state.locked
      ? `<div style="background:var(--crit-soft);border:1px solid var(--crit);border-radius:5px;padding:9px 12px;font-size:12px;color:var(--crit);line-height:1.4">${esc(state.loginErr)}</div>`
      : '';
    root.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center">
      <div style="width:340px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:34px 32px 26px;display:flex;flex-direction:column;gap:13px;box-shadow:0 1px 3px rgba(0,0,0,.05)">
        <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:10px">
          <img class="bs-logo" src="/captive/wordmark-color.png" alt="BenSync" style="width:150px;display:block">
          <div style="font-size:10px;color:var(--text2);letter-spacing:.09em;text-transform:uppercase">Captive Analytics · Vermont &amp; Alabama</div>
        </div>
        ${lockBox}${errBox}
        <label style="display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--text2);font-weight:600;letter-spacing:.03em">EMAIL
          <input data-act="email" value="${esc(state.email)}" placeholder="you@example.com" autocomplete="username" style="border:1px solid var(--line2);border-radius:5px;padding:9px 10px;font-size:13px;background:var(--inset);color:var(--text);outline-color:var(--accent)">
        </label>
        <label style="display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--text2);font-weight:600;letter-spacing:.03em">PASSWORD
          <input data-act="pw" type="password" value="${esc(state.pw)}" placeholder="••••••••••••" autocomplete="current-password" style="border:1px solid var(--line2);border-radius:5px;padding:9px 10px;font-size:13px;background:var(--inset);color:var(--text);outline-color:var(--accent)">
        </label>
        <button data-act="login" ${state.locked || state.busy ? 'disabled' : ''} style="margin-top:6px;background:var(--accent);color:var(--accent-ink);border:none;border-radius:5px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;opacity:${state.locked || state.busy ? 0.45 : 1}">${state.busy ? 'Signing in…' : 'Sign in'}</button>
        <div style="display:flex;justify-content:space-between;margin-top:2px">
          <span style="font-size:10.5px;color:var(--text2)">Private · authorized admin only</span>
          <span style="font-size:10.5px;color:var(--text2)">Private · single user</span>
        </div>
      </div>
    </div>`;
  }

  /* -------------------------------- shell --------------------------------- */
  function renderApp() {
    const s = state;
    const win = getWin(), yrs = win.yrs;
    const scoped = scope();
    const ws = watchSet(scoped);
    const rows = scoped.map((g) => ({ g, ...sumG(g, win) }));
    const act = rows.filter((r) => r.p !== 0 || r.c !== 0);
    const T = { p: 0, c: 0, t: 0 }; for (const r of act) { T.p += r.p; T.c += r.c; T.t += r.t; }
    const pLabel = win.label;

    const periodOpts = [
      { id: 'ytd', label: 'YTD 2026 (thru May)' }, { id: '2025', label: '2025' }, { id: '2024', label: '2024' },
      { id: '2023', label: '2023' }, { id: '2022', label: '2022' }, { id: '2021', label: '2021' }, { id: '2020', label: '2020' },
      { id: 'all', label: 'All-time 2020–2026' }, { id: 'custom', label: 'Custom range…' },
    ];

    // breadcrumbs
    const crumbs = [{ label: 'BenSync Program', page: 'overview' }];
    if (s.page === 'captive') crumbs.push({ label: 'Captives' });
    if (s.page === 'group' && s.groupCode) { const g = gById(s.groupCode); crumbs.push({ label: capName[g.cap], page: 'captive', tieCap: g.cap }); crumbs.push({ label: g.code + ' — ' + g.name }); }
    if (['cash', 'groups', 'watchlist', 'uploads', 'reports', 'settings'].includes(s.page)) crumbs.push({ label: { cash: 'Cash', groups: 'Groups', watchlist: 'Flagged', uploads: 'Uploads & Data', reports: 'Reports', settings: 'Settings' }[s.page] });
    const crumbsHtml = crumbs.map((c, i) => {
      const last = i === crumbs.length - 1;
      const a = `<a data-act="crumb" data-i="${i}" style="cursor:${c.page ? 'pointer' : 'default'};color:${last ? 'var(--text)' : 'var(--text2)'};font-weight:${last ? 600 : 400};text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.label)}</a>`;
      return a + (last ? '' : '<span style="color:var(--line2)">/</span>');
    }).join('');
    window.__crumbs = crumbs;

    // sidebar
    const navExpanded = NAV.map(([id, label, icon]) => {
      const on = s.page === id;
      return `<div data-act="nav" data-id="${id}" class="hov" style="display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:5px;font-size:12.5px;cursor:pointer;background:${on ? 'var(--accent-soft)' : 'transparent'};color:${on ? 'var(--accent)' : 'var(--text)'};font-weight:${on ? 700 : 400}">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" style="flex:none;opacity:.75"><path d="${icon}"></path></svg>
        <span>${esc(label)}</span></div>`;
    }).join('');
    const navCollapsed = NAV.map(([id, label, icon]) => {
      const on = s.page === id;
      return `<div data-act="nav" data-id="${id}" title="${esc(label)}" class="hov" style="width:34px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:6px;cursor:pointer;background:${on ? 'var(--accent-soft)' : 'transparent'};color:${on ? 'var(--accent)' : 'var(--text2)'}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="${icon}"></path></svg></div>`;
    }).join('');
    const railW = s.rail ? '188px' : '44px';
    const sidebar = s.rail
      ? `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;padding:16px 10px 14px 14px;border-bottom:1px solid var(--line)">
          <div style="display:flex;flex-direction:column;gap:6px"><img class="bs-logo" src="/captive/wordmark-color.png" alt="BenSync" style="width:118px;display:block"><div style="font-size:8.5px;color:var(--text2);letter-spacing:.09em;text-transform:uppercase">Captive Analytics</div></div>
          <button data-act="rail" title="Collapse sidebar" style="background:transparent;border:none;color:var(--text2);cursor:pointer;font-size:13px;padding:2px 4px;line-height:1">&#171;</button></div>
        <div style="display:flex;flex-direction:column;gap:1px;padding:8px">${navExpanded}</div>
        <div style="margin-top:auto;padding:12px 14px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px">
          <div style="font-size:10.5px;color:var(--text2);line-height:1.5">Data through <b style="color:var(--text)">${esc(s.db.periodLabel || 'May 2026')}</b><br>First load · Jul 22, 2026</div>
          <div style="display:flex;gap:6px">
            <button data-act="theme" style="flex:1;background:var(--inset);border:1px solid var(--line2);border-radius:4px;padding:5px;font-size:11px;color:var(--text2);cursor:pointer">${s.theme === 'light' ? 'Dark mode' : 'Light mode'}</button>
            <button data-act="logout" style="flex:1;background:var(--inset);border:1px solid var(--line2);border-radius:4px;padding:5px;font-size:11px;color:var(--text2);cursor:pointer">Lock</button>
          </div></div>`
      : `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:12px 0;width:100%">
          <div style="width:24px;height:24px;background:var(--accent);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--accent-ink);font-weight:700;font-size:12px;font-family:Sora,sans-serif;margin-bottom:10px">B</div>
          ${navCollapsed}
          <button data-act="rail" title="Expand sidebar" style="margin-top:10px;width:34px;height:30px;background:var(--inset);border:1px solid var(--line2);border-radius:6px;color:var(--text2);cursor:pointer;font-size:12px;line-height:1">&#187;</button></div>`;

    // header controls
    const showCapToggle = s.page !== 'captive';
    const capToggle = showCapToggle ? `<div style="display:flex;border:1px solid var(--line2);border-radius:5px;overflow:hidden">
      ${[['all', 'All Program'], ['VT', 'Vermont'], ['AL', 'Alabama']].map(([id, label]) => { const on = s.captive === id; return `<div data-act="cap" data-id="${id}" style="padding:5px 11px;font-size:11.5px;cursor:pointer;background:${on ? 'var(--accent)' : 'var(--surface)'};color:${on ? 'var(--accent-ink)' : 'var(--text2)'};font-weight:${on ? 600 : 400};border-right:1px solid var(--line)">${label}</div>`; }).join('')}
    </div>` : '';
    const rangeHtml = s.period === 'custom' ? `<div style="display:flex;align-items:center;gap:6px">
      <select data-act="from" style="border:1px solid var(--line2);border-radius:5px;padding:5px 8px;font-size:11.5px;background:var(--surface);color:var(--text)">${optionsHtml(units(), s.from)}</select>
      <span style="font-size:11px;color:var(--text2)">to</span>
      <select data-act="to" style="border:1px solid var(--line2);border-radius:5px;padding:5px 8px;font-size:11.5px;background:var(--surface);color:var(--text)">${optionsHtml(units(), s.to)}</select></div>` : '';
    const header = `<div style="display:flex;align-items:center;gap:14px;padding:10px 20px;background:var(--surface);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:10">
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;min-width:0;flex:1">${crumbsHtml}</div>
      ${capToggle}
      <select data-act="period" style="border:1px solid var(--line2);border-radius:5px;padding:5px 8px;font-size:11.5px;background:var(--surface);color:var(--text)">${optionsHtml(periodOpts, s.period)}</select>
      ${rangeHtml}</div>`;

    // page body
    let body = '';
    if (s.page === 'overview' || s.page === 'captive') body = renderOverview({ win, yrs, scoped, act, T, pLabel, ws });
    else if (s.page === 'groups') body = renderGroups({ win, rows, scoped, ws, pLabel });
    else if (s.page === 'group') body = renderGroup({ win, ws, pLabel });
    else if (s.page === 'watchlist') body = renderWatchlist({ scoped, pLabel });
    else if (s.page === 'cash') body = renderCash();
    else if (s.page === 'uploads') body = renderUploads();
    else if (s.page === 'reports') body = renderReports();
    else if (s.page === 'settings') body = renderSettings();

    root.innerHTML = `<div style="display:grid;grid-template-columns:${railW} 1fr;min-height:100vh">
      <div style="background:var(--surface);border-right:1px solid var(--line);display:flex;flex-direction:column;position:sticky;top:0;height:100vh">${sidebar}</div>
      <div style="display:flex;flex-direction:column;min-width:0">
        ${header}
        <div style="padding:18px 20px 40px;display:flex;flex-direction:column;gap:16px">${body}</div>
      </div></div>`;
  }

  /* ------------------------------ Overview -------------------------------- */
  function renderOverview({ win, yrs, scoped, act, T, pLabel, ws }) {
    const s = state;
    let oScope = scoped, oRows = act, oT = T, oWs = ws;
    if (s.page === 'captive') {
      oScope = scope('all'); oWs = watchSet(oScope);
      oRows = oScope.map((g) => ({ g, ...sumG(g, win) })).filter((r) => r.p !== 0 || r.c !== 0);
      oT = { p: 0, c: 0, t: 0 }; for (const r of oRows) { oT.p += r.p; oT.c += r.c; oT.t += r.t; }
    }
    const net = oT.p - oT.c;
    const ctx = (metric) => {
      if (s.period === 'custom') return win.mFrom != null ? 'custom range' : 'custom range of full years';
      if (s.period === 'ytd') { let p = 0, c = 0; for (const g of oScope) { const e = g.yr[2025]; if (e) { p += e[0]; c += e[1]; } } const m = { p, c, n: p - c, lr: lr(c, p) }; return 'FY2025: ' + (metric === 'lr' ? (m.lr == null ? EM_DASH : m.lr + '%') : fS(m[metric])); }
      if (s.period === 'all') return '2020–2026';
      const py = +s.period - 1; if (py < 2020) return 'first program year';
      let p = 0, c = 0; for (const g of oScope) { const e = g.yr[py]; if (e) { p += e[0]; c += e[1]; } }
      const m = { p, c, n: p - c, lr: lr(c, p) };
      return py + ': ' + (metric === 'lr' ? (m.lr == null ? EM_DASH : m.lr + '%') : fS(m[metric]));
    };
    const title = s.page === 'captive' ? 'Captives — Vermont & Alabama side by side' : 'BenSync program overview';
    const sub = pLabel + (s.captive !== 'all' && s.page === 'overview' ? (s.captive === 'VT' ? ' · Vermont only' : ' · Alabama only') : '') + ' · Alabama group history begins 2026' + (win.mFrom != null ? ' · premium prorated for partial-year window (workbooks carry YTD premium only)' : '');
    const activeCt = oScope.filter((g) => gStatus(g) === 'Active').length;
    const kpis = [
      { label: 'Premium received', val: fS(oT.p), fg: 'var(--text)', delta: ctx('p') },
      { label: 'Claims paid', val: fS(oT.c), fg: 'var(--text)', delta: ctx('c') },
      { label: 'Net to captive', val: fS(net), fg: nFg(net), delta: ctx('n') },
      { label: 'Loss ratio', val: lrS(oT.c, oT.p), fg: 'var(' + lrV(oT.c, oT.p) + ')', delta: ctx('lr') },
      { label: 'Active groups 2026', val: String(activeCt), fg: 'var(--text)', delta: oScope.length + ' with any history' },
      { label: 'Flagged', val: String(oWs.size), fg: oWs.size ? 'var(--serious)' : 'var(--text)', delta: 'chronic net loss' },
    ];
    const kpiRow = `<div style="display:flex;gap:10px;flex-wrap:wrap">${kpis.map(kpiTile).join('')}</div>`;

    let captiveBlock = '';
    if (s.page === 'captive') captiveBlock = renderCaptiveCompare({ win, pLabel });

    // by-year chart / table
    const ally = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
    const ysums = ally.map((y) => { let p = 0, c = 0; for (const g of oScope) { const e = g.yr[y]; if (e) { p += e[0]; c += e[1]; } } return { y, p, c }; }).filter((x) => x.p !== 0 || x.c !== 0);
    const mx = Math.max(1, ...ysums.map((x) => Math.max(x.p, x.c)));
    const chartInner = !s.chartTable
      ? `<div style="display:flex;align-items:flex-end;gap:10px;height:190px;padding-top:4px">${ysums.map((x) => {
          const ph = Math.max(2, Math.round((x.p / mx) * 150)), ch = Math.max(1, Math.round((Math.max(0, x.c) / mx) * 150));
          const nv = x.p - x.c; const lbl = x.y === 2026 ? '2026 YTD' : String(x.y); const lw = (yrs.includes(x.y) || (win.mFrom != null && x.y === 2026)) ? 700 : 400;
          const tip = `${x.y} — Premium ${f$(x.p)} · Claims ${f$(x.c)} · Net ${f$(nv)} · LR ${lrS(x.c, x.p)}`;
          return `<div title="${esc(tip)}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;height:100%">
            <div style="font-size:9px;color:${nv < 0 ? 'var(--crit)' : 'var(--text2)'};font-weight:600;white-space:nowrap">${fS(nv)}</div>
            <div style="display:flex;align-items:flex-end;gap:2px;width:100%;justify-content:center;flex:1"><div style="width:40%;max-width:26px;height:${ph}px;background:var(--accent);border-radius:1px 1px 0 0"></div><div style="width:40%;max-width:26px;height:${ch}px;background:var(--muted);border-radius:1px 1px 0 0"></div></div>
            <div style="font-size:10px;color:var(--text2);white-space:nowrap;font-weight:${lw}">${lbl}</div></div>`;
        }).join('')}</div>`
      : `<table style="width:100%">${'<thead><tr>' + th('Year', 'left', 'border-bottom:1px solid var(--line)') + th('Premium', 'right', 'border-bottom:1px solid var(--line)') + th('Claims', 'right', 'border-bottom:1px solid var(--line)') + th('Net', 'right', 'border-bottom:1px solid var(--line)') + th('LR', 'right', 'border-bottom:1px solid var(--line)') + '</tr></thead>'}<tbody>${ysums.map((x) => {
          const nv = x.p - x.c; const lbl = x.y === 2026 ? '2026 YTD' : String(x.y);
          return `<tr><td style="padding:var(--rp) 8px;border-bottom:1px solid var(--line);font-size:12px;font-weight:600">${lbl}</td>
            <td style="padding:var(--rp) 8px;border-bottom:1px solid var(--line);font-size:12px;text-align:right">${f$(x.p)}</td>
            <td style="padding:var(--rp) 8px;border-bottom:1px solid var(--line);font-size:12px;text-align:right">${f$(x.c)}</td>
            <td style="padding:var(--rp) 8px;border-bottom:1px solid var(--line);font-size:12px;text-align:right;color:${nFg(nv)}">${f$(nv)}</td>
            <td style="padding:var(--rp) 8px;border-bottom:1px solid var(--line);font-size:12px;text-align:right">${lrPill(x.c, x.p)}</td></tr>`;
        }).join('')}</tbody></table>`;
    const byYear = `<div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px 16px">
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px;flex-wrap:wrap">
        <div style="font-size:13px;font-weight:700">Premium vs claims by year</div>
        <div style="display:flex;align-items:center;gap:12px;font-size:10.5px;color:var(--text2)"><span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:var(--accent);border-radius:2px;display:inline-block"></span>Premium</span><span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:var(--muted);border-radius:2px;display:inline-block"></span>Claims</span></div>
        <span style="margin-left:auto;font-size:12px;font-weight:600;color:${nFg(net)}">Net, selected period: ${f$(net)}</span>
        <button data-act="chartTable" style="background:var(--inset);border:1px solid var(--line2);border-radius:4px;padding:3px 9px;font-size:10.5px;color:var(--text2);cursor:pointer">${s.chartTable ? 'Chart view' : 'Values table'}</button>
      </div>${chartInner}</div>`;

    // monthly claims
    const mo = [0, 0, 0, 0, 0]; for (const g of oScope) if (g.mc) g.mc.forEach((v, i) => (mo[i] += v));
    const mmx = Math.max(1, ...mo.map(Math.abs));
    const monthly = `<div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px 16px;display:flex;flex-direction:column">
      <div style="font-size:13px;font-weight:700">Claims paid by month — 2026</div>
      <div style="font-size:10.5px;color:var(--text2);margin-top:2px">From the claims recoverable workbooks · negatives are returns of cell claims</div>
      <div style="display:flex;align-items:flex-end;gap:12px;flex:1;min-height:130px;margin-top:10px">${mo.map((v, i) => {
        const h = Math.max(2, Math.round((Math.abs(v) / mmx) * 100));
        return `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;height:100%"><div style="font-size:9.5px;color:${v < 0 ? 'var(--good)' : 'var(--text2)'};font-weight:600;white-space:nowrap">${fS(v)}</div><div style="width:60%;max-width:30px;height:${h}px;background:${v < 0 ? 'var(--good)' : 'var(--muted)'};border-radius:1px 1px 0 0"></div><div style="font-size:10px;color:var(--text2)">${['Jan', 'Feb', 'Mar', 'Apr', 'May'][i]}</div></div>`;
      }).join('')}</div></div>`;

    // top movers
    const sorted = [...oRows].sort((a, b) => a.n - b.n);
    const moverRow = (r, col) => `<div data-act="open" data-code="${esc(r.g.code)}" class="hov" style="display:flex;align-items:center;gap:10px;padding:var(--rp) 14px;border-bottom:1px solid var(--line);cursor:pointer;font-size:12.5px">
      <span style="color:var(--text2);font-size:11px;width:80px;flex:none">${esc(r.g.code)}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.g.name)}</span>
      ${lrPill(r.c, r.p)}
      <span style="font-weight:600;color:${col};width:96px;text-align:right">${fS(r.n)}</span></div>`;
    const worst = sorted.slice(0, 5).map((r) => moverRow(r, 'var(--crit)')).join('');
    const best = sorted.slice(-5).reverse().map((r) => moverRow(r, 'var(--good)')).join('');
    const movers = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden"><div style="padding:11px 14px;font-size:13px;font-weight:700;border-bottom:1px solid var(--line)">Worst 5 · net impact this period</div>${worst}</div>
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden"><div style="padding:11px 14px;font-size:13px;font-weight:700;border-bottom:1px solid var(--line)">Best 5 · net impact this period</div>${best}</div></div>`;

    return `<div style="display:flex;align-items:baseline;gap:10px"><h1 style="margin:0;font-size:17px;font-weight:700;letter-spacing:-.01em">${esc(title)}</h1><span style="font-size:11.5px;color:var(--text2)">${esc(sub)}</span></div>
      ${kpiRow}${captiveBlock}
      <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:16px;align-items:stretch">${byYear}${monthly}</div>
      ${movers}`;
  }

  function renderCaptiveCompare({ win, pLabel }) {
    const s = state;
    const agg = (cap) => { const gs = cap === 'all' ? s.db.groups : s.db.groups.filter((g) => g.cap === cap); let p = 0, c = 0; for (const g of gs) { const x = sumG(g, win); p += x.p; c += x.c; } return { p, c, n: p - c, act: gs.filter((g) => gStatus(g) === 'Active').length, wl: watchSet(gs).size }; };
    const V = agg('VT'), A = agg('AL'), P = agg('all');
    const fsV = s.db.fs.VT, fsA = s.db.fs.AL;
    const money = (m, va, aa, pa) => ({ m, vt: f$(va), al: f$(aa), pr: f$(pa), vtFg: nFg(va), alFg: nFg(aa), prFg: nFg(pa), fw: 400, bg: 'transparent' });
    const cmpRows = [
      money('Premium received', V.p, A.p, P.p),
      money('Claims paid', V.c, A.c, P.c),
      { ...money('Net to captive', V.n, A.n, P.n), fw: 700, bg: 'var(--inset)' },
      { m: 'Loss ratio', vt: lrS(V.c, V.p), al: lrS(A.c, A.p), pr: lrS(P.c, P.p), vtFg: 'var(' + lrV(V.c, V.p) + ')', alFg: 'var(' + lrV(A.c, A.p) + ')', prFg: 'var(' + lrV(P.c, P.p) + ')', fw: 700, bg: 'transparent' },
      { m: 'Active groups 2026', vt: String(V.act), al: String(A.act), pr: String(P.act), vtFg: 'var(--text)', alFg: 'var(--text)', prFg: 'var(--text)', fw: 400, bg: 'transparent' },
      { m: 'Flagged', vt: String(V.wl), al: String(A.wl), pr: String(P.wl), vtFg: V.wl ? 'var(--serious)' : 'var(--text)', alFg: A.wl ? 'var(--serious)' : 'var(--text)', prFg: P.wl ? 'var(--serious)' : 'var(--text)', fw: 400, bg: 'transparent' },
      money('Net income YTD (FS)', fsV.ni, fsA.ni, fsV.ni + fsA.ni),
      money('Shareholder’s equity (FS)', fsV.equity, fsA.equity, fsV.equity + fsA.equity),
      money('Captive cash (FS)', fsV.cash, fsA.cash, fsV.cash + fsA.cash),
    ];
    const cmpTable = `<div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden">
      <div style="display:flex;align-items:baseline;gap:10px;padding:11px 14px;border-bottom:1px solid var(--line)"><div style="font-size:13px;font-weight:700">Vermont vs Alabama vs program</div><span style="font-size:11px;color:var(--text2)">${esc(pLabel + ' for premium & claims · FS lines as of May 31, 2026')}</span></div>
      <table style="width:100%"><thead><tr>${th('Metric', 'left', 'border-bottom:1px solid var(--line2)')}${th('Vermont (PHIC)', 'right', 'border-bottom:1px solid var(--line2)')}${th('Alabama (OTIC IC)', 'right', 'border-bottom:1px solid var(--line2)')}${th('All Program', 'right', 'border-bottom:1px solid var(--line2);border-left:1px solid var(--line)')}</tr></thead><tbody>
      ${cmpRows.map((r) => `<tr style="background:${r.bg}"><td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px;font-weight:${r.fw}">${esc(r.m)}</td><td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;font-weight:${r.fw};color:${r.vtFg}">${esc(r.vt)}</td><td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;font-weight:${r.fw};color:${r.alFg}">${esc(r.al)}</td><td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;font-weight:600;color:${r.prFg};border-left:1px solid var(--line)">${esc(r.pr)}</td></tr>`).join('')}
      </tbody></table></div>`;

    // tie-out
    const tieTabs = [['VT', 'Vermont'], ['AL', 'Alabama']].map(([id, label]) => { const on = s.tieCap === id; return `<div data-act="tie" data-id="${id}" style="padding:3px 10px;font-size:11px;cursor:pointer;background:${on ? 'var(--accent)' : 'var(--surface)'};color:${on ? 'var(--accent-ink)' : 'var(--text2)'};font-weight:${on ? 600 : 400}">${label}</div>`; }).join('');
    const fs = s.db.fs[s.tieCap];
    let pp = 0, pc = 0; for (const g of scope(s.tieCap)) { const e = g.yr[2026]; if (e) { pp += e[0]; pc += e[1]; } }
    const rows2 = [['Gross premium written YTD', fs.gpw, pp], ['Losses paid to cells YTD', fs.losses, pc], ['Ceded reinsurance premium', fs.ceded, null], ['IBNR reserves', fs.ibnr, null], ['Net income YTD', fs.ni, null]];
    let badLabel = null, badV = 0;
    const tieRowsHtml = rows2.map(([label, fsv, pv]) => {
      const v = pv == null ? 0 : Math.round((fsv - pv) * 100) / 100; const ok = Math.abs(v) < 1; if (pv != null && !ok && !badLabel) { badLabel = label; badV = v; }
      const vFg = pv == null ? 'var(--text2)' : (ok ? 'var(--good)' : 'var(--warn)');
      const icon = pv == null ? '' : (ok ? '✓' : '⚠');
      return `<tr><td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px">${esc(label)}</td><td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right">${f$(fsv)}</td><td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;color:var(--text2)">${pv == null ? 'FS only' : f$(pv)}</td><td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;font-weight:600;color:${vFg}">${pv == null ? EM_DASH : (ok ? '$0' : f$(v))}</td><td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);text-align:center;color:${vFg};font-size:12px">${icon}</td></tr>`;
    }).join('');
    const tieV = badLabel ? '--warn' : '--good';
    const tieSummary = badLabel ? ('Does not tie — ' + f$(badV) + ' on ' + badLabel.toLowerCase().replace(' ytd', '')) : 'Ties to the dollar';
    const tieOut = `<div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--line)"><div style="font-size:13px;font-weight:700">Financial statement tie-out</div>
        <div style="display:flex;border:1px solid var(--line2);border-radius:5px;overflow:hidden">${tieTabs}</div>
        <div style="font-size:11px;color:var(--text2)">${esc(fs.entity + ' · SRS financial statements (unaudited), ' + fs.asOf + ' · ' + fs.src)}</div>
        <span style="margin-left:auto;font-size:11px;font-weight:600;padding:2px 8px;border-radius:3px;color:var(${tieV});background:var(${tieV}-soft)">${esc(tieSummary)}</span></div>
      <table style="width:100%"><thead><tr>${th('Line', 'left', 'border-bottom:1px solid var(--line)')}${th('Statement', 'right', 'border-bottom:1px solid var(--line)')}${th('Portal computed', 'right', 'border-bottom:1px solid var(--line)')}${th('Variance', 'right', 'border-bottom:1px solid var(--line)')}<th style="width:40px;border-bottom:1px solid var(--line)"></th></tr></thead><tbody>${tieRowsHtml}</tbody></table>
      <div style="padding:8px 14px;font-size:11px;color:var(--text2);background:var(--inset)">Statement figures are captive-entity level (ceded reinsurance, G&amp;A, investment income included); the portal computes the cell layer, so premium written and losses paid to cells are the lines expected to tie. FS is rounded to whole dollars — variances under $1 count as tied.</div></div>`;

    const balStrip = [{ label: 'Cash & equivalents', val: fS(fs.cash), fg: 'var(--text)' }, { label: 'Shareholder’s equity', val: fS(fs.equity), fg: 'var(--text)' }, { label: 'Net income YTD', val: fS(fs.ni), fg: nFg(fs.ni) }];
    const bal = `<div style="display:flex;gap:10px">${balStrip.map((b) => `<div style="flex:1;background:var(--inset);border:1px solid var(--line);border-radius:6px;padding:9px 13px;display:flex;align-items:baseline;gap:8px"><span style="font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--text2)">${esc(b.label)}</span><span style="font-size:15px;font-weight:600;margin-left:auto;color:${b.fg}">${esc(b.val)}</span></div>`).join('')}</div>`;

    return cmpTable + tieOut + bal;
  }

  /* ------------------------------- Groups --------------------------------- */
  function renderGroups({ win, rows, scoped, ws, pLabel }) {
    const s = state;
    const q = s.search.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (q && !(r.g.name.toLowerCase().includes(q) || r.g.code.toLowerCase().includes(q))) return false;
      const st = gStatus(r.g);
      if (s.fStatus === 'Flagged') { if (!ws.has(r.g.code)) return false; }
      else if (s.fStatus !== 'all' && st !== s.fStatus) return false;
      if (s.fLR !== 'all') { if ('--' + s.fLR !== lrV(r.c, r.p)) return false; }
      return true;
    });
    const k = s.sortKey, dir = s.sortDir;
    const val = (r) => { switch (k) { case 'code': return r.g.code; case 'name': return r.g.name; case 'cap': return r.g.cap; case 'st': return gStatus(r.g); case 'p': return r.p; case 'c': return r.c; case 'n': return r.n; case 'lr': return r.p > 0 ? r.c / r.p : -1e9; case 't': return r.t; default: return r.n; } };
    list.sort((a, b) => { const x = val(a), y2 = val(b); return (typeof x === 'string' ? x.localeCompare(y2) : x - y2) * dir; });

    const cols = [['code', 'Code', 'left'], ['name', 'Group name', 'left'], ['cap', 'Captive', 'left'], ['st', 'Status', 'left'], ['p', 'Premium', 'right'], ['c', 'Claims', 'right'], ['n', 'Net', 'right'], ['lr', 'Loss ratio', 'right'], ['t', 'Tail prem', 'right'], ['fl', 'Flags', 'left']];
    const headCells = cols.map(([id, label, al]) => { const arrow = s.sortKey === id ? (dir === 1 ? ' ▲' : ' ▼') : ''; return `<th data-act="sort" data-id="${id}" style="position:sticky;top:0;z-index:2;background:var(--surface);padding:7px 10px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--text2);text-align:${al};border-bottom:1px solid var(--line2);cursor:pointer;white-space:nowrap">${label}${arrow}</th>`; }).join('');

    const bodyRows = list.map((r) => {
      let st = gStatus(r.g); const wl = ws.has(r.g.code);
      const mto = movedTo(r.g), mfrom = movedFrom(r.g); if (mto) st = 'Moved → AL';
      const flags = []; if (wl) flags.push('FLAG'); if (mto) flags.push('MOVED'); if (mfrom) flags.push('EX-VT'); if (r.t > 0) flags.push('TAIL'); if (r.c < 0) flags.push('REC');
      const moved = st === 'Moved → AL';
      const stB = wl ? 'var(--warn)' : (moved || st === 'True-up') ? 'var(--accent)' : st === 'Active' ? 'var(--good)' : 'var(--line2)';
      const stFg = wl ? 'var(--warn)' : (moved || st === 'True-up') ? 'var(--accent)' : st === 'Active' ? 'var(--good)' : 'var(--text2)';
      const openCode = mto || r.g.code;
      return `<tr data-act="open" data-code="${esc(openCode)}" class="hov" style="cursor:pointer">
        <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12px;color:var(--text2);white-space:nowrap">${esc(r.g.code)}</td>
        <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12.5px;font-weight:600;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis">${esc(r.g.name)}</td>
        <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12px;color:var(--text2)">${r.g.cap === 'VT' ? 'Vermont' : 'Alabama'}</td>
        <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line)"><span style="font-size:10.5px;padding:1px 6px;border-radius:3px;border:1px solid ${stB};color:${stFg};white-space:nowrap">${esc(st)}</span></td>
        <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right">${f$(r.p)}</td>
        <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;color:${cFg(r.c)}">${f$(r.c)}</td>
        <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;font-weight:600;color:${nFg(r.n)}">${f$(r.n)}</td>
        <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);text-align:right">${lrPill(r.c, r.p)}</td>
        <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;color:${r.t > 0 ? 'var(--serious)' : 'var(--text2)'}">${r.t !== 0 ? f$(r.t) : EM_DASH}</td>
        <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:10px;color:var(--text2);white-space:nowrap">${esc(flags.join(' · '))}</td></tr>`;
    }).join('');

    const gCount = list.length.toLocaleString('en-US') + ' of ' + scoped.length + ' groups · ' + pLabel + ' · click any row for the scorecard';
    return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h1 style="margin:0;font-size:17px;font-weight:700">Groups</h1><span style="font-size:11.5px;color:var(--text2)">${esc(gCount)}</span>
        <input data-act="search" value="${esc(s.search)}" placeholder="Search name or code…" style="margin-left:auto;border:1px solid var(--line2);border-radius:5px;padding:6px 10px;font-size:12px;width:210px;background:var(--surface);color:var(--text)">
        <select data-act="fStatus" style="border:1px solid var(--line2);border-radius:5px;padding:6px 8px;font-size:11.5px;background:var(--surface);color:var(--text)">${optionsHtml([{ id: 'all', label: 'All statuses' }, { id: 'Active', label: 'Active 2026' }, { id: 'Run-out', label: 'Run-out' }, { id: 'True-up', label: 'True-up' }, { id: 'Inactive', label: 'Inactive' }, { id: 'Flagged', label: 'Flagged only' }], s.fStatus)}</select>
        <select data-act="fLR" style="border:1px solid var(--line2);border-radius:5px;padding:6px 8px;font-size:11.5px;background:var(--surface);color:var(--text)">${optionsHtml([{ id: 'all', label: 'All loss ratios' }, { id: 'good', label: 'Under 70%' }, { id: 'warn', label: '70–99%' }, { id: 'serious', label: '100–149%' }, { id: 'crit', label: '150%+' }], s.fLR)}</select>
        <button data-act="exportXlsx" title="Wired in build — exports current view" style="background:var(--inset);border:1px solid var(--line2);border-radius:5px;padding:6px 11px;font-size:11.5px;color:var(--text2);cursor:pointer">Export to Excel</button>
      </div>
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:auto;max-height:calc(100vh - 148px)">
        <table style="width:100%;border-collapse:separate;border-spacing:0"><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
  }

  /* ---------------------------- Group Detail ------------------------------ */
  function renderGroup({ win, ws, pLabel }) {
    const s = state;
    let g = gById(s.groupCode);
    const primC = primaryCode(s.groupCode); if (primC !== s.groupCode) { const p = gById(primC); if (p) g = p; }
    const sib = movedFrom(g) ? gById(movedFrom(g)) : null;
    const cyr = sib ? { ...sib.yr, ...g.yr } : g.yr;
    const yearCap = {}; if (sib) { for (const y in sib.yr) yearCap[y] = sib.cap; } for (const y in g.yr) yearCap[y] = g.cap;
    const cur = sumG(g, win);
    const st = gStatus(g); const wl = ws.has(g.code);
    const gyrs = Object.keys(cyr).map(Number).sort((a, b) => a - b);
    const gdStatus = wl ? st + ' · Flagged' : st;
    const gdStB = wl ? 'var(--warn)' : st === 'Active' ? 'var(--good)' : st === 'True-up' ? 'var(--accent)' : 'var(--line2)';
    const gdStFg = wl ? 'var(--warn)' : st === 'Active' ? 'var(--good)' : st === 'True-up' ? 'var(--accent)' : 'var(--text2)';
    const gdMeta = g.code + ' · ' + capName[g.cap] + ' · active ' + gyrs[0] + '–' + gyrs[gyrs.length - 1] + (sib ? ' · moved Vermont → Alabama, 2026 (combined history)' : ' · enrollment arrives with the funding file');
    const pmax = Math.max(1, ...gyrs.map((y) => cyr[y][0]));
    const spark = gyrs.map((y) => { const h = Math.max(2, Math.round((cyr[y][0] / pmax) * 30)); const tip = y + ': ' + f$(cyr[y][0]) + ' premium' + (sib ? ' · ' + (yearCap[y] === 'VT' ? 'Vermont' : 'Alabama') : ''); return `<div title="${esc(tip)}" style="width:9px;height:${h}px;background:var(--accent);opacity:.55;border-radius:1px"></div>`; }).join('');

    const gdKpis = [
      { label: 'Premium · ' + pLabel, val: f$(cur.p), fg: 'var(--text)' },
      { label: 'Claims', val: f$(cur.c), fg: cFg(cur.c) },
      { label: 'Net to captive', val: f$(cur.n), fg: nFg(cur.n) },
      { label: 'Loss ratio', val: lrS(cur.c, cur.p), fg: 'var(' + lrV(cur.c, cur.p) + ')' },
      { label: 'Tail premium', val: cur.t !== 0 ? f$(cur.t) : EM_DASH, fg: cur.t > 0 ? 'var(--serious)' : 'var(--text)' },
    ];
    const kpiRow = `<div style="display:flex;gap:10px;flex-wrap:wrap">${gdKpis.map((gk) => `<div style="flex:1;min-width:140px;background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:11px 13px"><div style="font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text2);margin-bottom:5px;white-space:nowrap">${esc(gk.label)}</div><div style="font-size:19px;font-weight:600;color:${gk.fg};white-space:nowrap">${esc(gk.val)}</div></div>`).join('')}</div>`;

    const yearRows = gyrs.map((y) => { const e = cyr[y], n = e[0] - e[1]; return `<tr>
      <td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px;font-weight:600">${(y === 2026 ? '2026 YTD' : String(y)) + (sib ? ' · ' + (yearCap[y] === 'VT' ? 'VT' : 'AL') : '')}</td>
      <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right">${f$(e[0])}</td>
      <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;color:${e[2] > 0 ? 'var(--serious)' : 'var(--text2)'}">${e[2] !== 0 ? f$(e[2]) : EM_DASH}</td>
      <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;color:${cFg(e[1])}">${f$(e[1])}</td>
      <td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;font-weight:600;color:${nFg(n)}">${f$(n)}</td>
      <td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);text-align:right">${lrPill(e[1], e[0])}</td></tr>`; }).join('');
    let tp = 0, tc = 0, tt = 0; for (const y of gyrs) { tp += cyr[y][0]; tc += cyr[y][1]; tt += cyr[y][2]; }
    const foot = `<tfoot><tr>
      <td style="padding:var(--rp) 14px;font-size:12.5px;font-weight:700;border-top:1px solid var(--line2)">All-time</td>
      <td style="padding:var(--rp) 10px;font-size:12.5px;text-align:right;font-weight:700;border-top:1px solid var(--line2)">${f$(tp)}</td>
      <td style="padding:var(--rp) 10px;font-size:12.5px;text-align:right;border-top:1px solid var(--line2);color:var(--text2)">${tt !== 0 ? f$(tt) : EM_DASH}</td>
      <td style="padding:var(--rp) 10px;font-size:12.5px;text-align:right;font-weight:700;border-top:1px solid var(--line2)">${f$(tc)}</td>
      <td style="padding:var(--rp) 10px;font-size:12.5px;text-align:right;font-weight:700;border-top:1px solid var(--line2);color:${nFg(tp - tc)}">${f$(tp - tc)}</td>
      <td style="padding:var(--rp) 14px;text-align:right;border-top:1px solid var(--line2)">${lrPill(tc, tp)}</td></tr></tfoot>`;
    const yearsTable = `<div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden">
      <div style="padding:11px 14px;font-size:13px;font-weight:700;border-bottom:1px solid var(--line)">All years — whole life of the group</div>
      <table style="width:100%"><thead><tr>${th('Year', 'left', 'border-bottom:1px solid var(--line)')}${th('Premium', 'right', 'border-bottom:1px solid var(--line)')}${th('of which tail', 'right', 'border-bottom:1px solid var(--line)')}${th('Claims', 'right', 'border-bottom:1px solid var(--line)')}${th('Net', 'right', 'border-bottom:1px solid var(--line)')}${th('LR', 'right', 'border-bottom:1px solid var(--line)')}</tr></thead><tbody>${yearRows}</tbody>${foot}</table></div>`;

    let monthlyBlock;
    if (g.mc) { const gmx = Math.max(1, ...g.mc.map(Math.abs));
      const bars = g.mc.map((v, i) => { const h = Math.max(2, Math.round((Math.abs(v) / gmx) * 100)); return `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;height:100%"><div style="font-size:9.5px;color:${v < 0 ? 'var(--good)' : 'var(--text2)'};font-weight:600;white-space:nowrap">${fS(v)}</div><div style="width:55%;max-width:30px;height:${h}px;background:${v < 0 ? 'var(--good)' : 'var(--muted)'};border-radius:1px 1px 0 0"></div><div style="font-size:10px;color:var(--text2)">${['Jan', 'Feb', 'Mar', 'Apr', 'May'][i]}</div></div>`; }).join('');
      monthlyBlock = `<div style="display:flex;align-items:flex-end;gap:12px;height:140px">${bars}</div>`;
    } else monthlyBlock = `<div style="font-size:12px;color:var(--text2);padding:18px 0">No claims recoverable activity for this group in 2026.</div>`;
    const monthly = `<div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px 16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="font-size:13px;font-weight:700">Monthly claims — 2026</div><span style="font-size:10.5px;color:var(--text2)">from Claims Recoverable · negatives (green) are returns of cell claims</span></div>${monthlyBlock}</div>`;

    // lifecycle
    const tailYears = gyrs.filter((y) => cyr[y][2] > 0);
    const life = [
      { label: 'First activity', val: String(gyrs[0]) + (sib ? ' (Vermont)' : ''), fg: 'var(--text)' },
      { label: 'Latest activity', val: gyrs[gyrs.length - 1] === 2026 ? '2026 (current)' : String(gyrs[gyrs.length - 1]), fg: gyrs[gyrs.length - 1] === 2026 ? 'var(--text)' : 'var(--serious)' },
      ...(sib ? [{ label: 'Captive move', val: 'Vermont → Alabama, 2026', fg: 'var(--accent)' }] : []),
      { label: 'Status', val: gdStatus, fg: gdStFg },
      ...tailYears.map((y) => ({ label: 'Tail premium · ' + y, val: f$(cyr[y][2]), fg: 'var(--serious)' })),
    ];
    const lifeSummary = st === 'True-up' ? 'Activity resumed in 2026 after a gap — treated as a settlement / true-up, not an in-force group.' : (tailYears.length ? 'Tail premium in ' + tailYears.join(', ') + ' — usually paid at exit for run-out coverage.' : (st === 'Inactive' ? 'No 2026 activity and no tail premium on record.' : 'No tail premium ever paid.'));
    const lifecycle = `<div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden">
      <div style="padding:11px 14px;border-bottom:1px solid var(--line)"><div style="font-size:13px;font-weight:700">Lifecycle &amp; tail premium</div><div style="font-size:11px;color:var(--text2);margin-top:2px">Tail premium is usually a termination signal — paid at exit for run-out</div></div>
      ${life.map((lf) => `<div style="display:flex;align-items:center;gap:10px;padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px"><span style="color:var(--text2)">${esc(lf.label)}</span><span style="margin-left:auto;font-weight:600;color:${lf.fg}">${esc(lf.val)}</span></div>`).join('')}
      <div style="padding:9px 14px;font-size:11.5px;color:var(--text2);background:var(--inset)">${esc(lifeSummary)}</div></div>`;

    // notes
    const notes = s.notes[g.code] || [];
    const notesHtml = notes.length
      ? notes.map((nt) => `<div style="background:var(--inset);border:1px solid var(--line);border-radius:5px;padding:8px 11px"><div style="font-size:10px;color:var(--text2);margin-bottom:3px">${esc(nt.ts)}</div><div style="font-size:12.5px;line-height:1.5">${esc(nt.text)}</div></div>`).join('')
      : `<div style="font-size:11.5px;color:var(--text2)">No notes yet. Renewal context and decisions live here.</div>`;
    const notesBlock = `<div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px 16px;display:flex;flex-direction:column;gap:10px">
      <div style="font-size:13px;font-weight:700">Notes</div>${notesHtml}
      <textarea data-act="noteDraft" placeholder="e.g. 2027 renewal: hold rate, monitor Q3 claims…" style="border:1px solid var(--line2);border-radius:5px;padding:8px 10px;font-size:12.5px;min-height:56px;resize:vertical;background:var(--inset);color:var(--text);font-family:inherit">${esc(s.noteDraft)}</textarea>
      <button data-act="addNote" style="align-self:flex-end;background:var(--accent);color:var(--accent-ink);border:none;border-radius:5px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer">Add note</button></div>`;

    return `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div><div style="display:flex;align-items:center;gap:10px"><h1 style="margin:0;font-size:18px;font-weight:700">${esc(g.name)}</h1><span style="font-size:10.5px;padding:1px 7px;border-radius:3px;border:1px solid ${gdStB};color:${gdStFg}">${esc(gdStatus)}</span></div>
          <div style="font-size:11.5px;color:var(--text2);margin-top:3px">${esc(gdMeta)}</div></div>
        <div style="margin-left:auto;display:flex;align-items:flex-end;gap:10px"><div style="font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--text2);padding-bottom:2px">Premium by year</div><div style="display:flex;align-items:flex-end;gap:2px;height:30px">${spark}</div></div></div>
      ${kpiRow}
      <div style="display:grid;grid-template-columns:1.15fr 1fr;gap:16px;align-items:start">
        <div style="display:flex;flex-direction:column;gap:16px">${yearsTable}${monthly}</div>
        <div style="display:flex;flex-direction:column;gap:16px">${lifecycle}${notesBlock}</div></div>`;
  }

  /* ------------------------------ Flagged --------------------------------- */
  function renderWatchlist({ scoped, pLabel }) {
    const s = state;
    const tabs = [['flagged', 'Flagged'], ['good', 'Good groups']].map(([id, label]) => { const on = s.wlTab === id; return `<div data-act="wlTab" data-id="${id}" style="padding:4px 12px;font-size:11.5px;cursor:pointer;background:${on ? 'var(--accent)' : 'var(--surface)'};color:${on ? 'var(--accent-ink)' : 'var(--text2)'};font-weight:${on ? 600 : 400}">${label}</div>`; }).join('');
    let sub, rowsHtml;
    if (s.wlTab === 'flagged') {
      const flagged = scoped.map((g) => ({ g, ...flagsFor(g) })).filter((x) => x.reasons.length);
      flagged.sort((a, b) => b.netLoss - a.netLoss);
      sub = flagged.length + ' groups flagged · chronic monthly loss · sorted by net short, 2026 YTD';
      rowsHtml = flagged.map((x) => {
        const e = x.e || [0, 0, 0]; const goodM = x.activeMonths - x.lossMonths, pct = x.activeMonths ? Math.round((x.lossMonths / x.activeMonths) * 100) : 0;
        const edge = 'var(' + lrV(e[1], e[0]) + ')';
        const monthsBlock = `<div style="display:flex;gap:16px;flex:none;text-align:center">
          <div><div style="font-size:14px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums">${x.activeMonths}</div><div style="font-size:9px;color:var(--text2);letter-spacing:.05em;text-transform:uppercase">Months</div></div>
          <div><div style="font-size:14px;font-weight:700;color:var(--good);font-variant-numeric:tabular-nums">${goodM}</div><div style="font-size:9px;color:var(--text2);letter-spacing:.05em;text-transform:uppercase">Good</div></div>
          <div><div style="font-size:14px;font-weight:700;color:var(--crit);font-variant-numeric:tabular-nums">${x.lossMonths}</div><div style="font-size:9px;color:var(--text2);letter-spacing:.05em;text-transform:uppercase">Bad</div></div>
          <div><div style="font-size:14px;font-weight:700;color:var(--serious);font-variant-numeric:tabular-nums">${pct}%</div><div style="font-size:9px;color:var(--text2);letter-spacing:.05em;text-transform:uppercase">Bad&nbsp;%</div></div></div>`;
        return `<div data-act="open" data-code="${esc(x.g.code)}" class="hov" style="background:var(--surface);border:1px solid var(--line);border-left:3px solid ${edge};border-radius:5px;padding:10px 14px;display:flex;align-items:center;gap:14px;cursor:pointer">
          <div style="width:190px;flex:none"><div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.g.name)}</div><div style="font-size:10.5px;color:var(--text2)">${esc(x.g.code)} · ${x.g.cap === 'VT' ? 'Vermont' : 'Alabama'}</div></div>
          <div style="flex:1;font-size:12.5px;line-height:1.5">${esc(x.reasons.join(' · '))}</div>${monthsBlock}
          <span style="font-size:11.5px;font-weight:600;padding:1px 7px;border-radius:3px;color:var(${lrV(e[1], e[0])});background:var(${lrV(e[1], e[0])}-soft);flex:none">${lrS(e[1], e[0])}</span>
          <div style="width:140px;text-align:right;flex:none"><div style="font-size:14px;font-weight:700;color:var(--crit)">${fS(x.netLoss)}</div><div style="font-size:9.5px;color:var(--text2);letter-spacing:.05em;text-transform:uppercase">net short YTD</div></div></div>`;
      }).join('');
    } else {
      const good = scoped.map((g) => { const gy = yearsOf(g); let p = 0, c = 0; for (const y of gy) { p += g.yr[y][0]; c += g.yr[y][1]; } return { g, p, c, n: p - c, years: gy.length }; })
        .filter((x) => x.years >= 3 && x.n > 0 && x.p > 0 && lr(x.c, x.p) < 50).sort((a, b) => b.n - a.n).slice(0, 15);
      sub = good.length + ' retention candidates · profitable, under 50% all-time LR, 3+ years';
      rowsHtml = good.map((x) => `<div data-act="open" data-code="${esc(x.g.code)}" class="hov" style="background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--good);border-radius:5px;padding:10px 14px;display:flex;align-items:center;gap:14px;cursor:pointer">
        <div style="width:190px;flex:none"><div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.g.name)}</div><div style="font-size:10.5px;color:var(--text2)">${esc(x.g.code)} · ${x.g.cap === 'VT' ? 'Vermont' : 'Alabama'}</div></div>
        <div style="flex:1;font-size:12.5px;line-height:1.5">${esc(x.years + ' years in program · ' + lrS(x.c, x.p) + ' all-time loss ratio · ' + fS(x.p) + ' lifetime premium')}</div>
        <span style="font-size:11.5px;font-weight:600;padding:1px 7px;border-radius:3px;color:var(${lrV(x.c, x.p)});background:var(${lrV(x.c, x.p)}-soft);flex:none">${lrS(x.c, x.p)}</span>
        <div style="width:140px;text-align:right;flex:none"><div style="font-size:14px;font-weight:700;color:var(--good)">${fS(x.n)}</div><div style="font-size:9.5px;color:var(--text2);letter-spacing:.05em;text-transform:uppercase">all-time net to captive</div></div></div>`).join('');
    }
    return `<div style="display:flex;align-items:center;gap:12px"><h1 style="margin:0;font-size:17px;font-weight:700">Program health</h1>
        <div style="display:flex;border:1px solid var(--line2);border-radius:5px;overflow:hidden">${tabs}</div>
        <span style="font-size:11.5px;color:var(--text2)">${esc(sub)}</span>
        <a data-act="nav" data-id="settings" style="margin-left:auto;font-size:11.5px;cursor:pointer;text-decoration:underline;color:var(--text2)">Edit thresholds</a></div>
      <div style="display:flex;flex-direction:column;gap:8px">${rowsHtml}</div>`;
  }

  /* -------------------------------- Cash ---------------------------------- */
  function renderCash() {
    const s = state;
    const C = s.db.cash, MN = C.months;
    const vtT = [0, 1, 2, 3, 4].map((i) => C.accounts.filter((a) => a.cap === 'VT').reduce((t, a) => t + a.m[i], 0));
    const alT = [0, 1, 2, 3, 4].map((i) => C.accounts.filter((a) => a.cap === 'AL').reduce((t, a) => t + a.m[i], 0));
    const accs = C.accounts.filter((a) => s.captive === 'all' || a.cap === s.captive);
    const tot = [0, 1, 2, 3, 4].map((i) => accs.reduce((t, a) => t + a.m[i], 0));
    const cap5 = C.capital.VT[4] + C.capital.AL[4];
    const sub = 'Monthly balances Jan–May 2026 · cash balance report · ' + (s.captive === 'all' ? 'all program accounts' : (s.captive === 'VT' ? 'Vermont accounts only' : 'Alabama accounts only')) + ' · period selector does not apply here';
    const mom = tot[4] - tot[3], ytdD = tot[4] - tot[0];
    const kpis = [
      { label: 'Cash · May 31, 2026', val: f$(tot[4]), fg: 'var(--text)', delta: 'scope: ' + (s.captive === 'all' ? 'program' : (s.captive === 'VT' ? 'Vermont' : 'Alabama')), dFg: 'var(--text2)' },
      { label: 'Change vs April', val: f$(mom), fg: nFg(mom), delta: mom >= 0 ? 'cash up in May' : 'cash down in May', dFg: 'var(--text2)' },
      { label: 'Change YTD', val: f$(ytdD), fg: nFg(ytdD), delta: 'since Jan 31 balance', dFg: 'var(--text2)' },
      { label: 'Vermont / Alabama split', val: fS(vtT[4]) + ' / ' + fS(alT[4]), fg: 'var(--text)', delta: 'Alabama +$100K capital held', dFg: 'var(--text2)' },
    ];
    const row = (name, m, opts) => `<tr style="background:${opts && opts.b ? 'var(--inset)' : 'transparent'}">
      <td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px;font-weight:${opts && opts.b ? 700 : 400};white-space:nowrap">${esc(name)}</td>
      ${[0, 1, 2, 3, 4].map((i) => `<td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;font-weight:${opts && opts.b ? 700 : 400}">${f$(m[i])}</td>`).join('')}
      <td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right;font-weight:600;color:${nFg(m[4] - m[0])}">${f$(m[4] - m[0])}</td></tr>`;
    let cashRows = '';
    if (s.captive !== 'AL') { for (const a of C.accounts.filter((x) => x.cap === 'VT')) cashRows += row(a.name, a.m); cashRows += row('Vermont total', vtT, { b: 1 }); }
    if (s.captive !== 'VT') { for (const a of C.accounts.filter((x) => x.cap === 'AL')) cashRows += row(a.name, a.m); cashRows += row('Alabama total', alT, { b: 1 }); cashRows += row('Alabama capital', C.capital.AL); }
    if (s.captive === 'all') { cashRows += row('Program cash total', tot, { b: 1 }); cashRows += row('Cash & capital total', [0, 1, 2, 3, 4].map((i) => tot[i] + C.capital.AL[i] + C.capital.VT[i]), { b: 1 }); }
    const cmx = Math.max(1, ...tot);
    const bars = tot.map((v, i) => `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;height:100%"><div style="font-size:9.5px;color:var(--text2);font-weight:600;white-space:nowrap">${fS(v)}</div><div style="width:60%;max-width:34px;height:${Math.max(2, Math.round((v / cmx) * 100))}px;background:var(--accent);border-radius:1px 1px 0 0"></div><div style="font-size:10px;color:var(--text2)">${MN[i]}</div></div>`).join('');
    const tieOne = (cap, label) => { const fs = s.db.fs[cap]; const acc = C.accounts.find((a) => a.name === C.fsCashAccount[cap]); const v = fs.cash - acc.m[4]; const ok = Math.abs(v) < 1; return `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--line);font-size:12.5px"><span style="width:70px;font-weight:700;flex:none">${label}</span><span style="flex:1;color:var(--text2);font-size:11.5px;line-height:1.4">${esc('FS cash ' + f$(fs.cash) + ' vs cash report ' + f$(acc.m[4]) + (ok ? '' : ' — variance ' + f$(v)))}</span><span style="font-size:11px;font-weight:600;padding:1px 7px;border-radius:3px;color:var(${ok ? '--good' : '--warn'});background:var(${ok ? '--good' : '--warn'}-soft);flex:none">${ok ? 'TIES' : 'OFF ' + fS(Math.abs(v))}</span></div>`; };
    return `<div style="display:flex;align-items:baseline;gap:10px"><h1 style="margin:0;font-size:17px;font-weight:700">Cash</h1><span style="font-size:11.5px;color:var(--text2)">${esc(sub)}</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${kpis.map(kpiTile).join('')}</div>
      <div style="display:grid;grid-template-columns:1.7fr 1fr;gap:16px;align-items:start">
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden">
          <div style="padding:11px 14px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:10px"><div style="font-size:13px;font-weight:700">Account balances by month</div><span style="font-size:11px;color:var(--text2)">2026 YTD · from the cash balance report</span></div>
          <table style="width:100%"><thead><tr>${th('Account', 'left', 'border-bottom:1px solid var(--line2)')}${MN.map((m) => th(m, 'right', 'border-bottom:1px solid var(--line2)')).join('')}${th('Δ YTD', 'right', 'border-bottom:1px solid var(--line2)')}</tr></thead><tbody>${cashRows}</tbody></table></div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px 16px"><div style="font-size:13px;font-weight:700">Total cash by month</div><div style="font-size:10.5px;color:var(--text2);margin-top:2px">${s.captive === 'all' ? 'Program' : 'Scope'} cash, excluding capital</div><div style="display:flex;align-items:flex-end;gap:10px;height:140px;margin-top:10px">${bars}</div></div>
          <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden"><div style="padding:11px 14px;border-bottom:1px solid var(--line)"><div style="font-size:13px;font-weight:700">Cash report vs captive FS</div><div style="font-size:11px;color:var(--text2);margin-top:2px">Captive entity accounts, May 31, 2026</div></div>${tieOne('VT', 'Vermont')}${tieOne('AL', 'Alabama')}<div style="padding:9px 14px;font-size:11px;color:var(--text2);background:var(--inset)">Alabama also holds $100,000 of capital outside these cash balances (cash &amp; capital total ${f$(tot[4] + cap5)}).</div></div></div></div>`;
  }

  /* ------------------------------ Uploads --------------------------------- */
  function renderUploads() {
    const files = [
      ['05.2026 PHIC Premium and Claims Paid by ERSC.xlsx', 'ok'], ['05.2026 PHIC Claims Recoverable.xlsx', 'ok'],
      ['05.2026 OTIC IC Premium and Claims Paid by ER Cell.xlsx', 'ok'], ['05.2026 OTIC IC Claims Recoverable.xlsx', 'ok'],
      ['PHIC May 2026 FS.pdf', 'ok'], ['OTIC IC May 2026 FS.pdf', 'ok'], ['2026 YTD Cash Balance Report (Hunter) - May.pdf', 'ok'],
      ['Funding & Enrollment — May 2026.xlsx', 'missing'],
    ].map(([name, st]) => `<div style="display:flex;align-items:center;gap:9px;padding:7px 14px;border-bottom:1px solid var(--line);font-size:12px"><span style="color:${st === 'ok' ? 'var(--good)' : 'var(--warn)'};font-size:12px;width:14px">${st === 'ok' ? '✓' : '○'}</span><span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${st === 'ok' ? 'var(--text)' : 'var(--text2)'}">${esc(name)}</span><span style="font-size:10px;color:${st === 'ok' ? 'var(--good)' : 'var(--warn)'};font-weight:600">${st === 'ok' ? 'PARSED' : 'AWAITING'}</span></div>`).join('');
    const checks = [
      ['PASS', '--good', 'Vermont Captive premium detail vs control total', '350 ERSC rows sum to $1,171,986.52 = workbook control total. All years 2020–2025 tie as well.'],
      ['PASS', '--good', 'Vermont Captive claims: recoverable vs impact total', 'Monthly recoverable YTD $140,885.45 = claims paid per impact tab, to the penny.'],
      ['PASS', '--good', 'Alabama Captive premium detail vs control total', '39 ER Cell rows sum to $626,200.31 = workbook control total.'],
      ['PASS', '--good', 'Alabama Captive claims: recoverable vs impact total', 'Monthly recoverable YTD $385,436.92 = claims paid per impact tab, to the penny.'],
      ['PASS', '--good', 'Alabama FS vs workbooks', 'FS gross premium written $626,200 and losses paid to ER Cell $385,437 both tie to workbook detail (FS rounds to whole dollars).'],
      ['WARN', '--warn', 'Vermont FS losses vs workbook claims', 'FS reports YTD losses paid to ERSCs of $145,472; the claims workbooks total $140,885.45 — a $4,587 variance. Likely losses paid directly vs recoverable timing; shown on the Vermont Captive tie-out panel until resolved.'],
      ['WARN', '--warn', 'Row-level claims: impact tab vs recoverable tab', 'Totals tie, but 51 groups differ at the row level between the two tabs (e.g. REGSC 141 R.E. Garrison Trucking: $0 on impact vs ($140,219) recoverable). Likely timing/allocation of recoveries — review before treating monthly detail as per-group truth.'],
      ['PASS', '--good', 'Cash report internal rollups', 'Vermont $7,833,289 and Alabama $1,640,452 account sums tie to the report’s own state rollups; program total $9,473,741.'],
      ['WARN', '--warn', 'Vermont FS cash vs cash report', 'PHIC FS cash & equivalents $5,311,900 vs cash report PHIC (incl. CD) $5,263,331 — $48,569 variance. OTIC IC ties exactly at $1,447,221. Shown on the Cash page.'],
      ['WARN', '--warn', 'Funding & enrollment file not uploaded', 'Enrollment, lives and size-band filters stay blank until the monthly funding file is loaded.'],
    ].map(([status, v, name, detail]) => `<div style="display:flex;align-items:flex-start;gap:12px;padding:9px 14px;border-bottom:1px solid var(--line)"><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;letter-spacing:.05em;color:var(${v});background:var(${v}-soft);flex:none;margin-top:1px">${status}</span><div><div style="font-size:12.5px;font-weight:600">${esc(name)}</div><div style="font-size:11.5px;color:var(--text2);margin-top:1px;line-height:1.45">${esc(detail)}</div></div></div>`).join('');
    return `<h1 style="margin:0;font-size:17px;font-weight:700">Uploads &amp; data</h1>
      <div style="display:grid;grid-template-columns:360px 1fr;gap:16px;align-items:start">
        <div style="display:flex;flex-direction:column;gap:16px">
          <div style="border:1.5px dashed var(--line2);border-radius:6px;background:var(--surface);padding:26px 18px;text-align:center"><div style="font-size:13px;font-weight:600">Drop the Jun 2026 file set here</div><div style="font-size:11.5px;color:var(--text2);margin-top:4px;line-height:1.5">Workbooks (.xlsx), FS statements (.pdf),<br>funding &amp; enrollment file</div><button data-act="browse" style="margin-top:12px;background:var(--inset);border:1px solid var(--line2);border-radius:5px;padding:6px 14px;font-size:12px;color:var(--text);cursor:pointer">Browse files</button></div>
          <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden"><div style="padding:10px 14px;font-size:12.5px;font-weight:700;border-bottom:1px solid var(--line)">May 2026 file set — first load</div>${files}</div></div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden">
            <div style="display:flex;align-items:center;padding:11px 14px;border-bottom:1px solid var(--line)"><div><div style="font-size:13px;font-weight:700">Validation preview — May 2026</div><div style="font-size:11px;color:var(--text2);margin-top:2px">All control totals tie · 2 warnings to review</div></div><button data-act="commit" title="Parsing pipeline wired in a later build" style="margin-left:auto;background:var(--accent);color:var(--accent-ink);border:none;border-radius:5px;padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer">Commit &amp; close May 2026</button></div>${checks}</div>
          <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden"><div style="padding:11px 14px;font-size:13px;font-weight:700;border-bottom:1px solid var(--line)">Import history</div>
            <table style="width:100%"><thead><tr>${th('Period', 'left', 'border-bottom:1px solid var(--line)')}${th('Committed', 'left', 'border-bottom:1px solid var(--line)')}${th('Files', 'right', 'border-bottom:1px solid var(--line)')}${th('Checks', 'left', 'border-bottom:1px solid var(--line)')}<th style="border-bottom:1px solid var(--line)"></th></tr></thead>
            <tbody><tr><td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);font-size:12.5px;font-weight:600">May 2026</td><td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12px;color:var(--text2)">Jul 22, 2026</td><td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:12.5px;text-align:right">7 of 8</td><td style="padding:var(--rp) 10px;border-bottom:1px solid var(--line);font-size:11.5px;color:var(--warn)">6 PASS · 4 WARN</td><td style="padding:var(--rp) 14px;border-bottom:1px solid var(--line);text-align:right"><a style="font-size:11.5px;cursor:pointer;text-decoration:underline">View snapshot</a></td></tr></tbody></table>
            <div style="padding:9px 14px;font-size:11.5px;color:var(--text2);background:var(--inset)">This is the first data load. Vermont Captive (PHIC) history 2020–2026 came in the annual workbook tabs; Alabama Captive (OTIC IC) group history begins 2026 (2024–25 were entity-level only).</div></div></div></div>`;
  }

  /* ------------------------------ Reports --------------------------------- */
  function renderReports() {
    const reports = [
      { title: 'Annual premium & claims by group', desc: 'The classic year-columns workbook: one row per group, premium / tail / claims / net / LR per year, 2020 to present. Respects the current captive and period scope.', scope: 'Excel-first' },
      { title: 'Reconciliation report', desc: 'Portal computed totals vs SRS statements of income for both captives, line by line, with variances highlighted. The audit trail behind the tie-out panel.', scope: 'Both captives' },
      { title: 'Flagged report', desc: 'Every flagged group — the chronic monthly losers — with reasons in plain English and net short YTD, sorted worst-first. Current thresholds embedded in the header.', scope: 'Point-in-time' },
      { title: 'Renewal packet — single group', desc: 'A group’s full scorecard as a PDF: all-years table, monthly claims, tail premium history, and your notes. Built for renewal conversations.', scope: 'Pick a group' },
    ];
    return `<h1 style="margin:0;font-size:17px;font-weight:700">Reports</h1>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;max-width:940px">${reports.map((rp) => `<div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:16px 18px;display:flex;flex-direction:column;gap:8px"><div style="font-size:13.5px;font-weight:700">${esc(rp.title)}</div><div style="font-size:12px;color:var(--text2);line-height:1.55;flex:1">${esc(rp.desc)}</div><div style="display:flex;gap:8px;margin-top:4px"><button title="Wired in build" style="background:var(--inset);border:1px solid var(--line2);border-radius:4px;padding:5px 12px;font-size:11.5px;color:var(--text);cursor:pointer">Excel</button><button title="Wired in build" style="background:var(--inset);border:1px solid var(--line2);border-radius:4px;padding:5px 12px;font-size:11.5px;color:var(--text);cursor:pointer">PDF</button><span style="margin-left:auto;font-size:10.5px;color:var(--text2);align-self:center">${esc(rp.scope)}</span></div></div>`).join('')}</div>`;
  }

  /* ------------------------------ Settings -------------------------------- */
  function renderSettings() {
    const t = state.thr;
    const thrRows = [
      { label: 'Flag: share of closed months losing money over', key: 'lossPct', val: t.lossPct, unit: '%' },
      { label: '…and net short YTD of at least', key: 'minLoss', val: t.minLoss, unit: '$' },
    ].map((r) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--line)"><span style="flex:1;font-size:12.5px">${esc(r.label)}</span><input data-act="thr" data-key="${r.key}" type="number" value="${r.val}" style="width:96px;border:1px solid var(--line2);border-radius:4px;padding:5px 8px;font-size:12.5px;text-align:right;background:var(--inset);color:var(--text)"><span style="width:26px;font-size:11px;color:var(--text2)">${r.unit}</span></div>`).join('');
    const capMeta = [
      { tag: 'Vermont', name: 'Protective Health Insurance Company IC (PHIC)', dom: 'group data 2020–' },
      { tag: 'Alabama', name: 'OneTrust Insurance Company IC (OTIC IC)', dom: 'group data 2026–' },
    ].map((cm) => `<div style="display:flex;gap:10px;padding:9px 14px;border-bottom:1px solid var(--line);font-size:12.5px"><span style="width:56px;font-weight:700">${esc(cm.tag)}</span><span style="flex:1">${esc(cm.name)}</span><span style="color:var(--text2)">${esc(cm.dom)}</span></div>`).join('');
    const periodMgmt = [
      { label: 'May 2026', status: 'Loaded · uncommitted', v: '--warn', action: 'Review' },
      { label: 'Jun 2026', status: 'Awaiting upload', v: '--muted', action: '—' },
    ].map((pm) => `<div style="display:flex;align-items:center;gap:10px;padding:7px 14px;border-bottom:1px solid var(--line);font-size:12.5px"><span style="width:80px;font-weight:600">${esc(pm.label)}</span><span style="font-size:10.5px;padding:1px 6px;border-radius:3px;color:var(${pm.v});background:var(${pm.v}-soft)">${esc(pm.status)}</span><button title="Wired in build" style="margin-left:auto;background:var(--inset);border:1px solid var(--line2);border-radius:4px;padding:3px 10px;font-size:11px;color:var(--text2);cursor:pointer">${esc(pm.action)}</button></div>`).join('');
    return `<h1 style="margin:0;font-size:17px;font-weight:700">Settings</h1>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;max-width:980px;align-items:start">
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden"><div style="padding:11px 14px;border-bottom:1px solid var(--line)"><div style="font-size:13px;font-weight:700">Flagged thresholds</div><div style="font-size:11px;color:var(--text2);margin-top:2px">Changes re-evaluate the flagged list immediately</div></div>${thrRows}</div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden"><div style="padding:11px 14px;font-size:13px;font-weight:700;border-bottom:1px solid var(--line)">Captive metadata</div>${capMeta}</div>
          <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden"><div style="padding:11px 14px;font-size:13px;font-weight:700;border-bottom:1px solid var(--line)">Period management</div>${periodMgmt}</div>
          <div style="background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px 16px;display:flex;gap:10px;align-items:center"><div style="flex:1"><div style="font-size:13px;font-weight:700">Security &amp; backup</div><div style="font-size:11.5px;color:var(--text2);margin-top:2px">Password managed via deploy env · single admin</div></div><button data-act="logout" style="background:var(--inset);border:1px solid var(--line2);border-radius:4px;padding:6px 12px;font-size:11.5px;color:var(--text);cursor:pointer">Lock session</button></div></div></div>`;
  }

  /* ------------------------------- render --------------------------------- */
  function applyChrome() { root.setAttribute('data-theme', state.theme); root.setAttribute('data-density', state.density); }
  function render() {
    applyChrome();
    // preserve focus + caret across innerHTML swaps (text inputs / textarea)
    const activeEl = document.activeElement;
    const focusKey = activeEl && activeEl.dataset && activeEl.dataset.act && ['search', 'noteDraft', 'email', 'pw', 'pw2', 'thr'].includes(activeEl.dataset.act)
      ? { act: activeEl.dataset.act, key: activeEl.dataset.key, start: activeEl.selectionStart, end: activeEl.selectionEnd } : null;

    if (state.authed === null) { root.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;color:var(--text2)">Loading…</div>`; return; }
    if (state.needsSetup && !state.authed) { renderSetup(); }
    else if (!state.authed) { renderLogin(); }
    else if (!state.db) { root.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;color:var(--text2)">Loading data…</div>`; }
    else { renderApp(); }

    if (focusKey) {
      const sel = focusKey.key ? `[data-act="${focusKey.act}"][data-key="${focusKey.key}"]` : `[data-act="${focusKey.act}"]`;
      const el = root.querySelector(sel);
      if (el) { el.focus(); try { el.setSelectionRange(focusKey.start, focusKey.end); } catch (e) {} }
    }
  }

  /* ---------------------------- interactions ------------------------------ */
  async function persistThresholds() {
    try { await fetch('/api/captive/settings/thresholds', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.thr) }); } catch (e) {}
  }

  root.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    switch (act) {
      case 'login': return doLogin();
      case 'setup': return doSetup();
      case 'logout': return doLogout();
      case 'nav': state.page = el.dataset.id; if (state.page !== 'group') state.groupCode = null; return render();
      case 'cap': state.captive = el.dataset.id; return render();
      case 'rail': state.rail = !state.rail; return render();
      case 'theme': state.theme = state.theme === 'light' ? 'dark' : 'light'; return render();
      case 'chartTable': state.chartTable = !state.chartTable; return render();
      case 'open': state.page = 'group'; state.groupCode = el.dataset.code; state.noteDraft = ''; return render();
      case 'tie': state.tieCap = el.dataset.id; return render();
      case 'wlTab': state.wlTab = el.dataset.id; return render();
      case 'sort': { const id = el.dataset.id; const numeric = ['p', 'c', 'n', 't', 'lr'].includes(id); state.sortDir = state.sortKey === id ? -state.sortDir : (numeric ? -1 : 1); state.sortKey = id; return render(); }
      case 'crumb': { const c = (window.__crumbs || [])[+el.dataset.i]; if (c && c.page) { state.page = c.page; if (c.tieCap) state.tieCap = c.tieCap; if (c.page !== 'group') state.groupCode = null; render(); } return; }
      case 'addNote': return doAddNote();
      case 'commit': case 'browse': case 'exportXlsx': return; // stubs (labeled in UI)
    }
  });

  root.addEventListener('input', (ev) => {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    switch (el.dataset.act) {
      case 'email': state.email = el.value; return;
      case 'pw': state.pw = el.value; return;
      case 'pw2': state.pw2 = el.value; return;
      case 'search': state.search = el.value; return render();
      case 'noteDraft': state.noteDraft = el.value; return;
    }
  });

  root.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    switch (el.dataset.act) {
      case 'period': state.period = el.value; return render();
      case 'from': state.from = el.value; return render();
      case 'to': state.to = el.value; return render();
      case 'fStatus': state.fStatus = el.value; return render();
      case 'fLR': state.fLR = el.value; return render();
      case 'thr': state.thr = { ...state.thr, [el.dataset.key]: +el.value || 0 }; render(); persistThresholds(); return;
    }
  });

  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || state.authed) return;
    if (state.needsSetup) { if (ev.target.closest('[data-act="pw"],[data-act="pw2"]')) doSetup(); return; }
    if (ev.target.closest('[data-act="email"],[data-act="pw"]')) doLogin();
  });

  async function doSetup() {
    if (state.busy) return;
    state.setupErr = '';
    if ((state.pw || '').length < 8) { state.setupErr = 'Password must be at least 8 characters.'; return render(); }
    if (state.pw !== state.pw2) { state.setupErr = 'Passwords do not match.'; return render(); }
    state.busy = true; render();
    try {
      const r = await fetch('/api/captive/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: state.pw }) });
      const j = await r.json();
      state.busy = false;
      if (j.ok) { state.needsSetup = false; state.pw = ''; state.pw2 = ''; await boot(); return; }
      state.setupErr = j.error === 'exists' ? 'Setup is already complete — use the sign-in screen.' : 'Could not create the login. Please try again.';
      if (j.error === 'exists') state.needsSetup = false;
      render();
    } catch (e) { state.busy = false; state.setupErr = 'Network error — please try again.'; render(); }
  }

  async function doLogin() {
    if (state.busy || state.locked) return;
    state.busy = true; state.loginErr = ''; render();
    try {
      const r = await fetch('/api/captive/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: state.email, password: state.pw }) });
      const j = await r.json();
      state.busy = false;
      if (j.authed) { state.pw = ''; state.locked = false; await boot(); return; }
      if (j.locked) { state.locked = true; state.minutes = j.minutes || 12; state.loginErr = ''; }
      else { state.loginErr = 'Incorrect email or password.'; }
      render();
    } catch (e) { state.busy = false; state.loginErr = 'Network error — please try again.'; render(); }
  }
  async function doLogout() {
    try { await fetch('/api/captive/logout', { method: 'POST' }); } catch (e) {}
    state.authed = false; state.db = null; state.page = 'overview'; state.groupCode = null; state.email = ''; state.pw = ''; render();
  }
  async function doAddNote() {
    const text = state.noteDraft.trim(); if (!text) return;
    const g = gById(primaryCode(state.groupCode)) || gById(state.groupCode);
    const code = g.code;
    try {
      const r = await fetch('/api/captive/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupCode: code, text }) });
      const note = await r.json();
      (state.notes[code] ||= []).push(note);
      state.noteDraft = ''; render();
    } catch (e) {}
  }

  /* -------------------------------- boot ---------------------------------- */
  async function loadData() {
    const r = await fetch('/api/captive/data');
    if (r.status === 401) { state.authed = false; return; }
    const j = await r.json();
    _mm = null;
    state.db = j;
    state.thr = j.thresholds || state.thr;
    state.notes = j.notes || {};
    state.authed = true;
  }
  async function boot() {
    try {
      const me = await (await fetch('/api/captive/me')).json();
      if (!me.authed) { state.authed = false; state.needsSetup = !!me.needsSetup; if (me.email) state.email = me.email; render(); return; }
      await loadData(); render();
    } catch (e) { state.authed = false; render(); }
  }

  render();
  boot();
})();
