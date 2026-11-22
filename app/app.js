/*
 * Promotions, Engineered: the dashboard.
 *
 * Runs in three places with the same code:
 *  - inside Claude as a published artifact: Claude drafts copy and reads
 *    voice documents, files save through the viewer's download prompt;
 *  - as a plain web page (GitHub Pages, or index.html opened locally): the
 *    engine, dashboard and Excel export all work, drafts come from templates;
 *  - later, behind a web app that supplies its own drafting endpoint.
 */
(function () {
  'use strict';

  var E = window.PromotionsEngine;
  var P = window.PromotionsPresets;
  var STORE_KEY = 'promotions-engineered.v1';
  var LIBS = {
    exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js',
    papa: 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js'
  };
  var ROLE_ORDER = ['hero', 'featured', 'reactivation', 'prelaunch', 'discovery'];
  var ROLE_HELP = {
    hero: 'The one or two titles that lead the month. Most exposures on every channel.',
    featured: 'Strong titles that get regular slots.',
    reactivation: 'Falling titles with a large past audience. Owned channels only by default.',
    prelaunch: 'Upcoming releases, teased before launch.',
    discovery: 'The long tail, one or two exposures each.'
  };
  var XL_FILL = { hero: 'FFC6EFCE', featured: 'FFBDD7EE', reactivation: 'FFF8CBAD', prelaunch: 'FFFFEB9C', discovery: 'FFE7E6E6' };

  // ------------------------------------------------------------- helpers
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled' || k === 'indeterminate') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el) {
    for (var i = 1; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid === null || kid === undefined || kid === false) continue;
      if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); continue; }
      el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
  }
  function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e4) return Math.round(n / 1e3) + 'k';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.round(n * 10) / 10);
  }
  function monthLabel(y, m) { return new Date(Date.UTC(y, m, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  function dateLabel(iso) { return new Date(iso + 'T00:00:00Z').toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function rolePill(role) { return role ? h('span', { class: 'pill r-' + role }, E.ROLE_LABELS[role]) : h('span', { class: 'pill' }, '—'); }
  function purposePill(p) { return p ? h('span', { class: 'purpose p-' + p, title: E.PURPOSE_TEXT[p] }, h('i'), E.PURPOSE_LABELS[p]) : h('span', { class: 'muted small' }, '—'); }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  function splitList(s) { return String(s || '').split(/[,\n]/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function splitChars(s) { return String(s || '').split(/\s+/).map(function (x) { return x.trim(); }).filter(Boolean); }

  var scripts = {};
  function loadScript(url) {
    if (!scripts[url]) {
      scripts[url] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = url; s.async = true;
        s.onload = resolve;
        s.onerror = function () { delete scripts[url]; reject(new Error('Could not load ' + url)); };
        document.head.appendChild(s);
      });
    }
    return scripts[url];
  }

  // -------------------------------------------------- Claude capabilities
  var Cap = { checked: false, sample: null, downloads: null };
  function initCaps() {
    var c = window.claude;
    if (!c || typeof c.use !== 'function') { Cap.checked = true; renderBar(); return; }
    Promise.all([
      c.use('sample').catch(function () { return null; }),
      c.use('downloads').catch(function () { return null; })
    ]).then(function (r) {
      Cap.sample = r[0]; Cap.downloads = r[1]; Cap.checked = true;
      renderBar();
      if (S.ui.tab === 'brand') render();
    });
  }

  function saveFile(filename, blob) {
    if (Cap.downloads) {
      return Cap.downloads.save({ filename: filename, data: blob }).then(function () {
        toast('Saved ' + filename);
      }, function (e) {
        if (e && e.code === 'declined') return;
        toast('Could not save the file' + (e && e.message ? ': ' + e.message : ''));
      });
    }
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    toast('Downloaded ' + filename);
    return Promise.resolve();
  }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { t = h('div', { id: 'toast', class: 'toast', role: 'status' }); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  // ---------------------------------------------------------------- state
  function brandFrom(id) {
    var b = E.clone(P.BRAND_PROFILES[id] || P.BRAND_PROFILES.blank);
    b.profileId = b.id; delete b.id; delete b.label;
    b.voiceDoc = null;
    return b;
  }
  function defaultMonth() {
    var now = new Date();
    var next = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));
    return next.getUTCFullYear() + '-' + pad(next.getUTCMonth() + 1);
  }
  function defaultState() {
    return {
      v: 1, month: defaultMonth(), industryId: 'gaming', source: 'demo', upload: null, mapping: null,
      overrides: { hero: [], featured: [], suppress: [], themes: {} },
      settings: {}, channels: E.clone(P.CHANNELS), brand: brandFrom('blank'),
      edits: {}, drafts: {}, seeded: false,
      ui: { tab: 'calendar', view: 'month', hidden: ['facebook', 'youtube'], poolFilter: 'programmed', voiceChannel: 'push' }
    };
  }
  function loadState() {
    var base = defaultState();
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      var s = JSON.parse(raw);
      if (!s || s.v !== 1) return base;
      var out = E.merge(base, s);
      out.channels = Array.isArray(s.channels) && s.channels.length ? s.channels : base.channels;
      out.ui = E.merge(base.ui, s.ui || {});
      return out;
    } catch (e) { return base; }
  }
  var S = loadState();
  var persist = debounce(function () {
    try {
      var copy = Object.assign({}, S);
      if (copy.upload && JSON.stringify(copy.upload).length > 3e6) copy.upload = null;
      localStorage.setItem(STORE_KEY, JSON.stringify(copy));
    } catch (e) { /* storage unavailable: the page still works for this visit */ }
  }, 300);

  // --------------------------------------------------------------- model
  var M = {};
  function rulesFor(chId) { return E.mergeRules(S.brand.globalRules, (S.brand.channelRules || {})[chId]); }
  function effectiveChannels() {
    return S.channels.map(function (c) {
      var ch = E.clone(c);
      var cr = (S.brand.channelRules || {})[c.id] || {};
      ch.fields = (ch.fields || []).map(function (f) {
        var max = cr.fieldMax && cr.fieldMax[f.key];
        return { key: f.key, label: f.label, max: max ? +max : f.max };
      });
      return ch;
    });
  }
  function recompute() {
    var I = P.INDUSTRIES[S.industryId] || P.INDUSTRIES.gaming;
    var ym = S.month.split('-').map(Number);
    var y = ym[0], m = ym[1] - 1;
    var rows, mapping;
    if (S.source === 'upload' && S.upload) {
      rows = S.upload.rows;
      mapping = S.mapping || E.guessMapping(S.upload.headers);
    } else {
      rows = P.demoRows(I.id, y, m);
      mapping = E.guessMapping(Object.keys(rows[0]));
    }
    var items = mapping.title && mapping.releaseDate ? E.normalize(rows, mapping, I.plans) : [];
    var settings = E.merge({ sessionBands: P.sessionBands(I) }, S.settings);
    var pool = E.buildPool(items, { year: y, month: m, settings: settings, overrides: S.overrides });
    var channels = effectiveChannels();
    var entries = E.applyEdits(E.placeAll(pool, channels), S.edits, pool);
    var byId = {};
    pool.items.forEach(function (p) { byId[p.id] = p; });
    var chById = {};
    channels.forEach(function (c) { chById[c.id] = c; });
    M = { I: I, y: y, m: m, rows: rows, mapping: mapping, items: items, pool: pool, byId: byId, channels: channels, chById: chById, entries: entries };
    M.audit = E.audit(entries, pool, channels);
    if (!S.seeded) {
      S.seeded = true;
      draftWithTemplates(draftable(), false);
    } else {
      // Template drafts are mechanical, so keep them in step with the current
      // titles and rules. Drafts someone edited, and Claude drafts, are kept.
      draftWithTemplates(draftable().filter(function (e) {
        var d = S.drafts[e.key];
        return d && d.source === 'template' && !d.edited;
      }), false);
    }
    M.copy = copyIssues();
  }
  function isScheduled(e) { var c = M.chById[e.channelId]; return c && c.enabled && !c.mirror; }
  function draftable() {
    return M.entries.filter(function (e) {
      var c = M.chById[e.channelId];
      return c && c.enabled && !c.mirror && (c.fields || []).length && !(e.open && e.type !== 'roundup' && e.type !== 'house') && !(e.type === 'roundup' && !(e.titles || []).length);
    });
  }
  function draftOf(e) {
    var d = S.drafts[e.key];
    if (!d) return null;
    if ((d.titleId || null) !== (e.titleId || null)) return Object.assign({ stale: true }, d);
    return d;
  }
  function copyIssues() {
    var out = {};
    M.entries.forEach(function (e) {
      if (!isScheduled(e)) return;
      var d = draftOf(e);
      if (!d || d.stale) return;
      var rules = rulesFor(e.channelId), list = [];
      (M.chById[e.channelId].fields || []).forEach(function (f) {
        E.checkText(d.fields[f.key], f.max, rules).forEach(function (i) { list.push(f.label + ': ' + i.msg); });
      });
      if (list.length) out[e.key] = list;
    });
    return out;
  }
  function changed(opts) {
    recompute();
    persist();
    if (!opts || !opts.quiet) render();
  }

  // ------------------------------------------------------------- drafting
  function draftWithTemplates(list, overwriteClaude) {
    list.forEach(function (e) {
      var cur = S.drafts[e.key];
      if (cur && cur.source === 'claude' && !overwriteClaude && (cur.titleId || null) === (e.titleId || null)) return;
      var ch = M.chById[e.channelId];
      S.drafts[e.key] = {
        fields: E.templateDraft(e, ch.fields, rulesFor(ch.id), M.I.vocab, M.byId),
        brief: E.needsBrief(e) ? E.templateBrief(e, M.I.vocab, M.byId) : null,
        source: 'template', titleId: e.titleId || null
      };
    });
  }
  function toneFor() {
    var t = P.TONES.filter(function (x) { return x.id === S.brand.tone; })[0] || P.TONES[1];
    return { label: t.id === 'custom' ? 'Custom' : t.label, guide: t.id === 'custom' ? (S.brand.customTone || '') : t.guide };
  }
  function brandForPrompt() {
    var t = toneFor();
    var doc = S.brand.voiceDoc && S.brand.voiceDoc.text;
    return {
      toneLabel: t.label, toneGuide: t.guide, voiceSummary: S.brand.voiceSummary || '',
      voiceDocExcerpt: !S.brand.voiceSummary && doc ? doc.slice(0, 5000) : '',
      examples: S.brand.examples || ''
    };
  }
  var sampleErrors = {
    not_granted: 'Claude drafting was not allowed in this view. Template drafts still work.',
    rate_limited: 'Claude is busy for this account. Wait a minute and try again.',
    invalid_json: 'Claude replied in an unexpected format. Try again with fewer posts.',
    prompt_too_large: 'Too much to send in one go. Draft one channel at a time.'
  };
  function sampleMessage(e) { return (e && sampleErrors[e.code]) || ('Claude could not draft this batch' + (e && e.message ? ': ' + e.message : '.')); }

  var job = null;
  function draftWithClaude(list, onProgress) {
    var ctl = new AbortController();
    job = { ctl: ctl, done: 0, total: list.length, flagged: 0, error: null };
    var groups = {};
    list.forEach(function (e) { (groups[e.channelId] = groups[e.channelId] || []).push(e); });
    var batches = [];
    Object.keys(groups).forEach(function (cid) {
      var g = groups[cid];
      for (var i = 0; i < g.length; i += 14) batches.push({ ch: M.chById[cid], entries: g.slice(i, i + 14) });
    });
    var chain = Promise.resolve();
    batches.forEach(function (b) {
      chain = chain.then(function () {
        if (ctl.signal.aborted || job.error) return;
        return runBatch(b, ctl.signal).then(function () {
          job.done += b.entries.length;
          onProgress();
        });
      });
    });
    return chain.catch(function (e) {
      if (e && e.code === 'cancelled') return;
      job.error = sampleMessage(e);
    }).then(function () {
      M.copy = copyIssues();
      persist();
      var j = job; job = null;
      return j;
    });
  }
  function runBatch(b, signal) {
    var fields = b.ch.fields, rules = rulesFor(b.ch.id);
    var prompt = E.buildDraftPrompt({ channel: b.ch, fields: fields, rules: rules, brand: brandForPrompt(), vocab: M.I.vocab, entries: b.entries });
    var byKey = {};
    b.entries.forEach(function (e) { byKey[e.key] = e; });
    function apply(arr) {
      var failures = [];
      (Array.isArray(arr) ? arr : []).forEach(function (r) {
        var e = r && byKey[r.id];
        if (!e) return;
        var out = {}, issues = [];
        fields.forEach(function (f) {
          out[f.key] = String(r[f.key] || '').trim();
          E.checkText(out[f.key], f.max, rules).forEach(function (i) { issues.push(f.label + ': ' + i.msg); });
        });
        // A retry returns copy only, so keep the brief from the first reply.
        var prev = S.drafts[e.key], brief = null;
        if (E.needsBrief(e)) {
          var old = prev && prev.source === 'claude' ? prev.brief : null;
          brief = {
            visual: String(r.visual || (old && old.visual) || '').trim(),
            message: String(r.message || (old && old.message) || '').trim()
          };
          if (!brief.visual && !brief.message) brief = E.templateBrief(e, M.I.vocab, M.byId);
        }
        S.drafts[e.key] = { fields: out, brief: brief, source: 'claude', titleId: e.titleId || null };
        if (issues.length) failures.push({ id: e.key, fields: out, issues: issues });
      });
      return failures;
    }
    return Cap.sample.json(prompt, { signal: signal }).then(function (arr) {
      var failures = apply(arr);
      if (!failures.length) return;
      return Cap.sample.json(E.buildRetryPrompt({ channel: b.ch, fields: fields, rules: rules, failures: failures }), { signal: signal })
        .then(function (arr2) { job.flagged += apply(arr2).length; });
    });
  }

  // -------------------------------------------------------------- render
  var root = document.getElementById('app');
  var els = {};
  function shell() {
    root.innerHTML = '';
    els.bar = h('header', { class: 'bar' });
    els.main = h('main', { class: 'wrap gutter' });
    els.overlay = h('div');
    append(root, [els.bar, els.main, h('footer', { class: 'wrap gutter' },
      'Promotions, Engineered. Demo catalogs are made up. Your data stays in this browser unless you export it.'), els.overlay]);
  }

  function renderBar() {
    if (!els.bar) return;
    els.bar.innerHTML = '';
    var industries = Object.keys(P.INDUSTRIES).map(function (k) { return P.INDUSTRIES[k]; });
    var claudeOn = !!Cap.sample;
    var tabs = [
      ['calendar', 'Calendar'], ['pool', 'Title pool'], ['channels', 'Channels'], ['brand', 'Brand voice'], ['data', 'Data']
    ];
    var poolCount = M.pool ? M.pool.items.filter(function (p) { return p.role; }).length : 0;
    var chCount = S.channels.filter(function (c) { return c.enabled; }).length;
    append(els.bar, h('div', { class: 'wrap gutter' },
      h('div', { class: 'bar-in' },
        h('div', { class: 'brand' },
          h('div', { class: 'brand-mark', 'aria-hidden': 'true' }, h('i')),
          h('div', null, h('h1', null, 'Promotions, Engineered'), h('small', null, 'Every title has a purpose. Every promotion has a plan.'))),
        h('div', { class: 'bar-controls' },
          h('label', { class: 'field grow' }, h('span', null, 'Month'),
            h('input', { type: 'month', id: 'month', value: S.month, onchange: function (ev) { if (ev.target.value) { S.month = ev.target.value; changed(); } } })),
          h('label', { class: 'field grow' }, h('span', null, 'Industry'),
            h('select', { id: 'industry', onchange: function (ev) { S.industryId = ev.target.value; S.overrides = { hero: [], featured: [], suppress: [], themes: {} }; S.edits = {}; if (S.source === 'demo') { S.drafts = {}; S.seeded = false; } changed(); } },
              industries.map(function (i) { return h('option', { value: i.id, selected: i.id === S.industryId }, i.label); }))),
          h('div', { class: 'field' }, h('span', { class: 'claude-state' + (claudeOn ? ' on' : ''), title: claudeOn ? 'Claude can draft copy here' : 'Open inside Claude to draft with Claude' }, h('i'), claudeOn ? 'Claude connected' : (Cap.checked ? 'Templates only' : 'Checking…')),
            h('div', { class: 'row' },
              h('button', { class: 'btn', id: 'btn-draft', onclick: openDraftModal }, 'Draft copy'),
              h('button', { class: 'btn btn-primary', id: 'btn-export', onclick: exportExcel }, 'Export Excel')))
        )
      ),
      h('nav', { class: 'tabs', role: 'tablist' }, tabs.map(function (t) {
        var count = t[0] === 'pool' ? poolCount : t[0] === 'channels' ? chCount : null;
        return h('button', { role: 'tab', id: 'tab-' + t[0], 'aria-selected': S.ui.tab === t[0] ? 'true' : 'false', onclick: function () { S.ui.tab = t[0]; persist(); render(); } },
          t[1], count !== null ? h('span', { class: 'count' }, count) : null);
      }))
    ));
  }

  function render() {
    renderBar();
    var main = els.main;
    main.innerHTML = '';
    if (S.source === 'demo') {
      append(main, h('div', { class: 'notice' },
        h('span', null, h('strong', null, 'Demo catalog. '), 'Every ' + M.I.vocab.item + ' and number here is made up. Upload your own catalog in Data.'),
        h('button', { class: 'btn btn-sm', onclick: function () { S.ui.tab = 'data'; render(); } }, 'Use my data')));
    } else if (!M.items.length) {
      append(main, h('div', { class: 'notice bad' }, 'No titles loaded. Map the Title and Release date columns in Data.'));
    }
    append(main, summary());
    var tab = S.ui.tab;
    if (tab === 'calendar') append(main, calendarTab());
    else if (tab === 'pool') append(main, poolTab());
    else if (tab === 'channels') append(main, channelsTab());
    else if (tab === 'brand') append(main, brandTab());
    else append(main, dataTab());
  }

  function summary() {
    var sched = M.entries.filter(isScheduled);
    var mirrored = M.entries.length - sched.length;
    var titles = {};
    sched.forEach(function (e) {
      if (e.titleId) titles[e.titleId] = 1;
      (e.titles || []).forEach(function (t) { titles[t.id] = 1; });
    });
    var heroes = M.pool.items.filter(function (p) { return p.role === 'hero'; }).map(function (p) { return p.title; });
    var dlist = draftable();
    var claude = 0, tmpl = 0;
    dlist.forEach(function (e) { var d = draftOf(e); if (d && !d.stale) { if (d.source === 'claude') claude++; else tmpl++; } });
    var warns = M.audit.filter(function (a) { return a.level === 'warn'; }).length + Object.keys(M.copy).length;
    var mix = { launch: 0, discover: 0, reengage: 0 }, mixTotal = 0;
    sched.forEach(function (e) { if (e.purpose) { mix[e.purpose]++; mixTotal++; } });
    function pct(k) { return mixTotal ? Math.round(100 * mix[k] / mixTotal) : 0; }
    var mixTile = h('div', { class: 'tile' }, h('span', { class: 'label' }, 'Purpose mix'),
      h('div', { class: 'mix', role: 'img', 'aria-label': pct('launch') + '% launch, ' + pct('discover') + '% discover, ' + pct('reengage') + '% re-engage' },
        ['launch', 'discover', 'reengage'].map(function (k) { return h('i', { class: 'p-' + k, style: 'width:' + pct(k) + '%' }); })),
      h('span', { class: 'sub mix-legend' }, ['launch', 'discover', 'reengage'].map(function (k) {
        return h('span', { class: 'p-' + k }, h('i'), pct(k) + '% ' + E.PURPOSE_LABELS[k].toLowerCase());
      })));
    return h('section', { class: 'summary', 'aria-label': 'Summary' },
      h('div', { class: 'tile' }, h('span', { class: 'label' }, monthLabel(M.y, M.m)), h('span', { class: 'big' }, sched.length), h('span', { class: 'sub' }, 'posts planned' + (mirrored ? ', plus ' + mirrored + ' mirrored' : ''))),
      h('div', { class: 'tile' }, h('span', { class: 'label' }, 'In rotation'), h('span', { class: 'big' }, Object.keys(titles).length), h('span', { class: 'sub' }, M.I.vocab.items + ' across ' + S.channels.filter(function (c) { return c.enabled && !c.mirror; }).length + ' channels')),
      h('div', { class: 'tile' }, h('span', { class: 'label' }, 'Heroes'), h('span', { class: 'big', style: 'font-size:17px;line-height:1.25' }, heroes.join(' · ') || 'None'), h('span', { class: 'sub' }, 'lead the month on every channel')),
      mixTile,
      h('div', { class: 'tile' }, h('span', { class: 'label' }, 'Drafts'), h('span', { class: 'big' }, (claude + tmpl) + ' / ' + dlist.length), h('span', { class: 'sub' }, claude + ' by Claude, ' + tmpl + ' from templates')),
      h('button', { class: 'tile' + (warns ? ' alert' : ''), onclick: openChecks }, h('span', { class: 'label' }, 'Checks'), h('span', { class: 'big' }, warns), h('span', { class: 'sub' }, warns ? 'need a look. Open the list' : 'all clear'))
    );
  }

  // ------------------------------------------------------------ calendar
  function visibleChannels() {
    return M.channels.filter(function (c) { return c.enabled && S.ui.hidden.indexOf(c.id) < 0; });
  }
  function entryTitle(e) {
    if (e.title) return e.title;
    if (e.titles && e.titles.length) return e.titles.map(function (t) { return t.title; }).join(', ');
    if (e.type === 'house') return e.slotName;
    if (e.type === 'roundup') return 'Nothing to round up';
    return 'Open slot';
  }
  function draftDot(e) {
    if (!isScheduled(e) || !(M.chById[e.channelId].fields || []).length) return h('span', { class: 'dot' });
    if (M.copy[e.key]) return h('span', { class: 'dot d-bad', title: 'Breaks copy rules' });
    var d = draftOf(e);
    if (!d || d.stale) return h('span', { class: 'dot', title: 'No draft' });
    return h('span', { class: 'dot d-' + d.source, title: d.source === 'claude' ? 'Claude draft' : 'Template draft' });
  }

  function calendarTab() {
    var wrap = h('section', { class: 'stack', style: 'gap:12px' });
    var vis = visibleChannels().map(function (c) { return c.id; });
    var counts = {};
    M.entries.forEach(function (e) { counts[e.channelId] = (counts[e.channelId] || 0) + 1; });
    var narrow = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    var view = narrow ? 'rundown' : S.ui.view;
    append(wrap, h('div', { class: 'toolbar' },
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Channels shown' },
        M.channels.filter(function (c) { return c.enabled; }).map(function (c) {
          var on = vis.indexOf(c.id) >= 0;
          return h('button', { class: 'chip', 'aria-pressed': on ? 'true' : 'false', onclick: function () {
            var i = S.ui.hidden.indexOf(c.id);
            if (i >= 0) S.ui.hidden.splice(i, 1); else S.ui.hidden.push(c.id);
            persist(); render();
          } }, c.name, h('span', { class: 'n' }, counts[c.id] || 0));
        })),
      h('div', { class: 'row' },
        h('div', { class: 'legend' }, ROLE_ORDER.map(rolePill)),
        narrow ? null : h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
          h('button', { 'aria-pressed': view === 'month' ? 'true' : 'false', onclick: function () { S.ui.view = 'month'; persist(); render(); } }, 'Month'),
          h('button', { 'aria-pressed': view === 'rundown' ? 'true' : 'false', onclick: function () { S.ui.view = 'rundown'; persist(); render(); } }, 'Rundown')))
    ));
    var list = M.entries.filter(function (e) { return vis.indexOf(e.channelId) >= 0; });
    append(wrap, view === 'month' ? monthGrid(list) : rundown(list));
    return wrap;
  }

  function monthGrid(list) {
    var grid = h('div', { class: 'month', role: 'grid', 'aria-label': 'Month calendar' });
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) { append(grid, h('div', { class: 'dow' }, d)); });
    var b = M.pool.bounds;
    var first = new Date(b.start).getUTCDay();
    var lead = (first + 6) % 7;
    for (var i = 0; i < lead; i++) append(grid, h('div', { class: 'day pad' }));
    var byDate = {};
    list.forEach(function (e) { (byDate[e.date] = byDate[e.date] || []).push(e); });
    for (var d = 1; d <= b.days; d++) {
      var iso = E.iso(Date.UTC(b.year, b.month, d));
      var week = Math.floor((d - 1) / 7) + 1;
      var theme = S.overrides.themes[week];
      var day = h('div', { class: 'day' },
        h('div', { class: 'day-head' }, h('span', { class: 'day-num' }, d), theme && theme.name ? h('span', { class: 'day-theme', title: theme.name }, theme.name) : null));
      (byDate[iso] || []).forEach(function (e) {
        var ch = M.chById[e.channelId];
        var cls = 't' + (e.type === 'house' ? ' house' : '') + (e.open ? ' open' : '');
        append(day, h('button', { class: 'slot r-' + (e.role || 'none'), title: ch.name + ' · ' + e.slotName + ' · ' + entryTitle(e), onclick: function () { openEntry(e.key); } },
          h('time', null, e.time), h('span', { class: 'chan' }, ch.short), h('span', { class: cls }, entryTitle(e)), draftDot(e)));
      });
      append(grid, day);
    }
    var trail = (7 - ((lead + b.days) % 7)) % 7;
    for (var j = 0; j < trail; j++) append(grid, h('div', { class: 'day pad' }));
    return grid;
  }

  function rundown(list) {
    if (!list.length) return h('div', { class: 'panel empty' }, 'No posts for the channels shown. Turn a channel on above.');
    var body = h('tbody');
    var last = null;
    list.forEach(function (e) {
      if (e.date !== last) {
        last = e.date;
        var wk = Math.floor((+e.date.slice(8) - 1) / 7) + 1;
        var th = S.overrides.themes[wk];
        append(body, h('tr', { class: 'date-row' }, h('td', { colspan: '9' }, dateLabel(e.date), th && th.name ? h('span', { class: 'day-theme', style: 'margin-left:10px' }, th.name) : null)));
      }
      var ch = M.chById[e.channelId];
      var d = draftOf(e);
      var first = ch.fields && ch.fields[0];
      var preview = e.mirrorOf ? 'Mirrors ' + M.chById[ch.mirror.of].name : (d && !d.stale && first ? d.fields[first.key] : '');
      append(body, h('tr', { class: 'click', tabindex: '0', onclick: function () { openEntry(e.key); }, onkeydown: function (ev) { if (ev.key === 'Enter') openEntry(e.key); } },
        h('td', { class: 'mono small' }, e.time),
        h('td', null, h('span', { class: 'chan', title: ch.name }, ch.short)),
        h('td', { class: 'small muted' }, e.slotName),
        h('td', null, h('div', { class: 'title-cell r-' + (e.role || 'none') }, h('span', { class: 'bar-c' }), h('span', { class: e.type === 'house' ? 'muted' : '' }, entryTitle(e)), e.manual ? h('span', { class: 'pill' }, 'Edited') : null)),
        h('td', null, purposePill(e.purpose)),
        h('td', null, rolePill(e.role)),
        h('td', { class: 'small' }, e.format),
        h('td', { class: 'draft-cell small', title: preview || '' }, preview || (e.mirrorOf ? '' : '—')),
        h('td', null, draftDot(e))));
    });
    return h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, ['Time', 'Ch', 'Slot', 'Title', 'Purpose', 'Tier', 'Format', 'Draft', ''].map(function (x) { return h('th', null, x); }))), body));
  }

  // --------------------------------------------------------- entry drawer
  function closeOverlay() { els.overlay.innerHTML = ''; document.removeEventListener('keydown', escClose); }
  function escClose(ev) { if (ev.key === 'Escape') { closeOverlay(); render(); } }
  function openDrawer(head, body) {
    els.overlay.innerHTML = '';
    append(els.overlay, [
      h('div', { class: 'scrim', onclick: function () { closeOverlay(); render(); } }),
      h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'drawer-head' }, head, h('button', { class: 'btn btn-ghost btn-sm', 'aria-label': 'Close', onclick: function () { closeOverlay(); render(); } }, 'Close')),
        h('div', { class: 'drawer-body' }, body))
    ]);
    document.addEventListener('keydown', escClose);
    var f = els.overlay.querySelector('.drawer button, .drawer select');
    if (f) f.focus();
  }

  function openEntry(key) {
    var e = M.entries.filter(function (x) { return x.key === key; })[0];
    if (!e) return;
    var ch = M.chById[e.channelId];
    var head = h('div', { class: 'stack', style: 'gap:4px' },
      h('span', { class: 'label' }, ch.name + ' · ' + dateLabel(e.date) + ' · ' + e.time),
      h('h2', null, e.slotName));
    var body = [];
    body.push(h('div', { class: 'kv' },
      h('span', null, 'Purpose'), h('span', null, purposePill(e.purpose)),
      h('span', null, 'Tier'), h('span', null, rolePill(e.role)),
      h('span', null, 'Angle'), h('span', null, e.framing ? (E.FRAMING_TEXT[e.framing] || e.framing) : '—'),
      h('span', null, 'Format'), h('span', null, e.format || '—'),
      h('span', null, 'Plan'), h('span', null, e.plan ? planLabel(e.plan) : '—'),
      e.theme ? h('span', null, 'Theme') : null, e.theme ? h('span', null, e.theme) : null,
      e.note ? h('span', null, 'Note') : null, e.note ? h('span', null, e.note) : null));

    if (e.mirrorOf) {
      body.push(h('p', { class: 'hint' }, 'This post copies ' + M.chById[ch.mirror.of].name + (ch.mirror.delayDays ? ' ' + ch.mirror.delayDays + ' day later' : ' at the same time') + '. Edit the original post to change it.'));
      body.push(h('button', { class: 'btn', onclick: function () { openEntry(e.mirrorOf); } }, 'Open the original'));
      openDrawer(head, body); return;
    }

    if (e.type === 'title') {
      var sel = h('select', { id: 'entry-title', onchange: function (ev) {
        var v = ev.target.value;
        if (v === '__engine') delete S.edits[key];
        else S.edits[key] = { titleId: v === '__open' ? null : v };
        changed({ quiet: true }); render(); openEntry(key);
      } });
      append(sel, h('option', { value: '__engine', selected: !S.edits[key] }, 'Engine pick'));
      append(sel, h('option', { value: '__open', selected: !!S.edits[key] && S.edits[key].titleId === null }, 'Leave open'));
      ROLE_ORDER.forEach(function (r) {
        var g = h('optgroup', { label: E.ROLE_LABELS[r] });
        M.pool.items.filter(function (p) { return p.role === r; }).forEach(function (p) {
          append(g, h('option', { value: p.id, selected: !!S.edits[key] && S.edits[key].titleId === p.id }, p.title));
        });
        append(sel, g);
      });
      var bench = h('optgroup', { label: 'Not programmed this month' });
      M.pool.items.filter(function (p) { return p.status === 'bench'; }).forEach(function (p) { append(bench, h('option', { value: p.id, selected: !!S.edits[key] && S.edits[key].titleId === p.id }, p.title)); });
      append(sel, bench);
      body.push(h('label', { class: 'field' }, h('span', null, 'Title' + (e.title ? ': ' + e.title : '')), sel));
    } else if (e.titles && e.titles.length) {
      body.push(h('div', { class: 'field' }, h('span', null, e.type === 'roundup' ? 'Releases in this round-up' : 'Titles in this set'),
        h('ul', { style: 'margin:0;padding-left:18px' }, e.titles.map(function (t) { return h('li', null, t.title, t.date ? h('span', { class: 'muted small' }, ' · ' + dateLabel(t.date)) : null); }))));
    } else if (e.type === 'house') {
      body.push(h('p', { class: 'hint' }, 'A brand post that is not about one ' + M.I.vocab.item + '. The draft is a starting idea for the team.'));
    }

    var fields = ch.fields || [];
    if (fields.length && !(e.open && e.type === 'title')) {
      var d = draftOf(e);
      var rules = rulesFor(ch.id);
      var sec = h('section', { class: 'stack', style: 'gap:12px' });
      append(sec, h('div', { class: 'panel-head' }, h('h3', null, 'Draft copy'),
        h('span', { class: 'pill' }, d ? (d.stale ? 'Out of date' : (d.source === 'claude' ? 'Claude draft' : 'Template draft')) : 'No draft')));
      if (d && d.stale) append(sec, h('p', { class: 'hint' }, 'The title changed after this was drafted. Redraft it.'));
      fields.forEach(function (f) {
        var val = d ? (d.fields[f.key] || '') : '';
        var counter = h('span', { class: 'counter' });
        var issuesEl = h('div', { class: 'issues' });
        function refresh(v) {
          counter.textContent = v.length + ' / ' + f.max;
          counter.className = 'counter' + (v.length > f.max ? ' over' : '');
          issuesEl.innerHTML = '';
          E.checkText(v, f.max, rules).filter(function (i) { return i.code !== 'length'; }).forEach(function (i) { append(issuesEl, h('span', { class: 'issue' }, i.msg)); });
        }
        var ta = h('textarea', { id: 'f-' + f.key, rows: f.max > 120 ? 5 : 2, value: val, oninput: function (ev) {
          var cur = S.drafts[key] && !draftOf(e).stale ? S.drafts[key] : { fields: {}, source: 'template', titleId: e.titleId || null };
          cur.fields = Object.assign({}, cur.fields); cur.fields[f.key] = ev.target.value; cur.source = cur.source === 'claude' ? 'claude' : 'template'; cur.edited = true;
          cur.titleId = e.titleId || null;
          S.drafts[key] = cur; refresh(ev.target.value); M.copy = copyIssues(); persist();
        } });
        refresh(val);
        append(sec, h('label', { class: 'field' }, h('span', { class: 'row', style: 'justify-content:space-between' }, f.label + ' (Draft)', counter), ta, issuesEl));
      });
      append(sec, h('div', { class: 'row' },
        Cap.sample ? h('button', { class: 'btn btn-primary btn-sm', onclick: function (ev) {
          ev.target.disabled = true; ev.target.textContent = 'Drafting…';
          draftWithClaude([e], function () {}).then(function (j) {
            if (j && j.error) toast(j.error);
            openEntry(key);
          });
        } }, 'Draft with Claude') : null,
        h('button', { class: 'btn btn-sm', onclick: function () { draftWithTemplates([e], true); M.copy = copyIssues(); persist(); openEntry(key); } }, 'Fill from template'),
        d ? h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { delete S.drafts[key]; M.copy = copyIssues(); persist(); openEntry(key); } }, 'Clear') : null));
      if (!Cap.sample) append(sec, h('p', { class: 'hint' }, 'Open this tool inside Claude to have Claude write drafts in your brand voice.'));
      body.push(sec);
    }
    if (E.needsBrief(e)) body.push(briefSection(e));
    openDrawer(head, body);
  }

  function briefSection(e) {
    var key = e.key;
    var basics = E.briefBasics(e, M.I.vocab);
    var d = draftOf(e);
    var brief = d && !d.stale && d.brief ? d.brief : null;
    function update(k, v) {
      var cur = S.drafts[key];
      if (!cur || draftOf(e).stale) {
        cur = { fields: {}, source: 'template', titleId: e.titleId || null };
        S.drafts[key] = cur;
      }
      cur.brief = Object.assign({}, cur.brief || E.templateBrief(e, M.I.vocab, M.byId));
      cur.brief[k] = v;
      cur.edited = true;
      persist();
    }
    return h('section', { class: 'stack', style: 'gap:12px' },
      h('div', { class: 'panel-head' }, h('h3', null, 'Creative brief'), h('span', { class: 'pill' }, brief ? 'Draft' : 'No brief yet')),
      h('div', { class: 'kv' },
        h('span', null, 'Spec'), h('span', null, basics.spec),
        h('span', null, 'Asset needed'), h('span', null, basics.asset)),
      h('label', { class: 'field' }, h('span', null, 'Visual idea (Draft)'),
        h('textarea', { id: 'brief-visual', rows: 3, value: brief ? brief.visual : '', placeholder: 'What the viewer sees.', oninput: function (ev) { update('visual', ev.target.value); } })),
      h('label', { class: 'field' }, h('span', null, 'Key message (Draft)'),
        h('input', { type: 'text', id: 'brief-message', value: brief ? brief.message : '', placeholder: 'The one thing to remember.', oninput: function (ev) { update('message', ev.target.value); } })));
  }
  function planLabel(id) {
    if (id === 'both') return 'All plans';
    var p = M.I.plans.filter(function (x) { return x.id === id; })[0];
    return p ? p.label : id;
  }

  // -------------------------------------------------------------- checks
  function openChecks() {
    var items = [];
    M.audit.forEach(function (a) { items.push({ level: a.level, msg: a.msg, key: a.keys && a.keys[0] }); });
    Object.keys(M.copy).forEach(function (k) {
      var e = M.entries.filter(function (x) { return x.key === k; })[0];
      if (e) items.push({ level: 'warn', msg: M.chById[e.channelId].name + ', ' + dateLabel(e.date) + ' ' + e.time + ': ' + M.copy[k].join('; '), key: k });
    });
    items.sort(function (a, b) { return (a.level === 'warn' ? 0 : 1) - (b.level === 'warn' ? 0 : 1); });
    var body = items.length ? h('div', { class: 'check-list' }, items.map(function (it) {
      return h('button', { class: 'check-item ' + it.level, onclick: function () { if (it.key) openEntry(it.key); } }, h('i'), h('span', null, it.msg));
    })) : h('p', { class: 'empty' }, 'Nothing to fix. Every channel is filled and every draft follows the rules.');
    openDrawer(h('div', { class: 'stack', style: 'gap:4px' }, h('span', { class: 'label' }, 'Checks'), h('h2', null, items.length + ' to review')),
      [h('p', { class: 'hint' }, 'Red items break a rule: open slots, repeats inside the gap, or copy that breaks your brand rules. Amber items are worth a look.'), body]);
  }

  // ------------------------------------------------------------ pool tab
  function toggleOverride(kind, id) {
    var o = S.overrides;
    var had = o[kind].indexOf(id) >= 0;
    ['hero', 'featured', 'suppress'].forEach(function (k) { o[k] = o[k].filter(function (x) { return x !== id; }); });
    if (!had) o[kind].push(id);
    changed();
  }
  function poolTab() {
    var f = S.ui.poolFilter;
    var items = M.pool.items.slice().sort(function (a, b) {
      var ra = a.role ? ROLE_ORDER.indexOf(a.role) : (a.status === 'bench' ? 6 : 7);
      var rb = b.role ? ROLE_ORDER.indexOf(b.role) : (b.status === 'bench' ? 6 : 7);
      return ra - rb || b.score - a.score || a.title.localeCompare(b.title);
    }).filter(function (p) {
      if (f === 'programmed') return !!p.role;
      if (f === 'bench') return p.status === 'bench';
      if (f === 'out') return p.status === 'excluded' || p.status === 'suppressed';
      return true;
    });
    var counts = { programmed: 0, bench: 0, out: 0, all: M.pool.items.length };
    M.pool.items.forEach(function (p) { if (p.role) counts.programmed++; else if (p.status === 'bench') counts.bench++; else counts.out++; });
    var body = h('tbody');
    items.forEach(function (p) {
      var trend = p.trend;
      append(body, h('tr', null,
        h('td', null, h('div', { class: 'title-cell r-' + (p.role || 'none') }, h('span', { class: 'bar-c' }), h('div', null, h('div', null, p.title), h('div', { class: 'small muted' }, p.kind || '')))),
        h('td', null, p.role ? rolePill(p.role) : h('span', { class: 'small muted' }, p.status === 'bench' ? 'Bench' : p.status === 'suppressed' ? 'Suppressed' : 'Excluded')),
        h('td', { class: 'small' }, p.signal ? E.SIGNAL_LABELS[p.signal] : '—'),
        h('td', { class: 'small muted', style: 'max-width:220px' }, p.roleReason || p.reason || '', p.flags.indexOf('borderline') >= 0 ? ' · borderline audience' : ''),
        h('td', { class: 'num' }, p.upcoming ? '—' : Math.round((p.score || 0) * 100)),
        h('td', { class: 'num' }, fmtNum(p.users)),
        h('td', { class: 'num' }, fmtNum(p.volume)),
        h('td', { class: 'num ' + (trend > 0 ? 'trend-up' : trend < 0 ? 'trend-down' : '') }, trend === null || trend === undefined ? '—' : (trend > 0 ? '+' : '') + Math.round(trend) + '%'),
        h('td', { class: 'num' }, p.stickiness ? p.stickiness.toFixed(1) : '—'),
        h('td', { class: 'small' }, bandLabel(p.band)),
        h('td', { class: 'small' }, planLabel(p.plan)),
        h('td', { class: 'small mono' }, p.releaseDate ? E.iso(p.releaseDate) : '—'),
        h('td', null, h('div', { class: 'ov' },
          ['hero', 'featured', 'suppress'].map(function (k) {
            return h('button', { class: 'o-' + k, 'aria-pressed': S.overrides[k].indexOf(p.id) >= 0 ? 'true' : 'false', title: k === 'suppress' ? 'Keep out of this month' : 'Force into ' + k, onclick: function () { toggleOverride(k, p.id); } },
              k === 'hero' ? 'Hero' : k === 'featured' ? 'Feat.' : 'Off');
          })))
      ));
    });
    var table = h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null,
        h('th', null, 'Title'), h('th', null, 'Tier'), h('th', null, 'Signal'), h('th', null, 'Why'), h('th', { class: 'num' }, 'Score'),
        h('th', { class: 'num' }, M.I.vocab.audience), h('th', { class: 'num' }, M.I.vocab.volume + ' (min)'), h('th', { class: 'num' }, 'Trend'),
        h('th', { class: 'num' }, 'Sessions / user'), h('th', null, 'Session'), h('th', null, 'Plan'), h('th', null, 'Release'), h('th', null, 'Override'))),
      body));
    var left = h('div', { class: 'stack', style: 'gap:12px;min-width:0' },
      h('div', { class: 'toolbar' },
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter titles' },
          [['programmed', 'Programmed'], ['bench', 'Bench'], ['out', 'Left out'], ['all', 'All']].map(function (x) {
            return h('button', { 'aria-pressed': f === x[0] ? 'true' : 'false', onclick: function () { S.ui.poolFilter = x[0]; persist(); render(); } }, x[1] + ' ' + counts[x[0]]);
          })),
        h('p', { class: 'hint' }, 'Score = volume rank ' + Math.round(M.pool.settings.weights.volume * 100) + '% + stickiness rank ' + Math.round(M.pool.settings.weights.stickiness * 100) + '%. Volume gets a title in; stickiness moves it up.')),
      table);
    return h('div', { class: 'cols' }, left, h('div', { class: 'stack', style: 'gap:14px' }, themesPanel(), settingsPanel()));
  }
  function bandLabel(id) {
    var b = M.pool.settings.sessionBands.filter(function (x) { return x.id === id; })[0];
    return b ? b.label : '—';
  }
  function themesPanel() {
    var weeks = Math.ceil(M.pool.bounds.days / 7);
    var programmed = M.pool.items.filter(function (p) { return p.role; });
    var rows = [];
    for (var w = 1; w <= weeks; w++) {
      (function (wk) {
        var t = S.overrides.themes[wk] || {};
        rows.push(h('div', { class: 'stack', style: 'gap:6px' },
          h('span', { class: 'label' }, 'Week ' + wk + ' · days ' + ((wk - 1) * 7 + 1) + '–' + Math.min(wk * 7, M.pool.bounds.days)),
          h('div', { class: 'row', style: 'flex-wrap:nowrap' },
            h('input', { type: 'text', id: 'theme-' + wk, placeholder: 'No theme', value: t.name || '', style: 'flex:1', 'aria-label': 'Theme for week ' + wk, onchange: function (ev) {
              var cur = S.overrides.themes[wk] || {}; cur.name = ev.target.value.trim();
              if (!cur.name && !cur.heroId) delete S.overrides.themes[wk]; else S.overrides.themes[wk] = cur; changed();
            } }),
            h('select', { 'aria-label': 'Theme lead for week ' + wk, style: 'flex:1', onchange: function (ev) {
              var cur = S.overrides.themes[wk] || {}; cur.heroId = ev.target.value || null;
              if (!cur.name && !cur.heroId) delete S.overrides.themes[wk]; else S.overrides.themes[wk] = cur; changed();
            } }, h('option', { value: '' }, 'Lead title'), programmed.map(function (p) { return h('option', { value: p.id, selected: t.heroId === p.id }, p.title); })))));
      })(w);
    }
    return h('div', { class: 'panel' }, h('h3', null, 'Themed weeks'), h('p', { class: 'hint' }, 'Optional. A theme labels the week and gives its lead title extra slots on every channel.'), rows);
  }
  function settingsPanel() {
    var st = M.pool.settings;
    function num(label, path, step) {
      var cur = path.reduce(function (o, k) { return o && o[k]; }, st);
      return h('label', { class: 'field' }, h('span', null, label), h('input', { type: 'number', step: step || 1, value: cur, onchange: function (ev) {
        var v = parseFloat(ev.target.value); if (isNaN(v)) return;
        var o = S.settings;
        for (var i = 0; i < path.length - 1; i++) { o[path[i]] = o[path[i]] || {}; o = o[path[i]]; }
        o[path[path.length - 1]] = v; changed();
      } }));
    }
    var plans = M.I.plans;
    return h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', null, 'Selection rules'), h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { S.settings = {}; changed(); } }, 'Reset')),
      h('span', { class: 'label' }, 'How many per tier'),
      h('div', { class: 'form-grid' }, num('Heroes', ['heroCount']), num('Featured', ['featuredCount']), num('Reactivation', ['reactivationCount']), num('Pre-launch', ['prelaunchCount']), num('Discovery', ['discoveryCount'])),
      h('span', { class: 'label' }, 'Who qualifies'),
      h('div', { class: 'form-grid' },
        num('Min ' + M.I.vocab.audience + ', ' + plans[0].label, ['floors', 'premium']),
        num('Min ' + M.I.vocab.audience + ', ' + plans[1].label, ['floors', 'basic']),
        num('New for (days)', ['newWindowDays']),
        num('Declining below (%)', ['declineThreshold']),
        num('Performing = top (%)', ['performingTopPct']),
        num('Tease ahead (days)', ['prelaunchLeadDays'])),
      h('span', { class: 'label' }, 'Balance'),
      h('div', { class: 'form-grid' }, num(plans[0].label + '-only share (%)', ['premiumShare'])),
      h('p', { class: 'hint' }, ROLE_ORDER.map(function (r) { return E.ROLE_LABELS[r] + ': ' + ROLE_HELP[r]; }).join(' ')));
  }

  // -------------------------------------------------------- channels tab
  function channelsTab() {
    var cards = S.channels.map(function (c, idx) {
      var eff = M.chById[c.id];
      var on = !!c.enabled;
      var head = h('div', { class: 'panel-head' },
        h('div', { class: 'stack', style: 'gap:2px' }, h('span', { class: 'label' }, c.group), h('h3', null, c.name)),
        h('label', { class: 'switch', title: on ? 'Turn off' : 'Turn on' }, h('input', { type: 'checkbox', checked: on, 'aria-label': 'Use ' + c.name, onchange: function (ev) { c.enabled = ev.target.checked; changed(); } }), h('span')));
      var parts = [head, h('p', { class: 'hint' }, c.summary)];
      if (c.mirror) {
        var src = S.channels.filter(function (x) { return x.id === c.mirror.of; })[0];
        parts.push(h('div', { class: 'kv' }, h('span', null, 'Copies'), h('span', null, src ? src.name : c.mirror.of),
          h('span', null, 'Delay'), h('span', null, (c.mirror.delayDays || 0) + ' day' + (c.mirror.delayDays === 1 ? '' : 's')),
          h('span', null, 'Formats'), h('span', null, c.mirror.formats ? c.mirror.formats.join(', ') : 'All')));
        return h('div', { class: 'panel' + (on ? '' : ' card-off') }, parts);
      }
      parts.push(h('div', { class: 'stack', style: 'gap:6px' }, h('span', { class: 'label' }, 'Takes these tiers · max posts per title'),
        h('div', { class: 'row' }, ROLE_ORDER.map(function (r) {
          var acc = (c.acceptsRoles || []).indexOf(r) >= 0;
          return h('div', { class: 'row', style: 'gap:4px;flex-wrap:nowrap' },
            h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: acc, onchange: function (ev) {
              c.acceptsRoles = ROLE_ORDER.filter(function (x) { return x === r ? ev.target.checked : (c.acceptsRoles || []).indexOf(x) >= 0; });
              if (c.fallbackRoles) c.fallbackRoles = c.fallbackRoles.filter(function (x) { return c.acceptsRoles.indexOf(x) >= 0; });
              changed();
            } }), h('span', { class: 'pill r-' + r }, E.ROLE_LABELS[r])),
            acc ? h('input', { type: 'number', min: 0, max: 20, value: (c.caps || {})[r] || 1, style: 'width:56px;height:28px', 'aria-label': 'Max ' + E.ROLE_LABELS[r] + ' posts per title', onchange: function (ev) { c.caps = c.caps || {}; c.caps[r] = Math.max(0, parseInt(ev.target.value, 10) || 0); changed(); } }) : null);
        }))));
      parts.push(h('div', { class: 'row' },
        h('label', { class: 'field' }, h('span', null, 'Hours between repeats'), h('input', { type: 'number', min: 0, value: c.minGapHours || 0, onchange: function (ev) { c.minGapHours = Math.max(0, parseInt(ev.target.value, 10) || 0); changed(); } })),
        h('label', { class: 'field' }, h('span', null, 'Max posts per title'), h('input', { type: 'number', min: 1, value: c.maxPerTitle || 8, onchange: function (ev) { c.maxPerTitle = Math.max(1, parseInt(ev.target.value, 10) || 1); changed(); } })),
        h('div', { class: 'field' }, h('span', null, 'Copy fields'), h('span', { class: 'small' }, (eff.fields || []).map(function (f) { return f.label + ' ' + f.max; }).join(' · ') || '—'))));
      var tb = h('tbody');
      (c.slots || []).forEach(function (s) {
        var takes = s.rotation ? 'Rotates: ' + s.rotation.map(function (r) { return r.name; }).join(', ') :
          s.type === 'house' ? 'Brand post' : s.type === 'roundup' ? 'Round-up of releases' : s.type === 'set' ? 'Set of ' + (s.size || 3) : (s.roles || []).map(function (r) { return E.ROLE_LABELS[r]; }).join(', ');
        append(tb, h('tr', { class: s.enabled === false ? 'card-off' : '' },
          h('td', null, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.enabled !== false, 'aria-label': 'Use slot ' + s.name, onchange: function (ev) { s.enabled = ev.target.checked; changed(); } }))),
          h('td', { class: 'small' }, s.days.join(' ') + (s.weeks ? ' (wk ' + s.weeks.join(', ') + ')' : '')),
          h('td', { class: 'mono small' }, s.time),
          h('td', null, s.name, s.optional ? h('span', { class: 'muted small' }, ' · optional') : null),
          h('td', { class: 'small muted' }, takes)));
      });
      parts.push(h('div', { class: 'table-wrap' }, h('table', { class: 'mini' }, h('thead', null, h('tr', null, ['', 'Days', 'Time', 'Slot', 'Takes'].map(function (x) { return h('th', null, x); }))), tb)));
      return h('div', { class: 'panel' + (on ? '' : ' card-off') }, parts);
    });
    return h('section', { class: 'stack', style: 'gap:12px' },
      h('div', { class: 'toolbar' },
        h('p', { class: 'hint', style: 'max-width:70ch' }, 'Channels are planned top to bottom. Later channels lean towards the titles earlier channels used that week, so one launch shows up everywhere at once. Copy limits and rules live in Brand voice.'),
        h('button', { class: 'btn btn-sm', onclick: function () { S.channels = E.clone(P.CHANNELS); S.edits = {}; changed(); toast('Channels reset to defaults'); } }, 'Reset channels')),
      h('div', { class: 'cards' }, cards));
  }

  // ----------------------------------------------------------- brand tab
  var voiceJob = null;
  function brandTab() {
    var b = S.brand;
    var tone = P.TONES.filter(function (t) { return t.id === b.tone; })[0] || P.TONES[1];
    function save(quiet) { M.copy = copyIssues(); persist(); if (!quiet) render(); }

    var profile = h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h3', null, 'Brand profile'),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-sm', onclick: function () { exportProfile(); } }, 'Export profile'),
          h('label', { class: 'btn btn-sm' }, 'Import profile', h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: function (ev) { importProfile(ev.target.files[0]); } })))),
      h('p', { class: 'hint' }, 'Rules and voice used for every draft. Load the example to see strict rules in action: 24 and 36 character push limits, no hyphens or plus signs, no all-caps, no violent words.'),
      h('div', { class: 'row' }, Object.keys(P.BRAND_PROFILES).map(function (k) {
        return h('button', { class: 'btn btn-sm', onclick: function () { var doc = S.brand.voiceDoc; S.brand = brandFrom(k); S.brand.voiceDoc = doc; changed(); toast('Loaded ' + P.BRAND_PROFILES[k].label); } }, P.BRAND_PROFILES[k].label);
      })));

    var voice = h('div', { class: 'panel' },
      h('h3', null, 'Voice'),
      h('label', { class: 'field' }, h('span', null, 'Tone'),
        h('select', { id: 'tone', onchange: function (ev) { b.tone = ev.target.value; save(); } }, P.TONES.map(function (t) { return h('option', { value: t.id, selected: t.id === b.tone }, t.label); }))),
      b.tone === 'custom' ? h('label', { class: 'field' }, h('span', null, 'Describe the tone'), h('textarea', { id: 'custom-tone', rows: 2, value: b.customTone || '', oninput: function (ev) { b.customTone = ev.target.value; save(true); } })) : h('p', { class: 'hint' }, tone.guide),
      h('label', { class: 'field' }, h('span', null, 'Voice notes'), h('textarea', { id: 'voice-summary', rows: 4, placeholder: 'How the brand writes, in a few sentences. Reading a voice document can fill this in.', value: b.voiceSummary || '', oninput: function (ev) { b.voiceSummary = ev.target.value; save(true); } })),
      h('label', { class: 'field' }, h('span', null, 'Copy that worked (one per line)'), h('textarea', { id: 'examples', rows: 4, placeholder: 'Past headlines or posts that performed well.', value: b.examples || '', oninput: function (ev) { b.examples = ev.target.value; save(true); } })),
      voiceDocSection());

    var g = b.globalRules;
    var rules = h('div', { class: 'panel' },
      h('h3', null, 'Global rules'),
      h('p', { class: 'hint' }, 'Checked in code on every draft, on every channel. A draft that breaks one is flagged in Checks.'),
      h('label', { class: 'field' }, h('span', null, 'Banned characters (separate with spaces)'), h('input', { type: 'text', id: 'banned-chars', value: (g.bannedChars || []).join(' '), onchange: function (ev) { g.bannedChars = splitChars(ev.target.value); save(); } })),
      h('label', { class: 'field' }, h('span', null, 'Banned words (separate with commas)'), h('input', { type: 'text', id: 'banned-words', value: (g.bannedWords || []).join(', '), onchange: function (ev) { g.bannedWords = splitList(ev.target.value); save(); } })),
      h('div', { class: 'row' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!g.noAllCaps, onchange: function (ev) { g.noAllCaps = ev.target.checked; save(); } }), 'No all-caps words'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!g.noEmoji, onchange: function (ev) { g.noEmoji = ev.target.checked; save(); } }), 'No emoji')),
      g.noAllCaps ? h('label', { class: 'field' }, h('span', null, 'Allowed capitals, such as TV or AI'), h('input', { type: 'text', value: (g.allowedCaps || []).join(', '), onchange: function (ev) { g.allowedCaps = splitList(ev.target.value); save(); } })) : null);

    return h('div', { class: 'cols' }, h('div', { class: 'stack', style: 'gap:14px;min-width:0' }, profile, voice), h('div', { class: 'stack', style: 'gap:14px' }, rules, channelRulesPanel()));
  }

  function channelRulesPanel() {
    var b = S.brand;
    var withFields = S.channels.filter(function (c) { return !c.mirror && (c.fields || []).length; });
    var cid = S.ui.voiceChannel;
    if (!withFields.some(function (c) { return c.id === cid; })) cid = withFields[0].id;
    var c = withFields.filter(function (x) { return x.id === cid; })[0];
    b.channelRules = b.channelRules || {};
    var cr = b.channelRules[cid] || {};
    function set(k, v) { cr = b.channelRules[cid] = b.channelRules[cid] || {}; cr[k] = v; changed(); }
    function tri(label, key) {
      var v = cr[key] === undefined || cr[key] === null ? 'inherit' : (cr[key] ? 'on' : 'off');
      return h('label', { class: 'field' }, h('span', null, label), h('select', { onchange: function (ev) { set(key, ev.target.value === 'inherit' ? null : ev.target.value === 'on'); } },
        [['inherit', 'Same as global'], ['on', 'On for this channel'], ['off', 'Off for this channel']].map(function (o) { return h('option', { value: o[0], selected: o[0] === v }, o[1]); })));
    }
    return h('div', { class: 'panel' },
      h('h3', null, 'Channel rules'),
      h('p', { class: 'hint' }, 'Added on top of the global rules for one channel.'),
      h('label', { class: 'field' }, h('span', null, 'Channel'), h('select', { id: 'rules-channel', onchange: function (ev) { S.ui.voiceChannel = ev.target.value; persist(); render(); } },
        withFields.map(function (x) { return h('option', { value: x.id, selected: x.id === cid }, x.name); }))),
      h('span', { class: 'label' }, 'Character limits'),
      h('div', { class: 'form-grid' }, c.fields.map(function (f) {
        var cur = cr.fieldMax && cr.fieldMax[f.key];
        return h('label', { class: 'field' }, h('span', null, f.label), h('input', { type: 'number', min: 1, value: cur || f.max, onchange: function (ev) {
          var v = parseInt(ev.target.value, 10);
          cr = b.channelRules[cid] = b.channelRules[cid] || {};
          cr.fieldMax = cr.fieldMax || {};
          if (!v || v === f.max) delete cr.fieldMax[f.key]; else cr.fieldMax[f.key] = v;
          changed();
        } }));
      })),
      h('label', { class: 'field' }, h('span', null, 'Extra banned characters'), h('input', { type: 'text', value: (cr.bannedChars || []).join(' '), onchange: function (ev) { set('bannedChars', splitChars(ev.target.value)); } })),
      h('label', { class: 'field' }, h('span', null, 'Extra banned words'), h('input', { type: 'text', value: (cr.bannedWords || []).join(', '), onchange: function (ev) { set('bannedWords', splitList(ev.target.value)); } })),
      h('div', { class: 'form-grid' }, tri('All-caps words', 'noAllCaps'), tri('Emoji', 'noEmoji')),
      h('p', { class: 'hint' }, 'For the two toggles, "On" means the rule applies: no all-caps words, or no emoji.'));
  }

  function voiceDocSection() {
    var b = S.brand, doc = b.voiceDoc;
    var sec = h('div', { class: 'stack', style: 'gap:8px' }, h('span', { class: 'label' }, 'Voice document'));
    append(sec, h('div', { class: 'row' },
      h('label', { class: 'btn btn-sm' }, doc ? 'Replace document' : 'Upload PDF, DOCX, MD or TXT',
        h('input', { type: 'file', accept: '.pdf,.docx,.md,.txt,.markdown', hidden: true, onchange: function (ev) { readVoiceFile(ev.target.files[0]); } })),
      doc ? h('span', { class: 'small muted' }, doc.name + ' · ' + fmtNum(doc.chars) + ' characters') : null,
      doc ? h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { b.voiceDoc = null; S.ui.voiceSuggest = null; persist(); render(); } }, 'Remove') : null));
    if (doc) {
      if (Cap.sample) {
        append(sec, h('div', { class: 'row' },
          h('button', { class: 'btn btn-primary btn-sm', disabled: !!voiceJob, onclick: readWithClaude }, voiceJob ? 'Reading…' : 'Read with Claude'),
          h('span', { class: 'hint' }, 'Claude summarises the voice and suggests hard rules. You choose which to keep.')));
      } else {
        append(sec, h('p', { class: 'hint' }, 'Open this tool inside Claude to read the document automatically. Until then its first pages are sent along with draft requests, and you can copy the key points into Voice notes.'));
      }
    }
    var sug = S.ui.voiceSuggest;
    if (sug) append(sec, suggestionBox(sug));
    return sec;
  }

  function suggestionBox(sug) {
    var b = S.brand, r = sug.rules || {};
    var picks = { summary: !!sug.summary, examples: !!(sug.examples && sug.examples.length) };
    var rows = [];
    (r.bannedWords || []).forEach(function (w) { rows.push({ kind: 'word', v: w, on: true, label: 'Ban the word "' + w + '"' }); });
    (r.bannedChars || []).forEach(function (c) { rows.push({ kind: 'char', v: c, on: true, label: 'Ban the character "' + c + '"' }); });
    if (r.noAllCaps) rows.push({ kind: 'caps', on: true, label: 'No all-caps words' });
    if (r.noEmoji) rows.push({ kind: 'emoji', on: true, label: 'No emoji' });
    var box = h('div', { class: 'suggest' }, h('h3', null, 'Suggestions from the document'));
    if (sug.tone_words && sug.tone_words.length) append(box, h('p', { class: 'small' }, 'Tone: ' + sug.tone_words.join(', ')));
    if (sug.summary) append(box, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: function (ev) { picks.summary = ev.target.checked; } }), h('span', null, 'Use as voice notes: ', h('span', { class: 'muted' }, sug.summary))));
    rows.forEach(function (row) { append(box, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: function (ev) { row.on = ev.target.checked; } }), row.label)); });
    if (sug.examples && sug.examples.length) append(box, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: function (ev) { picks.examples = ev.target.checked; } }), 'Add ' + sug.examples.length + ' example lines'));
    if (!rows.length) append(box, h('p', { class: 'hint' }, 'The document states no firm rules, so none are suggested.'));
    append(box, h('div', { class: 'row' },
      h('button', { class: 'btn btn-primary btn-sm', onclick: function () {
        var g = b.globalRules;
        if (picks.summary) b.voiceSummary = sug.summary;
        if (picks.examples) b.examples = [b.examples].concat(sug.examples).filter(Boolean).join('\n');
        rows.forEach(function (row) {
          if (!row.on) return;
          if (row.kind === 'word' && g.bannedWords.indexOf(row.v.toLowerCase()) < 0) g.bannedWords.push(row.v.toLowerCase());
          if (row.kind === 'char' && g.bannedChars.indexOf(row.v) < 0) g.bannedChars.push(row.v);
          if (row.kind === 'caps') g.noAllCaps = true;
          if (row.kind === 'emoji') g.noEmoji = true;
        });
        S.ui.voiceSuggest = null; changed(); toast('Added to the brand profile');
      } }, 'Add selected'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: function () { S.ui.voiceSuggest = null; persist(); render(); } }, 'Dismiss')));
    return box;
  }

  function readVoiceFile(file) {
    if (!file) return;
    var name = file.name, ext = (name.split('.').pop() || '').toLowerCase();
    toast('Reading ' + name + '…');
    var p;
    if (ext === 'pdf') {
      p = loadScript(LIBS.pdf).then(function () { return loadScript(LIBS.pdfWorker); }).then(function () {
        var lib = window.pdfjsLib;
        lib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
        return file.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; });
      }).then(function (pdf) {
        var n = Math.min(pdf.numPages, 40), out = [], chain = Promise.resolve();
        for (var i = 1; i <= n; i++) {
          (function (k) {
            chain = chain.then(function () { return pdf.getPage(k); }).then(function (pg) { return pg.getTextContent(); })
              .then(function (tc) { out.push(tc.items.map(function (it) { return it.str; }).join(' ')); });
          })(i);
        }
        return chain.then(function () { return out.join('\n\n'); });
      });
    } else if (ext === 'docx') {
      p = loadScript(LIBS.mammoth).then(function () { return file.arrayBuffer(); })
        .then(function (buf) { return window.mammoth.extractRawText({ arrayBuffer: buf }); }).then(function (r) { return r.value; });
    } else {
      p = file.text();
    }
    p.then(function (text) {
      text = String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (!text) { toast('No text found in ' + name + '. A scanned PDF has no text layer.'); return; }
      S.brand.voiceDoc = { name: name, chars: text.length, text: text.slice(0, 60000) };
      S.ui.voiceSuggest = null;
      persist(); render();
      toast('Loaded ' + name);
    }).catch(function (e) { toast('Could not read ' + name + (e && e.message ? ': ' + e.message : '')); });
  }

  function readWithClaude() {
    var doc = S.brand.voiceDoc;
    if (!doc || !Cap.sample) return;
    voiceJob = new AbortController();
    render();
    Cap.sample.json(E.buildVoicePrompt(doc.text), { signal: voiceJob.signal }).then(function (r) {
      if (!r || typeof r !== 'object') throw { code: 'invalid_json' };
      S.ui.voiceSuggest = {
        summary: String(r.summary || ''), tone_words: Array.isArray(r.tone_words) ? r.tone_words.map(String) : [],
        rules: r.rules && typeof r.rules === 'object' ? {
          bannedWords: Array.isArray(r.rules.bannedWords) ? r.rules.bannedWords.map(String) : [],
          bannedChars: Array.isArray(r.rules.bannedChars) ? r.rules.bannedChars.map(String) : [],
          noAllCaps: !!r.rules.noAllCaps, noEmoji: !!r.rules.noEmoji
        } : {},
        examples: Array.isArray(r.examples) ? r.examples.map(String).slice(0, 5) : []
      };
    }).catch(function (e) {
      if (e && e.code !== 'cancelled') toast(sampleMessage(e));
    }).then(function () { voiceJob = null; persist(); render(); });
  }

  function exportProfile() {
    var b = E.clone(S.brand);
    var out = { kind: 'promotions-engineered-brand-profile', version: 1, brand: b };
    saveFile('brand-profile.json', new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  }
  function importProfile(file) {
    if (!file) return;
    file.text().then(function (t) {
      var o = JSON.parse(t);
      var b = o && o.brand;
      if (!b || typeof b !== 'object' || !b.globalRules) throw new Error('not a brand profile');
      S.brand = E.merge(brandFrom('blank'), b);
      changed(); toast('Imported brand profile');
    }).catch(function () { toast('That file is not a brand profile from this tool.'); });
  }

  // ------------------------------------------------------------ data tab
  function dataTab() {
    var source = h('div', { class: 'panel' },
      h('h3', null, 'Catalog'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Data source' },
        h('button', { 'aria-pressed': S.source === 'demo' ? 'true' : 'false', onclick: function () { S.source = 'demo'; S.edits = {}; changed(); } }, 'Demo catalog'),
        h('button', { 'aria-pressed': S.source === 'upload' ? 'true' : 'false', disabled: !S.upload, onclick: function () { S.source = 'upload'; S.edits = {}; changed(); } }, S.upload ? 'My upload' : 'My upload (none yet)')),
      h('p', { class: 'hint' }, 'One row per ' + M.I.vocab.item + ', last 30 days of numbers. Upcoming releases go in the same file with a future release date and empty numbers. Put "hero" or "featured" in the designation column to lead with an upcoming launch.'),
      h('div', { class: 'row' },
        h('label', { class: 'btn btn-primary' }, 'Upload CSV', h('input', { type: 'file', accept: '.csv,text/csv', hidden: true, onchange: function (ev) { uploadCsv(ev.target.files[0]); } })),
        h('button', { class: 'btn', onclick: downloadTemplate }, 'Download CSV template'),
        h('button', { class: 'btn', onclick: exportSetup }, 'Export setup'),
        h('label', { class: 'btn' }, 'Import setup', h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: function (ev) { importSetup(ev.target.files[0]); } }))),
      h('p', { class: 'hint' }, 'Setup files hold channels, rules, brand voice and overrides, never catalog data.'));

    var mapping = h('div', { class: 'panel' }, h('h3', null, 'Column mapping'));
    if (S.source === 'upload' && S.upload) {
      var heads = S.upload.headers;
      var mp = S.mapping || {};
      var tb = h('tbody');
      E.FIELDS.forEach(function (f) {
        append(tb, h('tr', null,
          h('td', null, f.label, f.required ? h('span', { style: 'color:var(--bad)' }, ' *') : null),
          h('td', null, h('select', { 'aria-label': f.label, onchange: function (ev) { S.mapping = Object.assign({}, S.mapping); if (ev.target.value) S.mapping[f.key] = ev.target.value; else delete S.mapping[f.key]; S.edits = {}; changed(); } },
            h('option', { value: '' }, 'Not in my file'), heads.map(function (x) { return h('option', { value: x, selected: mp[f.key] === x }, x); })))));
      });
      append(mapping, [h('p', { class: 'hint' }, S.upload.name + ' · ' + S.upload.rows.length + ' rows. Columns were matched by name; fix any that are wrong.'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'mini' }, h('thead', null, h('tr', null, h('th', null, 'Field'), h('th', null, 'Column in your file'))), tb))]);
    } else {
      append(mapping, [h('p', { class: 'hint' }, 'The demo catalog uses the template columns. Upload a CSV to map your own.'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'mini' }, h('thead', null, h('tr', null, h('th', null, 'Field'), h('th', null, 'Column'))),
          h('tbody', null, E.FIELDS.map(function (f) { return h('tr', null, h('td', null, f.label, f.required ? h('span', { style: 'color:var(--bad)' }, ' *') : null), h('td', { class: 'mono small' }, M.mapping[f.key] || '—')); }))))]);
    }

    var reasons = {};
    M.pool.items.forEach(function (p) { if (p.status === 'excluded') reasons[p.reason.replace(/\s*\(.*\)$/, '')] = (reasons[p.reason.replace(/\s*\(.*\)$/, '')] || 0) + 1; });
    var health = h('div', { class: 'panel' }, h('h3', null, 'What the engine read'),
      h('div', { class: 'kv' },
        h('span', null, 'Rows'), h('span', { class: 'mono' }, M.rows.length),
        h('span', null, M.I.vocab.items.replace(/^./, function (c) { return c.toUpperCase(); })), h('span', { class: 'mono' }, M.items.length),
        h('span', null, 'Programmed'), h('span', { class: 'mono' }, M.pool.items.filter(function (p) { return p.role; }).length),
        h('span', null, 'Upcoming'), h('span', { class: 'mono' }, M.pool.items.filter(function (p) { return p.upcoming; }).length)),
      Object.keys(reasons).length ? h('div', { class: 'stack', style: 'gap:4px' }, h('span', { class: 'label' }, 'Left out'),
        Object.keys(reasons).map(function (r) { return h('span', { class: 'small' }, reasons[r] + ' · ' + r); })) : null);
    return h('div', { class: 'cols' }, h('div', { class: 'stack', style: 'gap:14px;min-width:0' }, source, mapping), health);
  }

  function uploadCsv(file) {
    if (!file) return;
    loadScript(LIBS.papa).then(function () {
      window.Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: function (res) {
          var headers = (res.meta.fields || []).filter(Boolean);
          if (!headers.length || !res.data.length) { toast('No rows found in ' + file.name); return; }
          S.upload = { name: file.name, headers: headers, rows: res.data.slice(0, 5000) };
          S.mapping = E.guessMapping(headers);
          S.source = 'upload'; S.edits = {}; S.drafts = {}; S.seeded = false; S.overrides = { hero: [], featured: [], suppress: [], themes: {} };
          changed();
          var missing = E.FIELDS.filter(function (f) { return f.required && !S.mapping[f.key]; });
          toast(missing.length ? 'Loaded ' + file.name + '. Map ' + missing.map(function (f) { return f.label; }).join(' and ') + ' to continue.' : 'Loaded ' + res.data.length + ' rows from ' + file.name);
        },
        error: function () { toast('Could not read ' + file.name); }
      });
    }).catch(function () { toast('Could not load the CSV reader. Check your connection.'); });
  }
  function csvCell(v) { v = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function downloadTemplate() {
    var cols = ['title', 'release_date', 'volume', 'volume_trend', 'sessions', 'users', 'avg_session', 'plan', 'designation', 'genre'];
    var rows = P.demoRows(S.industryId, M.y, M.m).slice(0, 5).concat(P.demoRows(S.industryId, M.y, M.m).filter(function (r) { return r.designation; }));
    var lines = [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return csvCell(r[c]); }).join(','); }));
    saveFile('promotions-engineered-catalog-template.csv', new Blob([lines.join('\n')], { type: 'text/csv' }));
  }
  function exportSetup() {
    var out = { kind: 'promotions-engineered-setup', version: 1, industryId: S.industryId, month: S.month, overrides: S.overrides, settings: S.settings, channels: S.channels, brand: S.brand };
    saveFile('promotions-engineered-setup.json', new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  }
  function importSetup(file) {
    if (!file) return;
    file.text().then(function (t) {
      var o = JSON.parse(t);
      if (!o || o.kind !== 'promotions-engineered-setup') throw new Error('bad');
      if (P.INDUSTRIES[o.industryId]) S.industryId = o.industryId;
      if (/^\d{4}-\d{2}$/.test(o.month || '')) S.month = o.month;
      if (o.overrides) S.overrides = E.merge({ hero: [], featured: [], suppress: [], themes: {} }, o.overrides);
      if (o.settings) S.settings = o.settings;
      if (Array.isArray(o.channels) && o.channels.length) S.channels = o.channels;
      if (o.brand && o.brand.globalRules) S.brand = E.merge(brandFrom('blank'), o.brand);
      S.edits = {};
      changed(); toast('Imported setup');
    }).catch(function () { toast('That file is not a setup file from this tool.'); });
  }

  // --------------------------------------------------------- draft modal
  function openDraftModal() {
    var scope = 'all', mode = Cap.sample ? 'claude' : 'template', onlyMissing = true;
    var shownChannels = visibleChannels().map(function (c) { return c.id; });
    var status = h('div', { class: 'stack', style: 'gap:6px' });
    var startBtn;
    function targets() {
      return draftable().filter(function (e) {
        if (scope === 'shown' && shownChannels.indexOf(e.channelId) < 0) return false;
        if (!onlyMissing) return true;
        var d = draftOf(e);
        if (mode === 'claude') return !d || d.stale || (d.source !== 'claude' && !d.edited);
        return !d || d.stale;
      });
    }
    function updateCount() { var n = targets().length; startBtn.textContent = n ? 'Draft ' + n + ' post' + (n === 1 ? '' : 's') : 'Nothing to draft'; startBtn.disabled = !n; }
    function close() { if (job) job.ctl.abort(); els.overlay.innerHTML = ''; render(); }
    startBtn = h('button', { class: 'btn btn-primary', onclick: function () {
      var list = targets();
      if (mode === 'template') {
        draftWithTemplates(list, true); M.copy = copyIssues(); persist();
        els.overlay.innerHTML = ''; render(); toast('Filled ' + list.length + ' template drafts'); return;
      }
      startBtn.disabled = true;
      var bar = h('i', { style: 'width:0%' });
      var line = h('span', { class: 'small muted' }, 'Waiting for Claude…');
      var stop = h('button', { class: 'btn btn-sm', onclick: function () { if (job) job.ctl.abort(); } }, 'Stop');
      status.innerHTML = '';
      append(status, [h('div', { class: 'progress' }, bar), h('div', { class: 'row', style: 'justify-content:space-between' }, line, stop)]);
      draftWithClaude(list, function () {
        bar.style.width = Math.round(100 * job.done / job.total) + '%';
        line.textContent = job.done + ' of ' + job.total + ' drafted';
      }).then(function (j) {
        stop.remove();
        line.textContent = j.error ? j.error : (j.done + ' drafted by Claude' + (j.flagged ? ', ' + j.flagged + ' still break a rule and are flagged in Checks' : '') + '.');
        if (j.error) line.style.color = 'var(--bad)';
        bar.style.width = Math.round(100 * j.done / Math.max(1, j.total)) + '%';
        startBtn.textContent = 'Done'; startBtn.disabled = false;
        startBtn.onclick = function () { els.overlay.innerHTML = ''; render(); };
      });
    } }, 'Draft');
    var modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Who writes' },
      h('button', { 'aria-pressed': mode === 'claude' ? 'true' : 'false', disabled: !Cap.sample, onclick: function (ev) { mode = 'claude'; ev.target.parentNode.childNodes.forEach(function (b) { b.setAttribute('aria-pressed', b === ev.target ? 'true' : 'false'); }); updateCount(); } }, 'Claude'),
      h('button', { 'aria-pressed': mode === 'template' ? 'true' : 'false', onclick: function (ev) { mode = 'template'; ev.target.parentNode.childNodes.forEach(function (b) { b.setAttribute('aria-pressed', b === ev.target ? 'true' : 'false'); }); updateCount(); } }, 'Templates'));
    var modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'draft-h' },
      h('h2', { id: 'draft-h' }, 'Draft copy'),
      h('p', { class: 'hint' }, 'Every draft is labelled Draft in the calendar and the export. Rules are checked in code after drafting; anything that still breaks one goes to Checks.'),
      h('div', { class: 'field' }, h('span', null, 'Who writes'), modeSeg),
      !Cap.sample ? h('p', { class: 'hint' }, 'Claude drafting is available when this tool runs inside Claude. Templates fill every post instantly and follow your rules.') : null,
      h('label', { class: 'field' }, h('span', null, 'Posts'), h('select', { onchange: function (ev) { scope = ev.target.value; updateCount(); } },
        h('option', { value: 'all' }, 'All channels'), h('option', { value: 'shown' }, 'Channels shown in the calendar'))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: function (ev) { onlyMissing = ev.target.checked; updateCount(); } }), 'Skip posts that already have a draft I wrote or Claude wrote'),
      status,
      h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'btn btn-ghost', onclick: close }, 'Close'), startBtn));
    els.overlay.innerHTML = '';
    append(els.overlay, [h('div', { class: 'scrim', onclick: close }), modal]);
    updateCount();
  }

  // -------------------------------------------------------- Excel export
  function exportExcel() {
    var btn = document.getElementById('btn-export');
    if (btn) { btn.disabled = true; btn.textContent = 'Building…'; }
    loadScript(LIBS.exceljs).then(function () { return buildWorkbook(); }).then(function (buf) {
      var name = 'promotions-engineered-' + S.month + '.xlsx';
      return saveFile(name, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    }).catch(function (e) {
      toast('Export failed' + (e && e.message ? ': ' + e.message : ''));
    }).then(function () {
      var b2 = document.getElementById('btn-export');
      if (b2) { b2.disabled = false; b2.textContent = 'Export Excel'; }
    });
  }

  function buildWorkbook() {
    var ExcelJS = window.ExcelJS;
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Promotions, Engineered';
    var title = 'Programming calendar · ' + monthLabel(M.y, M.m);
    var getDraft = function (e) { var d = draftOf(e); return d && !d.stale ? d.fields : null; };
    var model = E.sheetModel(M.entries, M.channels, M.pool.bounds, getDraft, M.I.plans);
    var mirrors = M.channels.filter(function (c) { return c.enabled && c.mirror; });
    var border = { style: 'thin', color: { argb: 'FFD0D4DA' } };
    var headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2328' } };
    var subFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF1F4' } };

    // Sheet 1: master calendar
    var ws = wb.addWorksheet('Master calendar', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }] });
    ws.getCell('A1').value = title;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A2').value = 'Copy columns marked (Draft) are drafts for review, not final copy.' +
      (mirrors.length ? ' ' + mirrors.map(function (c) { return c.name + ' mirrors ' + M.chById[c.mirror.of].name + (c.mirror.delayDays ? ' ' + c.mirror.delayDays + ' day later' : ' at the same time') + (c.mirror.formats ? ' (' + c.mirror.formats.join(', ') + ' only)' : ''); }).join('; ') + '.' : '');
    ws.getCell('A2').font = { italic: true, color: { argb: 'FF5C6371' } };
    var col = 1;
    model.groups.forEach(function (g) {
      if (g.span > 1) ws.mergeCells(3, col, 3, col + g.span - 1);
      var c = ws.getCell(3, col);
      c.value = g.label;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = headFill;
      c.alignment = { horizontal: 'left', vertical: 'middle' };
      col += g.span;
    });
    model.headers.forEach(function (hd, i) {
      var c = ws.getCell(4, i + 1);
      c.value = hd;
      c.font = { bold: true, italic: /\(Draft\)$/.test(hd), color: { argb: /\(Draft\)$/.test(hd) ? 'FF5C6371' : 'FF1F2328' } };
      c.fill = subFill;
      c.border = { bottom: border };
      ws.getColumn(i + 1).width = hd === 'Date' ? 12 : hd === 'Day' ? 6 : hd === 'Time' ? 7 : hd === 'Title' ? 26 : hd === 'Slot' ? 22 : /\(Draft\)$/.test(hd) ? 34 : 11;
    });
    model.rows.forEach(function (r, i) {
      var row = ws.getRow(5 + i);
      r.cells.forEach(function (v, j) { row.getCell(j + 1).value = v; });
      r.roles.forEach(function (x) {
        var c = row.getCell(x.col + 1);
        if (x.role && XL_FILL[x.role]) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_FILL[x.role] } };
        if (x.open) c.font = { color: { argb: 'FFBE3328' } };
      });
      if (r.firstOfDate) row.eachCell({ includeEmpty: true }, function (c) { c.border = { top: border }; });
      row.alignment = { vertical: 'top', wrapText: false };
    });

    // Sheet 2: creative briefs for the design and video team
    var wsB = wb.addWorksheet('Creative briefs', { views: [{ state: 'frozen', ySplit: 1 }] });
    wsB.addRow(['Date', 'Day', 'Time', 'Channel', 'Slot', 'Title', 'Purpose', 'Format', 'Spec', 'Visual idea (Draft)', 'Key message (Draft)', 'Asset needed']).eachCell(function (c) { c.font = { bold: true }; c.fill = subFill; });
    M.entries.filter(function (e) { return isScheduled(e) && E.needsBrief(e); }).forEach(function (e) {
      var d = draftOf(e), b = d && !d.stale && d.brief ? d.brief : {}, basics = E.briefBasics(e, M.I.vocab);
      var r = wsB.addRow([e.date, e.day, e.time, M.chById[e.channelId].name, e.slotName, entryTitle(e), e.purpose ? E.PURPOSE_LABELS[e.purpose] : '—', e.format, basics.spec, b.visual || '', b.message || '', basics.asset]);
      if (e.role && XL_FILL[e.role]) r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_FILL[e.role] } };
      r.alignment = { vertical: 'top', wrapText: true };
    });
    [11, 6, 7, 14, 22, 26, 11, 10, 34, 44, 30, 34].forEach(function (w, i) { wsB.getColumn(i + 1).width = w; });

    // Sheet 3: every post, one row each, including mirrors
    var ws2 = wb.addWorksheet('All posts', { views: [{ state: 'frozen', ySplit: 1 }] });
    var maxF = Math.max.apply(null, [0].concat(M.channels.map(function (c) { return (c.fields || []).length; })));
    var head2 = ['Date', 'Day', 'Time', 'Channel', 'Slot', 'Title', 'Purpose', 'Plan', 'Tier', 'Signal', 'Format', 'Angle', 'Theme', 'Copy status'];
    for (var f = 1; f <= maxF; f++) head2.push('Field ' + f, 'Draft ' + f);
    ws2.addRow(head2).eachCell(function (c) { c.font = { bold: true }; c.fill = subFill; });
    M.entries.forEach(function (e) {
      var ch = M.chById[e.channelId];
      if (!ch.enabled) return;
      var d = e.mirrorOf ? null : draftOf(e);
      var st = e.mirrorOf ? 'Mirrors ' + M.chById[ch.mirror.of].name : !(ch.fields || []).length ? '—' : !d || d.stale ? 'No draft' : M.copy[e.key] ? 'Breaks rules: ' + M.copy[e.key].join('; ') : (d.source === 'claude' ? 'Draft (Claude)' : 'Draft (template)');
      var row = [e.date, e.day, e.time, ch.name, e.slotName, entryTitle(e), e.purpose ? E.PURPOSE_LABELS[e.purpose] : '—', e.plan ? planLabel(e.plan) : '—', e.role ? E.ROLE_LABELS[e.role] : '—', e.signal ? E.SIGNAL_LABELS[e.signal] : '—', e.format || '', e.framing ? E.FRAMING_TEXT[e.framing] : '', e.theme || '', st];
      (ch.fields || []).forEach(function (fl) { row.push(fl.label, d && !d.stale ? (d.fields[fl.key] || '') : ''); });
      var added = ws2.addRow(row);
      if (e.role && XL_FILL[e.role]) added.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_FILL[e.role] } };
    });
    [11, 6, 7, 18, 24, 28, 11, 10, 12, 12, 10, 30, 14, 22].forEach(function (w, i) { ws2.getColumn(i + 1).width = w; });
    for (var k = 0; k < maxF; k++) { ws2.getColumn(15 + k * 2).width = 12; ws2.getColumn(16 + k * 2).width = 40; }

    // Sheet 4: the title pool and why each title landed where it did
    var ws3 = wb.addWorksheet('Title pool', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws3.addRow(['Title', 'Genre', 'Tier', 'Signal', 'Why', 'Score', M.I.vocab.audience, M.I.vocab.volume + ' (min)', 'Trend %', 'Sessions per user', 'Avg session (min)', 'Session band', 'Plan', 'Release date', 'Status']).eachCell(function (c) { c.font = { bold: true }; c.fill = subFill; });
    M.pool.items.slice().sort(function (a, b) {
      var ra = a.role ? ROLE_ORDER.indexOf(a.role) : 9, rb = b.role ? ROLE_ORDER.indexOf(b.role) : 9;
      return ra - rb || b.score - a.score;
    }).forEach(function (p) {
      var r = ws3.addRow([p.title, p.kind, p.role ? E.ROLE_LABELS[p.role] : '—', p.signal ? E.SIGNAL_LABELS[p.signal] : '—', p.roleReason || p.reason, p.upcoming ? null : Math.round(p.score * 100),
        p.users, p.volume, p.trend, p.stickiness ? Math.round(p.stickiness * 10) / 10 : null, p.avgSession, bandLabel(p.band), planLabel(p.plan), p.releaseDate ? E.iso(p.releaseDate) : '', p.role ? 'Programmed' : p.status === 'bench' ? 'Bench' : p.status === 'suppressed' ? 'Suppressed' : 'Left out']);
      if (p.role && XL_FILL[p.role]) r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_FILL[p.role] } };
    });
    [26, 20, 13, 12, 34, 8, 10, 14, 9, 10, 10, 14, 10, 12, 12].forEach(function (w, i) { ws3.getColumn(i + 1).width = w; });

    // Sheet 5: rules and settings used for this plan
    var ws4 = wb.addWorksheet('Rules');
    var tone = toneFor(), g = S.brand.globalRules;
    var lines = [
      ['Brand voice', ''], ['Tone', tone.label + (tone.guide ? '. ' + tone.guide : '')], ['Voice notes', S.brand.voiceSummary || '—'],
      ['', ''], ['Global copy rules', ''],
      ['Banned characters', (g.bannedChars || []).join(' ') || '—'], ['Banned words', (g.bannedWords || []).join(', ') || '—'],
      ['No all-caps words', g.noAllCaps ? 'Yes' : 'No'], ['No emoji', g.noEmoji ? 'Yes' : 'No'], ['', ''], ['Channel copy limits', '']
    ];
    M.channels.filter(function (c) { return c.enabled && !c.mirror && (c.fields || []).length; }).forEach(function (c) {
      var r = rulesFor(c.id);
      lines.push([c.name, c.fields.map(function (f) { return f.label + ' ≤ ' + f.max; }).join(', ') +
        (r.bannedWords.length > (g.bannedWords || []).length || r.bannedChars.length > (g.bannedChars || []).length ? ' · extra bans apply' : '')]);
    });
    var st = M.pool.settings;
    lines.push(['', ''], ['Selection rules', ''],
      ['Tier sizes', 'Heroes ' + st.heroCount + ', featured ' + st.featuredCount + ', reactivation ' + st.reactivationCount + ', pre-launch ' + st.prelaunchCount + ', discovery ' + st.discoveryCount],
      ['Audience floor', M.I.plans[0].label + ' ' + st.floors.premium + ', ' + M.I.plans[1].label + ' ' + st.floors.basic + ' ' + M.I.vocab.audience],
      ['New window', st.newWindowDays + ' days'], ['Declining', 'trend below ' + st.declineThreshold + '%'], ['Performing', 'top ' + st.performingTopPct + '% by volume with above-median stickiness'],
      ['Overrides', ['hero', 'featured', 'suppress'].map(function (k) { return k + ': ' + (S.overrides[k].map(function (id) { return M.byId[id] ? M.byId[id].title : id; }).join(', ') || 'none'); }).join(' · ')]);
    lines.forEach(function (l) { var r = ws4.addRow(l); if (l[0] && !l[1]) r.getCell(1).font = { bold: true }; });
    ws4.getColumn(1).width = 24; ws4.getColumn(2).width = 100;

    return wb.xlsx.writeBuffer();
  }

  // ---------------------------------------------------------------- boot
  shell();
  recompute();
  render();
  initCaps();
  var mq = window.matchMedia ? window.matchMedia('(max-width: 760px)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (S.ui.tab === 'calendar') render(); });
})();
