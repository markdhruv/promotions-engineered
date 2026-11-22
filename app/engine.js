/*
 * Promotions, Engineered: the planning engine. Picks which titles to promote each month and places them
 * into channel slots.
 *
 * Pure functions only: no DOM, no network, no randomness. The same file runs
 * in the browser (window.PromotionsEngine), in Node (require) and, later, in a
 * serverless function.
 *
 * Pipeline:
 *   normalize()  catalog rows -> items
 *   buildPool()  eligibility -> signal (new / performing / declining /
 *                upcoming / long tail) -> score -> role (hero / featured /
 *                reactivation / pre-launch / discovery), overrides first
 *   placeAll()   each enabled channel takes titles from the pool into its
 *                own slots, under its own caps, gaps and accepted roles
 *   audit()      cross-channel checks
 *   copy helpers rule checks, template drafts, prompts for Claude
 *   sheetModel() rows for the Excel export
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PromotionsEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY_MS = 864e5;
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var ROLES = ['hero', 'featured', 'reactivation', 'prelaunch', 'discovery'];
  var ROLE_LABELS = {
    hero: 'Hero', featured: 'Featured', reactivation: 'Reactivation',
    prelaunch: 'Pre-launch', discovery: 'Discovery'
  };
  var SIGNAL_LABELS = {
    'new': 'New', performing: 'Performing', declining: 'Declining',
    upcoming: 'Upcoming', longtail: 'Long tail'
  };
  // Every post that features a title has one business purpose.
  var PURPOSE_LABELS = { launch: 'Launch', discover: 'Discover', reengage: 'Re-engage' };
  var PURPOSE_TEXT = {
    launch: 'Launch: build excitement for a new or upcoming release',
    discover: 'Discover: get people to try something worth their time',
    reengage: 'Re-engage: bring lapsed users back to something they started'
  };
  function purposeOf(role, signal) {
    if (!role) return null;
    if (role === 'prelaunch') return 'launch';
    if (role === 'reactivation') return 'reengage';
    if ((role === 'hero' || role === 'featured') && (signal === 'new' || signal === 'upcoming')) return 'launch';
    return 'discover';
  }

  var DEFAULT_SETTINGS = {
    floors: { premium: 50, basic: 30 },
    borderlineRatio: 0.6,
    newWindowDays: 45,
    declineThreshold: 0,
    performingTopPct: 30,
    heroCount: 2,
    featuredCount: 6,
    reactivationCount: 4,
    prelaunchCount: 4,
    discoveryCount: 10,
    prelaunchLeadDays: 14,
    premiumShare: 75,
    weights: { volume: 0.6, stickiness: 0.4 },
    sessionBands: [
      { id: 'snack', label: 'Snackable', max: 15 },
      { id: 'bite', label: 'Bite-sized', max: 30 },
      { id: 'session', label: 'Session', max: 60 },
      { id: 'immersive', label: 'Immersive', max: null }
    ]
  };

  // ---------------------------------------------------------------- utils
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function merge(base, over) {
    var out = clone(base);
    if (!over) return out;
    Object.keys(over).forEach(function (k) {
      var v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = merge(out[k], v);
      } else if (v !== undefined) {
        out[k] = clone(v);
      }
    });
    return out;
  }
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  }
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var n = parseFloat(String(v).replace(/[,%\s]/g, ''));
    return isFinite(n) ? n : null;
  }
  function parseDate(v) {
    if (!v) return null;
    if (typeof v === 'number') return v;
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    if ((m = /^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/.exec(s))) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    var t = Date.parse(s);
    if (isNaN(t)) return null;
    var d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function monthBounds(year, month) {
    var start = Date.UTC(year, month, 1);
    var days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return { start: start, end: Date.UTC(year, month, days), days: days, year: year, month: month };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function byTitle(a, b) { return a.title.localeCompare(b.title); }

  // ------------------------------------------------------------ normalize
  var FIELDS = [
    { key: 'title', label: 'Title', required: true, aliases: ['title', 'name', 'game', 'show', 'album', 'item'] },
    { key: 'releaseDate', label: 'Release date', required: true, aliases: ['release_date', 'released', 'release', 'launch_date', 'added_date', 'expected_release_date', 'date'] },
    { key: 'volume', label: 'Volume (minutes, last 30 days)', aliases: ['volume', 'playtime', 'watch_time', 'watchtime', 'listening_time', 'minutes', 'stream_minutes'] },
    { key: 'volumeTrend', label: 'Volume trend (% vs last month)', aliases: ['volume_trend', 'trend', 'playtime_trend', 'trend_pct', 'change'] },
    { key: 'sessions', label: 'Sessions (last 30 days)', aliases: ['sessions', 'plays', 'starts', 'streams'] },
    { key: 'users', label: 'Users (last 30 days)', aliases: ['users', 'players', 'viewers', 'listeners', 'audience', 'uniques'] },
    { key: 'avgSession', label: 'Average session (minutes)', aliases: ['avg_session', 'average_session', 'avg_session_length', 'session_length', 'avg_session_min'] },
    { key: 'plan', label: 'Plan', aliases: ['plan', 'pass', 'pass_type', 'subscription', 'access'] },
    { key: 'designation', label: 'Designation (hero / featured)', aliases: ['designation', 'hero_designation', 'priority'] },
    { key: 'kind', label: 'Genre or type', aliases: ['kind', 'genre', 'category', 'type', 'format'] }
  ];

  function normHeader(h) { return String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

  function guessMapping(headers) {
    var map = {}, used = {};
    var norm = headers.map(normHeader);
    FIELDS.forEach(function (f) {
      var hit = -1;
      for (var pass = 0; pass < 3 && hit < 0; pass++) {
        for (var i = 0; i < norm.length && hit < 0; i++) {
          if (used[i]) continue;
          for (var a = 0; a < f.aliases.length; a++) {
            var al = f.aliases[a], h = norm[i];
            if ((pass === 0 && h === al) || (pass === 1 && h.indexOf(al) === 0) || (pass === 2 && h.indexOf(al) >= 0)) { hit = i; break; }
          }
        }
      }
      if (hit >= 0) { map[f.key] = headers[hit]; used[hit] = true; }
    });
    return map;
  }

  function normalizePlan(v, plans) {
    var s = String(v || '').trim().toLowerCase();
    if (!s || s === 'both' || s === 'all' || s === 'any') return 'both';
    for (var i = 0; i < plans.length; i++) {
      if (s === plans[i].id || s === plans[i].label.toLowerCase()) return plans[i].id;
    }
    for (var j = 0; j < plans.length; j++) {
      if (s.indexOf(plans[j].label.toLowerCase()) >= 0) return plans[j].id;
    }
    if (/prem|pro|plus|paid/.test(s)) return 'premium';
    if (/basic|lite|mobile|free|ad/.test(s)) return 'basic';
    return 'both';
  }

  function normalize(rows, mapping, plans) {
    plans = plans || [{ id: 'premium', label: 'Premium' }, { id: 'basic', label: 'Basic' }];
    var seen = {}, out = [];
    rows.forEach(function (r) {
      var get = function (k) { return mapping[k] ? r[mapping[k]] : undefined; };
      var title = String(get('title') || '').trim();
      if (!title) return;
      var id = slugify(title);
      if (seen[id]) { seen[id]++; id = id + '-' + seen[id]; } else seen[id] = 1;
      var des = String(get('designation') || '').trim().toLowerCase();
      out.push({
        id: id,
        title: title,
        releaseDate: parseDate(get('releaseDate')),
        volume: num(get('volume')),
        volumeTrend: num(get('volumeTrend')),
        sessions: num(get('sessions')),
        users: num(get('users')),
        avgSession: num(get('avgSession')),
        plan: normalizePlan(get('plan'), plans),
        designation: des === 'hero' || des === 'featured' ? des : '',
        kind: String(get('kind') || '').trim()
      });
    });
    return out;
  }

  // ---------------------------------------------------------------- pool
  function classifyBand(avg, bands) {
    if (avg === null || avg === undefined) return null;
    for (var i = 0; i < bands.length; i++) {
      if (bands[i].max === null || bands[i].max === undefined || avg <= bands[i].max) return bands[i].id;
    }
    return bands[bands.length - 1].id;
  }
  function floorFor(plan, floors) {
    if (plan === 'premium') return floors.premium;
    if (plan === 'basic') return floors.basic;
    return Math.min(floors.premium, floors.basic);
  }
  function percentiles(list, key, outKey) {
    var vals = list.filter(function (p) { return p[key] !== null && p[key] !== undefined; })
      .map(function (p) { return p[key]; }).sort(function (a, b) { return a - b; });
    list.forEach(function (p) {
      var v = p[key];
      if (v === null || v === undefined || !vals.length) { p[outKey] = 0.5; return; }
      if (vals.length === 1) { p[outKey] = 1; return; }
      var lo = 0, hi = 0;
      for (var i = 0; i < vals.length; i++) { if (vals[i] < v) lo++; if (vals[i] <= v) hi++; }
      p[outKey] = ((lo + hi - 1) / 2) / (vals.length - 1);
    });
  }
  function normalizeOverrides(o) {
    o = o || {};
    return {
      hero: (o.hero || []).slice(),
      featured: (o.featured || []).slice(),
      suppress: (o.suppress || []).slice(),
      themes: o.themes || {}
    };
  }

  /**
   * opts: { settings, overrides, year, month (0-based) }
   * Returns { items, bounds, settings, overrides }.
   */
  function buildPool(items, opts) {
    var S = merge(DEFAULT_SETTINGS, opts.settings || {});
    var ov = normalizeOverrides(opts.overrides);
    var b = monthBounds(opts.year, opts.month);
    var suppress = {};
    ov.suppress.forEach(function (id) { suppress[id] = true; });
    var out = [];

    items.forEach(function (it) {
      var p = {
        id: it.id, title: it.title, kind: it.kind || '', plan: it.plan || 'both',
        releaseDate: it.releaseDate, users: it.users, volume: it.volume, trend: it.volumeTrend,
        sessions: it.sessions, avgSession: it.avgSession, designation: it.designation || '',
        band: classifyBand(it.avgSession, S.sessionBands),
        stickiness: it.sessions && it.users ? it.sessions / it.users : null,
        status: 'eligible', reason: '', signal: null, role: null, roleReason: '', flags: [],
        upcoming: false, score: 0
      };
      out.push(p);
      if (!p.releaseDate) { p.status = 'excluded'; p.reason = 'No release date'; return; }
      if (suppress[p.id]) { p.status = 'suppressed'; p.reason = 'Suppressed by override'; return; }
      if (p.releaseDate > b.start) {
        if ((p.releaseDate - b.end) / DAY_MS > S.prelaunchLeadDays) {
          p.status = 'excluded'; p.reason = 'Releases too late to tease this month'; return;
        }
        p.upcoming = true;
        p.signal = 'upcoming';
        p.releasesInMonth = p.releaseDate <= b.end;
        return;
      }
      var floor = floorFor(p.plan, S.floors);
      if (p.users === null || p.users === undefined) {
        p.flags.push('no-audience-data');
      } else if (p.users < floor) {
        if (p.users >= floor * S.borderlineRatio) { p.borderline = true; p.flags.push('borderline'); }
        else { p.status = 'excluded'; p.reason = 'Below audience floor (' + p.users + ' < ' + floor + ')'; return; }
      }
      var age = (b.start - p.releaseDate) / DAY_MS;
      p.isNew = age <= S.newWindowDays;
      p.declining = p.trend !== null && p.trend !== undefined && p.trend < S.declineThreshold;
      p.signal = p.isNew ? 'new' : (p.declining ? 'declining' : 'longtail');
      if (p.isNew && p.declining) p.flags.push('new-but-declining');
    });

    var live = out.filter(function (p) { return p.status === 'eligible' && !p.upcoming; });
    percentiles(live, 'volume', 'volPct');
    percentiles(live, 'stickiness', 'stickPct');
    live.forEach(function (p) {
      p.score = S.weights.volume * p.volPct + S.weights.stickiness * p.stickPct;
      if (p.signal === 'longtail' && !p.borderline && p.volPct >= 1 - S.performingTopPct / 100 && p.stickPct >= 0.5) {
        p.signal = 'performing';
      }
    });
    out.forEach(function (p) {
      if (p.upcoming) p.score = p.designation === 'hero' ? 1 : p.designation === 'featured' ? 0.8 : 0.5;
    });

    var pool = out.filter(function (p) { return p.status === 'eligible'; });
    var byId = {};
    pool.forEach(function (p) { byId[p.id] = p; });
    var byScore = function (a, c) { return c.score - a.score || byTitle(a, c); };
    function assign(p, role, reason) { p.role = role; p.roleReason = reason; }
    function free(p) { return !p.role; }
    function count(role) { return pool.filter(function (p) { return p.role === role; }).length; }
    function strong(p) { return free(p) && !p.upcoming && !p.borderline && (p.signal === 'new' || p.signal === 'performing'); }

    // Hero: overrides, then designated launches this month, then top data picks.
    ov.hero.forEach(function (id) { if (byId[id] && free(byId[id])) assign(byId[id], 'hero', 'Hero override'); });
    pool.filter(function (p) { return free(p) && p.upcoming && p.releasesInMonth && p.designation === 'hero'; })
      .forEach(function (p) { assign(p, 'hero', 'Designated hero launch'); });
    pool.filter(strong).sort(byScore).slice(0, Math.max(0, S.heroCount - count('hero')))
      .forEach(function (p) { assign(p, 'hero', 'Top score'); });

    // Featured.
    ov.featured.forEach(function (id) { if (byId[id] && free(byId[id])) assign(byId[id], 'featured', 'Featured override'); });
    pool.filter(function (p) { return free(p) && p.upcoming && p.releasesInMonth && p.designation === 'featured'; })
      .forEach(function (p) { assign(p, 'featured', 'Designated featured launch'); });
    pool.filter(strong).sort(byScore)
      .concat(pool.filter(function (p) { return free(p) && !p.upcoming && !p.borderline && p.signal === 'longtail'; }).sort(byScore))
      .slice(0, Math.max(0, S.featuredCount - count('featured')))
      .forEach(function (p) { assign(p, 'featured', p.signal === 'longtail' ? 'Next best score' : 'Top score'); });

    // Reactivation: falling titles with the biggest past audience.
    pool.filter(function (p) { return free(p) && !p.upcoming && p.declining; })
      .sort(function (a, c) { return (c.volume || 0) - (a.volume || 0) || byTitle(a, c); })
      .slice(0, S.reactivationCount)
      .forEach(function (p) { assign(p, 'reactivation', 'Falling trend, large past audience'); });

    // Pre-launch teases.
    pool.filter(function (p) { return free(p) && p.upcoming; })
      .sort(function (a, c) { return a.releaseDate - c.releaseDate || byTitle(a, c); })
      .slice(0, S.prelaunchCount)
      .forEach(function (p) { assign(p, 'prelaunch', 'Upcoming release'); });

    // Discovery: the long tail.
    pool.filter(function (p) { return free(p) && !p.upcoming; }).sort(byScore)
      .slice(0, S.discoveryCount)
      .forEach(function (p) { assign(p, 'discovery', p.borderline ? 'Long tail, borderline audience' : 'Long tail'); });

    pool.forEach(function (p) {
      if (!p.role) { p.status = 'bench'; p.reason = 'Not needed this month'; }
      if ((p.role === 'hero' || p.role === 'featured') && p.declining) p.flags.push('also-declining');
    });

    return { items: out, bounds: b, settings: S, overrides: ov };
  }

  // ----------------------------------------------------------- placement
  function roleAt(p, ms, S) {
    if (!p.role) return null;
    if (!p.upcoming) return p.role;
    var dayStart = ms - (ms % DAY_MS);
    if (dayStart < p.releaseDate) {
      return (p.releaseDate - dayStart) / DAY_MS <= S.prelaunchLeadDays ? 'prelaunch' : null;
    }
    return p.role === 'prelaunch' ? 'discovery' : p.role;
  }
  function parseTime(t) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '10:00'));
    return m ? (+m[1]) * 36e5 + (+m[2]) * 6e4 : 10 * 36e5;
  }
  function expandSlots(ch, b) {
    var inst = [];
    for (var d = 1; d <= b.days; d++) {
      var date = Date.UTC(b.year, b.month, d);
      var dow = new Date(date).getUTCDay();
      var week = Math.floor((d - 1) / 7) + 1;
      (ch.slots || []).forEach(function (slot) {
        if (slot.enabled === false) return;
        if (slot.days.indexOf(DAY_NAMES[dow]) < 0) return;
        if (slot.weeks && slot.weeks.indexOf(week) < 0) return;
        var s = slot;
        if (slot.rotation && slot.rotation.length) {
          s = merge(slot, slot.rotation[(week - 1) % slot.rotation.length]);
          delete s.rotation;
        }
        inst.push({ date: date, d: d, dow: dow, week: week, time: s.time, ms: date + parseTime(s.time), slot: s, baseId: slot.id });
      });
    }
    inst.sort(function (a, c) { return a.ms - c.ms || a.baseId.localeCompare(c.baseId); });
    return inst;
  }

  var FRAMING_CYCLE = {
    hero: ['discovery', 'social', 'progress'],
    featured: ['discovery', 'social', 'progress'],
    discovery: ['discovery', 'social'],
    reactivation: ['progress', 'social'],
    prelaunch: ['tease']
  };

  function capFor(ch, role) {
    var c = (ch.caps || {})[role];
    return c === undefined ? 1 : c;
  }
  function pickFormat(slot, role, n) {
    var f = slot.formats || ['Post'];
    if (f.length === 1) return f[0];
    if (role === 'hero' || role === 'prelaunch') return f[0];
    return f[n % f.length];
  }

  /**
   * Place titles for every enabled channel. Channels run in the order given;
   * later channels lean towards titles earlier channels used in the same
   * week, which is how the cascade shows up across channels.
   */
  function placeAll(poolResult, channels) {
    var S = poolResult.settings, b = poolResult.bounds, ov = poolResult.overrides;
    var pool = poolResult.items.filter(function (p) { return p.status === 'eligible' && p.role; });
    var weekUse = {};
    var entries = [];
    var scheduled = channels.filter(function (c) { return c.enabled && !c.mirror; });

    scheduled.forEach(function (ch, chIndex) {
      var inst = expandSlots(ch, b);
      var countBy = {}, totalBy = {}, lastMs = {}, prevId = null, fCount = {};
      var liveCount = 0, basicCount = 0, weekPlan = {};
      var gapMs = (ch.minGapHours || 0) * 36e5;
      var accepts = ch.acceptsRoles || ROLES;
      // Roles a slot may fall back to when none of its preferred roles has a title left.
      var fallback = ch.fallbackRoles || accepts;

      function candidates(i, excludeIds) {
        var at = i.ms, s = i.slot;
        var allowed = s.strictRoles ? (s.roles || []) : (s.roles || []).concat(fallback);
        var list = [];
        pool.forEach(function (p) {
          var r = roleAt(p, at, S);
          if (!r || accepts.indexOf(r) < 0 || allowed.indexOf(r) < 0) return;
          if (excludeIds && excludeIds[p.id]) return;
          var cap = p.borderline ? Math.min(1, capFor(ch, r)) : capFor(ch, r);
          if ((countBy[p.id + '|' + r] || 0) >= cap) return;
          if (ch.maxPerTitle && (totalBy[p.id] || 0) >= ch.maxPerTitle) return;
          if (lastMs[p.id] !== undefined && at - lastMs[p.id] < gapMs) return;
          if (ch.noBackToBack !== false && prevId === p.id) return;
          list.push({ p: p, r: r });
        });
        return list;
      }

      function scoreOf(c, i) {
        var s = i.slot, p = c.p, r = c.r, sc = 0;
        var idx = (s.roles || []).indexOf(r);
        sc += idx >= 0 ? 100 - 15 * idx : 25;
        if (s.signals && s.signals.indexOf(p.signal) >= 0) sc += 15;
        if (s.bands && p.band) sc += s.bands.indexOf(p.band) >= 0 ? 18 : -12;
        // Titles furthest below their exposure budget come first.
        sc += 24 * (1 - (countBy[p.id + '|' + r] || 0) / Math.max(1, capFor(ch, r)));
        sc += 20 * (p.score || 0);
        var theme = ov.themes[i.week];
        if (theme && theme.heroId === p.id) sc += 60;
        if (chIndex > 0) sc += Math.min(24, ((weekUse[i.week] || {})[p.id] || 0) * 8);
        if (r === 'hero' && p.releaseDate && i.date >= p.releaseDate && i.date - p.releaseDate <= 5 * DAY_MS) sc += 25;
        if (r !== 'prelaunch' && ch.balancePlans !== false) {
          var basicOk = p.plan === 'basic' || p.plan === 'both';
          var premOnly = p.plan === 'premium';
          var target = 1 - S.premiumShare / 100;
          var share = liveCount ? basicCount / liveCount : target;
          if (share < target - 0.05 && basicOk) sc += 15;
          if (share > target + 0.05 && premOnly) sc += 15;
          var wp = weekPlan[i.week] || {};
          if (i.dow === 0 || i.dow === 6) {
            if (!wp.basic && basicOk) sc += 30;
            if (!wp.premium && premOnly) sc += 30;
          }
        }
        return sc;
      }

      function take(c, i) {
        var p = c.p, k = p.id + '|' + c.r;
        countBy[k] = (countBy[k] || 0) + 1;
        totalBy[p.id] = (totalBy[p.id] || 0) + 1;
        lastMs[p.id] = i.ms;
        weekUse[i.week] = weekUse[i.week] || {};
        weekUse[i.week][p.id] = (weekUse[i.week][p.id] || 0) + 1;
        if (c.r !== 'prelaunch') {
          liveCount++;
          var wp = weekPlan[i.week] = weekPlan[i.week] || {};
          if (p.plan === 'basic' || p.plan === 'both') { basicCount++; wp.basic = true; }
          if (p.plan === 'premium') wp.premium = true;
        }
        var cyc = FRAMING_CYCLE[c.r] || ['discovery'];
        var n = fCount[k] || 0;
        fCount[k] = n + 1;
        return cyc[n % cyc.length];
      }

      function best(i, excludeIds) {
        var list = candidates(i, excludeIds);
        if (!list.length) return null;
        list.forEach(function (c) { c.s = scoreOf(c, i); });
        list.sort(function (a, c) { return c.s - a.s || byTitle(a.p, c.p); });
        return list[0];
      }

      inst.forEach(function (i, n) {
        var s = i.slot;
        var theme = ov.themes[i.week];
        var e = {
          key: ch.id + '|' + iso(i.date) + '|' + i.time + '|' + i.baseId,
          channelId: ch.id, date: iso(i.date), ms: i.ms, dow: i.dow, day: DAY_NAMES[i.dow],
          week: i.week, time: i.time, slotId: i.baseId, slotName: s.name, type: s.type || 'title',
          titleId: null, title: null, titles: null, plan: null, role: null, signal: null, band: null, purpose: null,
          format: pickFormat(s, null, n), framing: null, theme: theme && theme.name ? theme.name : '',
          optional: !!s.optional, open: false, note: s.note || ''
        };
        if (e.type === 'roundup') {
          var from = i.date - 6 * DAY_MS, to = i.date + 7 * DAY_MS;
          var list = poolResult.items.filter(function (p) {
            return p.status === 'eligible' && p.releaseDate && p.releaseDate >= from && p.releaseDate <= to;
          }).sort(function (a, c) { return a.releaseDate - c.releaseDate || byTitle(a, c); });
          e.titles = list.map(function (p) { return { id: p.id, title: p.title, date: iso(p.releaseDate), plan: p.plan }; });
          e.role = list.length ? 'prelaunch' : null;
          e.purpose = list.length ? 'launch' : null;
          if (!list.length) e.open = true;
        } else if (e.type === 'set') {
          var size = s.size || 3, picked = [], ex = {};
          for (var k = 0; k < size; k++) {
            var c = best(i, ex);
            if (!c) break;
            ex[c.p.id] = true;
            picked.push(c);
          }
          if (!picked.length) e.open = true;
          picked.forEach(function (c2) { take(c2, i); });
          e.titles = picked.map(function (c2) { return { id: c2.p.id, title: c2.p.title, plan: c2.p.plan, role: c2.r }; });
          if (picked.length) { e.role = picked[0].r; e.plan = picked[0].p.plan; e.purpose = purposeOf(picked[0].r, picked[0].p.signal); }
        } else if (e.type !== 'house') {
          var c1 = best(i, null);
          if (!c1) {
            e.open = true;
          } else {
            e.framing = take(c1, i);
            e.titleId = c1.p.id; e.title = c1.p.title; e.plan = c1.p.plan;
            e.role = c1.r; e.signal = c1.p.signal; e.band = c1.p.band;
            e.purpose = purposeOf(e.role, e.signal);
            e.format = pickFormat(s, c1.r, n);
            prevId = c1.p.id;
          }
        }
        entries.push(e);
      });
    });

    // Mirrors copy another channel's posts, optionally filtered by format and delayed.
    channels.filter(function (c) { return c.enabled && c.mirror; }).forEach(function (ch) {
      var src = channels.filter(function (c) { return c.id === ch.mirror.of; })[0];
      if (!src || !src.enabled) return;
      entries.filter(function (e) { return e.channelId === src.id; }).forEach(function (e) {
        if (ch.mirror.formats && ch.mirror.formats.indexOf(e.format) < 0) return;
        var ms = e.ms + (ch.mirror.delayDays || 0) * DAY_MS;
        var dayStart = ms - (ms % DAY_MS);
        if (dayStart > b.end) return;
        var copy = clone(e);
        copy.key = ch.id + '|' + iso(dayStart) + '|' + e.time + '|' + e.slotId;
        copy.channelId = ch.id; copy.ms = ms; copy.date = iso(dayStart);
        copy.dow = new Date(dayStart).getUTCDay(); copy.day = DAY_NAMES[copy.dow];
        copy.mirrorOf = e.key;
        entries.push(copy);
      });
    });

    entries.sort(function (a, c) { return a.ms - c.ms || a.channelId.localeCompare(c.channelId); });
    return entries;
  }

  /** Replace titles the user picked by hand. edits: {key: {titleId}} */
  function applyEdits(entries, edits, poolResult) {
    if (!edits) return entries;
    var byId = {};
    poolResult.items.forEach(function (p) { byId[p.id] = p; });
    var S = poolResult.settings;
    return entries.map(function (e) {
      var ed = edits[e.key];
      if (!ed || ed.titleId === undefined) return e;
      var out = clone(e);
      out.manual = true;
      if (ed.titleId === null) {
        out.titleId = null; out.title = null; out.role = null; out.plan = null; out.signal = null; out.purpose = null; out.open = true;
        return out;
      }
      var p = byId[ed.titleId];
      if (!p) return e;
      out.titleId = p.id; out.title = p.title; out.plan = p.plan; out.signal = p.signal; out.band = p.band;
      out.role = roleAt(p, e.ms, S) || p.role || 'discovery';
      out.purpose = purposeOf(out.role, out.signal);
      out.open = false;
      if (!out.framing) out.framing = (FRAMING_CYCLE[out.role] || ['discovery'])[0];
      return out;
    });
  }

  // ---------------------------------------------------------------- audit
  function audit(entries, poolResult, channels) {
    var out = [];
    var scheduled = channels.filter(function (c) { return c.enabled && !c.mirror; });

    scheduled.forEach(function (ch) {
      var list = entries.filter(function (e) { return e.channelId === ch.id; });
      var accepts = ch.acceptsRoles || ROLES;
      list.filter(function (e) { return e.open && e.type === 'roundup'; }).forEach(function (e) {
        out.push({ level: 'info', channel: ch.id, msg: 'Nothing releases around ' + e.date + ' for ' + e.slotName + ' on ' + ch.name, keys: [e.key] });
      });
      var open = list.filter(function (e) { return e.open && e.type !== 'roundup'; });
      if (open.length) {
        out.push({ level: 'warn', channel: ch.id, msg: open.length + ' open slot' + (open.length > 1 ? 's' : '') + ' on ' + ch.name + ' with nothing eligible to place', keys: open.map(function (e) { return e.key; }) });
      }
      var gapMs = (ch.minGapHours || 0) * 36e5, last = {}, prev = null;
      list.forEach(function (e) {
        if (!e.titleId) { if (e.type === 'title') prev = null; return; }
        if (gapMs && last[e.titleId] !== undefined && e.ms - last[e.titleId] < gapMs) {
          out.push({ level: 'warn', channel: ch.id, msg: e.title + ' repeats on ' + ch.name + ' within ' + ch.minGapHours + ' hours (' + e.date + ')', keys: [e.key] });
        } else if (ch.noBackToBack !== false && prev === e.titleId) {
          out.push({ level: 'warn', channel: ch.id, msg: e.title + ' fills two slots in a row on ' + ch.name, keys: [e.key] });
        }
        last[e.titleId] = e.ms;
        prev = e.titleId;
        if (e.role && accepts.indexOf(e.role) < 0) {
          out.push({ level: 'warn', channel: ch.id, msg: ROLE_LABELS[e.role] + ' title ' + e.title + ' is on ' + ch.name + ', which does not take that role', keys: [e.key] });
        }
      });
    });

    poolResult.items.filter(function (p) { return p.role === 'hero'; }).forEach(function (p) {
      scheduled.forEach(function (ch) {
        if ((ch.acceptsRoles || ROLES).indexOf('hero') < 0) return;
        var titleSlots = (ch.slots || []).some(function (s) { return s.enabled !== false && (s.type || 'title') !== 'house'; });
        if (!titleSlots) return;
        var hit = entries.some(function (e) {
          return e.channelId === ch.id && (e.titleId === p.id || (e.titles || []).some(function (t) { return t.id === p.id; }));
        });
        if (!hit) out.push({ level: 'info', channel: ch.id, msg: 'Hero ' + p.title + ' does not appear on ' + ch.name, keys: [] });
      });
    });

    return out;
  }

  // ----------------------------------------------------------------- copy
  function uniq(a) {
    var s = {};
    return a.filter(function (x) { x = String(x); if (!x || s[x]) return false; s[x] = true; return true; });
  }
  function mergeRules(globalRules, channelRules) {
    var g = globalRules || {}, c = channelRules || {};
    return {
      bannedChars: uniq([].concat(g.bannedChars || [], c.bannedChars || [])),
      bannedWords: uniq([].concat(g.bannedWords || [], c.bannedWords || []).map(function (w) { return String(w).trim().toLowerCase(); })),
      noAllCaps: c.noAllCaps !== undefined && c.noAllCaps !== null ? !!c.noAllCaps : !!g.noAllCaps,
      noEmoji: c.noEmoji !== undefined && c.noEmoji !== null ? !!c.noEmoji : !!g.noEmoji,
      allowedCaps: uniq([].concat(g.allowedCaps || [], c.allowedCaps || []))
    };
  }

  var EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;
  var EMOJI_RE_G = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/gu;

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function wordRe(w, flags) { return new RegExp('(^|[^\\p{L}])' + escapeRe(w) + '(?=[^\\p{L}]|$)', flags); }

  function checkText(text, max, rules) {
    var issues = [];
    text = String(text || '');
    if (!text.trim()) return issues;
    if (max && text.length > max) issues.push({ code: 'length', msg: text.length + ' of ' + max + ' characters' });
    (rules.bannedChars || []).forEach(function (ch) {
      if (ch && text.indexOf(ch) >= 0) issues.push({ code: 'char', msg: 'Contains "' + ch + '"' });
    });
    (rules.bannedWords || []).forEach(function (w) {
      if (w && wordRe(w, 'iu').test(text)) issues.push({ code: 'word', msg: 'Uses "' + w + '"' });
    });
    if (rules.noAllCaps) {
      var allowed = (rules.allowedCaps || []).map(function (x) { return x.toUpperCase(); });
      var caps = (text.match(/\b[A-Z]{2,}\b/g) || []).filter(function (w) { return allowed.indexOf(w) < 0; });
      if (caps.length) issues.push({ code: 'caps', msg: 'All-caps word "' + caps[0] + '"' });
    }
    if (rules.noEmoji && EMOJI_RE.test(text)) issues.push({ code: 'emoji', msg: 'Contains emoji' });
    return issues;
  }

  /** Make text pass the rules mechanically. Used for template drafts. */
  function fixText(text, max, rules) {
    var t = String(text || '');
    (rules.bannedChars || []).forEach(function (ch) {
      if (!ch) return;
      var rep = ch === '+' || ch === '&' ? ' and ' : (/[-–—:;\/|]/.test(ch) ? ', ' : '');
      t = t.split(ch).join(rep);
    });
    (rules.bannedWords || []).forEach(function (w) {
      if (w) t = t.replace(wordRe(w, 'giu'), '$1');
    });
    if (rules.noAllCaps) {
      var allowed = (rules.allowedCaps || []).map(function (x) { return x.toUpperCase(); });
      t = t.replace(/\b[A-Z]{2,}\b/g, function (w) { return allowed.indexOf(w) >= 0 ? w : w.charAt(0) + w.slice(1).toLowerCase(); });
    }
    if (rules.noEmoji) t = t.replace(EMOJI_RE_G, '');
    t = t.replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
    if (max && t.length > max) {
      var cut = t.slice(0, max);
      var sp = cut.lastIndexOf(' ');
      t = (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,.;]+$/, '');
    }
    return t;
  }

  var TEMPLATES = {
    short: {
      discovery: ['New: {title}', '{title} is here', 'Just added: {title}'],
      social: ['{title} is trending', 'Everyone is on {title}', '{title} keeps rising'],
      progress: ['{title} awaits', 'Back to {title}?', 'Pick up {title}'],
      tease: ['Coming soon: {title}', 'Get ready for {title}', '{title} lands {releaseDay}'],
      house: ['{slot}'],
      set: ['{setLabel}'],
      roundup: ['New this week']
    },
    long: {
      discovery: ['{title} just arrived. {bandLine}', 'Fresh this week: {title}. {bandLine}'],
      social: ['{audienceCap} cannot put {title} down. {bandLine}', '{title} is the one people are talking about. {bandLine}'],
      progress: ['{title} is right where you left it. {bandLine}', 'Your next chapter of {title} is waiting.'],
      tease: ['{title} arrives on {releaseDate}. Set a reminder.', 'Mark {releaseDate}: {title} is coming.'],
      house: ['Draft idea for {slot}. Replace with the final post.'],
      set: ['{setLabel}: {setList}.'],
      roundup: ['Coming up: {setList}.']
    }
  };
  var BAND_LINES = {
    snack: 'A quick one for a short break.',
    bite: 'Just right for half an hour.',
    session: 'Settle in for a proper session.',
    immersive: 'Clear an evening for this one.'
  };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function templateDraft(entry, fields, rules, vocab, poolById) {
    vocab = vocab || {};
    var out = {};
    var framing = entry.type === 'house' ? 'house' : entry.type === 'set' ? 'set' : entry.type === 'roundup' ? 'roundup' : (entry.framing || 'discovery');
    var p = entry.titleId && poolById ? poolById[entry.titleId] : null;
    var rel = p && p.releaseDate ? new Date(p.releaseDate) : null;
    var vars = {
      title: entry.title || '',
      slot: entry.slotName || '',
      audienceCap: String(vocab.audience || 'fans').replace(/^./, function (c) { return c.toUpperCase(); }),
      bandLine: BAND_LINES[entry.band] || '',
      releaseDay: rel ? DAY_NAMES[rel.getUTCDay()] : 'soon',
      releaseDate: rel ? rel.getUTCDate() + ' ' + MONTHS[rel.getUTCMonth()] : 'soon',
      setLabel: entry.slotName || 'Picks',
      setList: (entry.titles || []).map(function (t) { return t.title; }).join(', ') || 'nothing new yet'
    };
    function fill(tpl) { return tpl.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] !== undefined ? vars[k] : ''; }); }
    var used = {};
    fields.forEach(function (f, fi) {
      var kind = f.max && f.max <= 60 ? 'short' : 'long';
      var list = TEMPLATES[kind][framing] || TEMPLATES[kind].discovery;
      var start = (hashStr(entry.key + f.key) + fi) % list.length;
      // Prefer a template that fits without cutting words, and avoid repeating
      // the previous field's line.
      var pick = null;
      for (var k = 0; k < list.length && !pick; k++) {
        var txt = fixText(fill(list[(start + k) % list.length]), 0, rules);
        if ((!f.max || txt.length <= f.max) && !used[txt]) pick = txt;
      }
      if (!pick) pick = fixText(vars.title || fill(list[start]), f.max, rules);
      used[pick] = true;
      out[f.key] = pick;
    });
    return out;
  }

  // ------------------------------------------------------ creative briefs
  // Visual formats get a brief for the design or video team: the spec and
  // the asset needed are fixed by format; the visual idea and key message are
  // drafted (by Claude, or by these templates).
  var FORMAT_SPECS = {
    Reel: 'Vertical video, 9:16, 7 to 15 seconds. Hook in the first second, captions on.',
    Static: 'Single image, 4:5. One focal visual with the title art.',
    Carousel: 'Carousel, 4:5, 5 to 8 slides, one idea per slide.',
    Challenge: 'Challenge card, 16:9, with the rules in three short lines.',
    Voice: 'Event card, 16:9, with the day, time and host.',
    Email: 'Header image 600 px wide, plus one tile per title.'
  };
  var HOUSE_BRIEFS = {
    'Plan spotlight': ['A grid of the {items} one plan unlocks, with the price.', 'Everything one plan gets you'],
    'Multi-device showcase': ['The same {item} moving from phone to laptop to TV without a break.', 'Pick up on any screen'],
    'Did you know': ['One feature explained in three simple frames.', 'A feature most people miss'],
    'Meme': ['A familiar meme format tied to this week\'s {items}.', 'A joke our {audience} will share'],
    'Cultural moment or offer': ['Tie this week\'s festival, match or trend to one of our {items}.', 'The right pick for this week'],
    'Community pick': ['Repost a fan creation, credited, with a short thank-you.', 'Made by our community'],
    'Voice hangout': ['Event card with the day, time and who is hosting.', 'Come and hang out live'],
    'You said, we did': ['Before and after of one change people asked for.', 'You asked, we built it'],
    'Case-study carousel': ['One insight per slide, each backed by a single number or chart.', 'One lesson from this month']
  };
  var PURPOSE_BRIEFS = {
    launch: ['Open on the most striking moment of {title}, then land on {landing}.', '{title} {arrives}'],
    discover: ['Show one {band} moment from {title} that makes the case on its own.', '{title} is worth your time'],
    reengage: ['Progress-screen framing: where things paused in {title}, and what comes next.', 'Pick up {title} where you left off']
  };
  var BAND_WORDS = { snack: 'quick', bite: 'bite-sized', session: 'sit-down', immersive: 'immersive' };

  function needsBrief(e) { return !!(e && FORMAT_SPECS[e.format]) && !(e.open && e.type !== 'house'); }

  function briefBasics(e, vocab) {
    vocab = vocab || {};
    var names = e.title ? [e.title] : (e.titles || []).map(function (t) { return t.title; });
    var asset = e.type === 'house' || !names.length
      ? 'Made in-house by the design team.'
      : 'Key art' + (e.format === 'Reel' ? ' and 15 to 30 seconds of footage' : '') + ' for ' + names.join(', ') + ', from the ' + (vocab.partner || 'publisher') + '.';
    return { spec: FORMAT_SPECS[e.format] || '', asset: asset };
  }

  function templateBrief(e, vocab, poolById) {
    vocab = vocab || {};
    var tpl;
    if (e.type === 'house') tpl = HOUSE_BRIEFS[e.slotName] || ['A brand visual for ' + String(e.slotName || '').toLowerCase() + '.', e.slotName || ''];
    else if (e.type === 'set' || e.type === 'roundup') tpl = ['A grid of {list}, with one shared line on top.', e.type === 'roundup' ? 'New this week' : (e.slotName || 'Our picks')];
    else tpl = PURPOSE_BRIEFS[e.purpose] || PURPOSE_BRIEFS.discover;
    var p = e.titleId && poolById ? poolById[e.titleId] : null;
    var day = e.ms - (e.ms % DAY_MS);
    var rel = p && p.releaseDate && p.releaseDate > day ? new Date(p.releaseDate) : null;
    var vars = {
      title: e.title || '', item: vocab.item || 'title', items: vocab.items || 'titles', audience: vocab.audience || 'fans',
      band: BAND_WORDS[e.band] || 'quick',
      arrives: rel ? 'arrives ' + DAY_NAMES[rel.getUTCDay()] + ' ' + rel.getUTCDate() + ' ' + MONTHS[rel.getUTCMonth()] : 'is here',
      landing: rel ? 'the release date' : 'an "out now" end card',
      list: (e.titles || []).map(function (t) { return t.title; }).join(', ') || 'the week\'s titles'
    };
    function fill(s) { return s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] !== undefined ? vars[k] : ''; }); }
    return { visual: fill(tpl[0]), message: fill(tpl[1]) };
  }

  var FRAMING_TEXT = {
    discovery: 'Discovery: it is new or worth finding',
    social: 'Social proof: other people love it',
    progress: 'Personal progress: pick up where you left off',
    tease: 'Pre-launch tease: it is coming soon'
  };

  function rulesToText(rules, fields) {
    var lines = [];
    fields.forEach(function (f) { lines.push('- "' + f.key + '" (' + f.label + '): at most ' + f.max + ' characters, counting spaces.'); });
    if (rules.bannedChars.length) lines.push('- Never use these characters: ' + rules.bannedChars.map(function (c) { return '"' + c + '"'; }).join(' '));
    if (rules.bannedWords.length) lines.push('- Never use these words: ' + rules.bannedWords.join(', '));
    if (rules.noAllCaps) lines.push('- No all-caps words, even when a title is officially written in capitals' + (rules.allowedCaps.length ? ' (allowed: ' + rules.allowedCaps.join(', ') + ')' : '') + '.');
    if (rules.noEmoji) lines.push('- No emoji.');
    return lines.join('\n');
  }

  /**
   * Prompt asking Claude for draft copy for a batch of one channel's entries.
   * brand: {toneLabel, toneGuide, voiceSummary, voiceDocExcerpt, examples}
   */
  function buildDraftPrompt(opts) {
    var ch = opts.channel, fields = opts.fields, rules = opts.rules, brand = opts.brand || {}, vocab = opts.vocab || {};
    var item = vocab.item || 'title';
    var rows = opts.entries.map(function (e) {
      var o = { id: e.key, date: e.date, day: e.day, time: e.time, slot: e.slotName, format: e.format };
      if (e.title) o.title = e.title;
      if (e.titles && e.titles.length) o.titles = e.titles.map(function (t) { return t.title; });
      if (e.role) o.role = ROLE_LABELS[e.role];
      if (e.purpose) o.purpose = PURPOSE_TEXT[e.purpose];
      if (e.framing) o.angle = FRAMING_TEXT[e.framing] || e.framing;
      if (needsBrief(e)) o.brief = true;
      if (e.band) o.session = e.band;
      if (e.theme) o.theme = e.theme;
      if (e.type === 'house') o.note = 'Not about one ' + item + '. Write a post that fits the slot name.';
      return o;
    });
    var hasBrief = rows.some(function (r) { return r.brief; });
    var shape = '{"id": string, ' + fields.map(function (f) { return '"' + f.key + '": string'; }).join(', ') +
      (hasBrief ? ', "visual": string (brief posts only), "message": string (brief posts only)' : '') + '}';
    var parts = [
      'You write draft marketing copy for a ' + (vocab.business || 'subscription entertainment service') + '. The marketing team reviews every draft before anything is published.',
      '',
      'Channel: ' + ch.name + (ch.copyBrief ? '. ' + ch.copyBrief : ''),
      'Brand voice: ' + (brand.toneLabel || 'Friendly') + '. ' + (brand.toneGuide || ''),
      brand.voiceSummary ? 'Voice notes from the brand: ' + brand.voiceSummary : '',
      brand.voiceDocExcerpt ? 'Excerpt from the brand voice document:\n"""\n' + brand.voiceDocExcerpt + '\n"""' : '',
      brand.examples ? 'Copy that worked before. Match its style; do not reuse it:\n' + brand.examples : '',
      '',
      'Hard rules. Every field must pass all of them:',
      rulesToText(rules, fields),
      '',
      'Each post has a purpose and an angle. Write to both. Use the ' + item + ' name exactly as given, apart from the casing rule.',
      hasBrief ? 'Posts marked "brief": true also need a creative brief for the design team: "visual" is one or two sentences on what the viewer sees, and "message" is the single key message in at most 12 words. Briefs are not bound by the copy rules.' : '',
      'Do not invent facts about a ' + item + ' beyond its name, slot and angle.',
      '',
      'Posts:',
      rows.map(function (r) { return JSON.stringify(r); }).join('\n'),
      '',
      'Reply with only a JSON array with one object per post, in the same order: ' + shape + '.'
    ];
    return parts.filter(function (x, i, a) { return !(x === '' && a[i - 1] === ''); }).join('\n');
  }

  function buildRetryPrompt(opts) {
    var shape = '{"id": string, ' + opts.fields.map(function (f) { return '"' + f.key + '": string'; }).join(', ') + '}';
    return [
      'These draft posts for ' + opts.channel.name + ' broke the copy rules. Rewrite only these and keep the meaning.',
      '',
      'Hard rules:',
      rulesToText(opts.rules, opts.fields),
      '',
      opts.failures.map(function (f) { return '- id ' + f.id + ': ' + JSON.stringify(f.fields) + ' broke: ' + f.issues.join('; '); }).join('\n'),
      '',
      'Reply with only a JSON array of ' + shape + '.'
    ].join('\n');
  }

  /** Prompt that turns a brand voice document into a summary plus candidate hard rules. */
  function buildVoicePrompt(docText) {
    return [
      'Below is a brand voice or style guide. Read it and reply with only a JSON object:',
      '{"summary": string (60 to 120 words of plain instructions on how the brand writes),',
      ' "tone_words": string[] (3 to 6 adjectives),',
      ' "rules": {"bannedWords": string[], "bannedChars": string[], "noAllCaps": boolean, "noEmoji": boolean},',
      ' "examples": string[] (up to 5 short example lines quoted from the document, if it has any)}',
      'Only put something in "rules" when the document states it as a firm rule. Leave a list empty, or a flag false, when the document says nothing about it.',
      '',
      '"""',
      String(docText || '').slice(0, 60000),
      '"""'
    ].join('\n');
  }

  // ---------------------------------------------------------------- sheet
  /**
   * Master sheet layout: Date, Day, then one block of columns per scheduled
   * channel. Each date gets as many rows as its busiest channel; a channel's
   * n-th post that day sits on the date's n-th row.
   */
  function sheetModel(entries, channels, bounds, getDraft, plans) {
    var planLabel = { both: 'All plans' };
    (plans || []).forEach(function (p) { planLabel[p.id] = p.label; });
    var cols = channels.filter(function (c) { return c.enabled && !c.mirror; });
    var base = ['Time', 'Slot', 'Title', 'Purpose', 'Plan', 'Tier', 'Format'];
    var groups = [{ label: '', span: 2 }];
    var headers = ['Date', 'Day'];
    cols.forEach(function (c) {
      var f = (c.fields || []).map(function (x) { return x.label + ' (Draft)'; });
      groups.push({ label: c.name, span: base.length + f.length, channelId: c.id });
      headers = headers.concat(base, f);
    });
    var rows = [];
    for (var d = 1; d <= bounds.days; d++) {
      var ms = Date.UTC(bounds.year, bounds.month, d), date = iso(ms);
      var per = cols.map(function (c) { return entries.filter(function (e) { return e.channelId === c.id && e.date === date; }); });
      var depth = Math.max.apply(null, [1].concat(per.map(function (l) { return l.length; })));
      for (var r = 0; r < depth; r++) {
        var cells = [r === 0 ? date : '', r === 0 ? DAY_NAMES[new Date(ms).getUTCDay()] : ''];
        var roles = [];
        per.forEach(function (list, ci) {
          var e = list[r], c = cols[ci], fl = (c.fields || []).length, k;
          if (!e) { for (k = 0; k < base.length + fl; k++) cells.push(''); return; }
          var title = e.title || (e.titles && e.titles.length ? e.titles.map(function (t) { return t.title; }).join(', ') : (e.type === 'house' ? '—' : 'Open slot'));
          roles.push({ col: cells.length + 2, role: e.role || null, open: e.open });
          cells.push(e.time, e.slotName, title, e.purpose ? PURPOSE_LABELS[e.purpose] : '—', e.plan ? (planLabel[e.plan] || e.plan) : '—', e.role ? ROLE_LABELS[e.role] : '—', e.format || '');
          var dr = getDraft ? getDraft(e) : null;
          (c.fields || []).forEach(function (f) { cells.push(dr && dr[f.key] ? dr[f.key] : ''); });
        });
        rows.push({ cells: cells, roles: roles, firstOfDate: r === 0, date: date });
      }
    }
    return { groups: groups, headers: headers, rows: rows };
  }

  return {
    DAY_NAMES: DAY_NAMES, ROLES: ROLES, ROLE_LABELS: ROLE_LABELS, SIGNAL_LABELS: SIGNAL_LABELS,
    PURPOSE_LABELS: PURPOSE_LABELS, PURPOSE_TEXT: PURPOSE_TEXT, purposeOf: purposeOf,
    FORMAT_SPECS: FORMAT_SPECS, needsBrief: needsBrief, briefBasics: briefBasics, templateBrief: templateBrief,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS, FIELDS: FIELDS, FRAMING_TEXT: FRAMING_TEXT,
    clone: clone, merge: merge, slugify: slugify, parseDate: parseDate, iso: iso, monthBounds: monthBounds,
    guessMapping: guessMapping, normalize: normalize, buildPool: buildPool, placeAll: placeAll,
    applyEdits: applyEdits, audit: audit, roleAt: roleAt,
    mergeRules: mergeRules, checkText: checkText, fixText: fixText, templateDraft: templateDraft,
    buildDraftPrompt: buildDraftPrompt, buildRetryPrompt: buildRetryPrompt, buildVoicePrompt: buildVoicePrompt,
    sheetModel: sheetModel
  };
});
