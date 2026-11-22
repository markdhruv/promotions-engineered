/*
 * Promotions, Engineered: presets. The channel library, industry presets with made-up demo
 * catalogs, tone presets and example brand profiles.
 *
 * Everything here is configuration. Nothing in the engine depends on a
 * particular brand, industry or channel set.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PromotionsPresets = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  // ------------------------------------------------------------ channels
  // Order matters: channels earlier in the list are planned first, and later
  // channels lean towards the titles those earlier channels used that week.
  var CHANNELS = [
    {
      id: 'push', name: 'Push notifications', short: 'PN', group: 'Owned', enabled: true,
      summary: 'Daily freshness. 17 sends a week, weighted to the weekend when people have time.',
      acceptsRoles: ['hero', 'featured', 'reactivation', 'prelaunch', 'discovery'],
      caps: { hero: 8, featured: 4, reactivation: 3, prelaunch: 3, discovery: 2 },
      maxPerTitle: 8, minGapHours: 36, noBackToBack: true,
      fields: [{ key: 'header', label: 'Header', max: 40 }, { key: 'body', label: 'Body', max: 100 }],
      copyBrief: 'Mobile push notification. The header is the bold first line; the body is the line under it.',
      slots: [
        { id: 'push-weekday-am', days: WEEKDAYS, time: '10:00', name: 'Quick pick', roles: ['discovery', 'featured'], bands: ['snack', 'bite'], formats: ['Push'] },
        { id: 'push-mon-pm', days: ['Mon'], time: '20:00', name: 'Hero of the week', roles: ['hero', 'featured'], formats: ['Push'] },
        { id: 'push-tue-pm', days: ['Tue'], time: '20:00', name: 'Performing anchor', roles: ['featured', 'hero'], signals: ['performing'], formats: ['Push'] },
        { id: 'push-wed-pm', days: ['Wed'], time: '20:00', name: 'Comeback evening', roles: ['reactivation', 'featured'], formats: ['Push'] },
        { id: 'push-thu-pm', days: ['Thu'], time: '20:00', name: 'New release spotlight', roles: ['featured', 'hero', 'discovery'], signals: ['new'], formats: ['Push'] },
        { id: 'push-fri-tease', days: ['Fri'], time: '16:00', name: 'Weekend tease', roles: ['prelaunch', 'hero'], formats: ['Push'] },
        { id: 'push-fri-pm', days: ['Fri'], time: '20:00', name: 'Weekend opener', roles: ['hero', 'featured'], bands: ['session', 'immersive'], formats: ['Push'] },
        { id: 'push-sat-am', days: ['Sat'], time: '10:00', name: 'Weekend primetime', roles: ['featured', 'discovery'], bands: ['bite', 'session'], formats: ['Push'] },
        { id: 'push-sat-af', days: ['Sat'], time: '15:00', name: 'Deep dive', roles: ['featured', 'hero'], bands: ['session', 'immersive'], formats: ['Push'] },
        { id: 'push-sat-pm', days: ['Sat'], time: '20:00', name: 'Main event', roles: ['hero', 'featured'], bands: ['immersive', 'session'], formats: ['Push'] },
        { id: 'push-sun-am', days: ['Sun'], time: '10:00', name: 'Comfort pick', roles: ['discovery', 'featured'], bands: ['snack', 'bite'], formats: ['Push'] },
        { id: 'push-sun-af', days: ['Sun'], time: '15:00', name: 'Session pick', roles: ['featured', 'discovery'], bands: ['session'], formats: ['Push'] },
        { id: 'push-sun-pm', days: ['Sun'], time: '20:00', name: 'Week-ahead tease', roles: ['prelaunch', 'featured'], formats: ['Push'] }
      ]
    },
    {
      id: 'instagram', name: 'Instagram', short: 'IG', group: 'Social', enabled: true,
      summary: 'Awareness at scale and the source of every social asset. 10 feed posts a week.',
      acceptsRoles: ['hero', 'featured', 'prelaunch', 'discovery'],
      fallbackRoles: ['hero', 'featured', 'prelaunch'],
      caps: { hero: 4, featured: 3, prelaunch: 2, discovery: 1 },
      maxPerTitle: 5, minGapHours: 48, noBackToBack: true,
      fields: [{ key: 'caption', label: 'Caption', max: 300 }],
      copyBrief: 'Instagram feed caption. The first line is the hook and must work on its own.',
      slots: [
        { id: 'ig-mon', days: ['Mon'], time: '10:00', name: 'New release push', roles: ['featured', 'hero'], signals: ['new'], bands: ['snack', 'bite'], formats: ['Reel', 'Static'] },
        { id: 'ig-tue-am', days: ['Tue'], time: '10:00', name: 'New release push', roles: ['featured', 'hero'], signals: ['new'], bands: ['snack', 'bite'], formats: ['Reel', 'Static'] },
        { id: 'ig-tue-pm', days: ['Tue'], time: '19:00', name: 'Plan spotlight', type: 'house', formats: ['Static', 'Reel'] },
        {
          id: 'ig-wed', days: ['Wed'], time: '10:00', name: 'Identity rotation', formats: ['Static'],
          rotation: [
            { name: 'Multi-device showcase', type: 'house', formats: ['Reel'] },
            { name: 'Hidden gem', type: 'title', roles: ['discovery'], strictRoles: true, formats: ['Static'] },
            { name: 'Did you know', type: 'house', formats: ['Carousel'] },
            { name: 'Mood pack', type: 'set', size: 3, roles: ['featured', 'hero'], bands: ['session', 'immersive'], formats: ['Carousel'] }
          ]
        },
        { id: 'ig-thu-am', days: ['Thu'], time: '10:00', name: 'Trending pick', roles: ['featured', 'hero'], signals: ['performing'], bands: ['snack', 'bite'], formats: ['Reel', 'Static'] },
        { id: 'ig-thu-pm', days: ['Thu'], time: '19:00', name: 'Meme', type: 'house', formats: ['Static'] },
        { id: 'ig-fri-am', days: ['Fri'], time: '10:00', name: 'Cultural moment or offer', type: 'house', formats: ['Static', 'Reel'] },
        { id: 'ig-fri-pm', days: ['Fri'], time: '18:00', name: 'Friday new drop', roles: ['prelaunch', 'hero', 'featured'], signals: ['new', 'upcoming'], formats: ['Reel', 'Static'] },
        { id: 'ig-sat', days: ['Sat'], time: '11:00', name: 'Weekend deep dive', roles: ['featured', 'hero'], bands: ['session', 'immersive'], formats: ['Reel', 'Static'] },
        { id: 'ig-sun', days: ['Sun'], time: '11:00', name: 'Community pick', type: 'house', formats: ['Reel', 'Static'] }
      ]
    },
    {
      id: 'facebook', name: 'Facebook', short: 'FB', group: 'Social', enabled: true,
      summary: 'Publishes alongside Instagram through Meta\'s cross-posting, same day and time. No columns of its own.',
      mirror: { of: 'instagram', delayDays: 0 }, fields: [], slots: []
    },
    {
      id: 'youtube', name: 'YouTube Shorts', short: 'YT', group: 'Social', enabled: true,
      summary: 'Instagram Reels reposted a day later, so YouTube does not treat them as recycled.',
      mirror: { of: 'instagram', delayDays: 1, formats: ['Reel'] }, fields: [], slots: []
    },
    {
      id: 'reddit', name: 'Reddit', short: 'RD', group: 'Community', enabled: true,
      summary: 'Owned subreddit. Three anchor posts a week plus an offer post when one is live.',
      acceptsRoles: ['hero', 'featured', 'prelaunch', 'discovery'],
      fallbackRoles: ['hero', 'featured', 'prelaunch'],
      caps: { hero: 2, featured: 1, prelaunch: 2, discovery: 1 },
      maxPerTitle: 2, minGapHours: 72, noBackToBack: true,
      fields: [{ key: 'title', label: 'Post title', max: 300 }, { key: 'body', label: 'Body', max: 600 }],
      copyBrief: 'Post on the brand\'s own subreddit. News-style headline, plain and factual, no marketing language.',
      slots: [
        { id: 'rd-mon', days: ['Mon'], time: '12:00', name: 'Release of the week', roles: ['hero', 'prelaunch', 'featured'], signals: ['new', 'upcoming'], formats: ['Text'] },
        { id: 'rd-wed', days: ['Wed'], time: '12:00', name: 'Hidden gem', roles: ['discovery'], strictRoles: true, formats: ['Text'] },
        { id: 'rd-thu', days: ['Thu'], time: '12:00', name: 'Offer', type: 'house', optional: true, formats: ['Text'], note: 'Post only when an offer is live.' },
        { id: 'rd-fri', days: ['Fri'], time: '10:30', name: 'Coming next week', type: 'roundup', formats: ['Text'] }
      ]
    },
    {
      id: 'discord', name: 'Discord', short: 'DC', group: 'Community', enabled: true,
      summary: 'Core community. Scheduled moments only: weekly challenge, team pick, monthly voice hangout and recap.',
      acceptsRoles: ['hero', 'featured', 'discovery'],
      caps: { hero: 2, featured: 1, discovery: 1 },
      maxPerTitle: 2, minGapHours: 0, noBackToBack: true, balancePlans: false,
      fields: [{ key: 'message', label: 'Message', max: 500 }],
      copyBrief: 'Message in the brand\'s community server. Casual, first person, peer to peer.',
      slots: [
        { id: 'dc-mon', days: ['Mon'], time: '18:00', name: 'Weekly challenge', roles: ['hero', 'featured'], formats: ['Challenge'] },
        { id: 'dc-fri', days: ['Fri'], time: '18:00', name: 'Team pick', roles: ['featured', 'discovery'], formats: ['Text'] },
        { id: 'dc-voice', days: ['Wed'], weeks: [3], time: '20:00', name: 'Voice hangout', type: 'house', formats: ['Voice'] },
        { id: 'dc-recap', days: ['Sat'], weeks: [4], time: '12:00', name: 'You said, we did', type: 'house', formats: ['Text'] }
      ]
    },
    {
      id: 'x', name: 'X', short: 'X', group: 'Social', enabled: true,
      summary: 'Light presence. Two or three posts a week; reactive posts are added by hand.',
      acceptsRoles: ['hero', 'featured', 'prelaunch'],
      caps: { hero: 2, featured: 1, prelaunch: 1 },
      maxPerTitle: 2, minGapHours: 48, noBackToBack: true, balancePlans: false,
      fields: [{ key: 'post', label: 'Post', max: 280 }],
      copyBrief: 'Post on X. Short, sharp, one idea.',
      slots: [
        { id: 'x-tue', days: ['Tue'], time: '13:00', name: 'Industry take', type: 'house', formats: ['Text'] },
        { id: 'x-thu', days: ['Thu'], time: '13:00', name: 'Visual repost', roles: ['hero', 'featured', 'prelaunch'], formats: ['Static'] },
        { id: 'x-sat', days: ['Sat'], time: '17:00', name: 'Weekend pick', roles: ['featured', 'hero'], optional: true, formats: ['Text'] }
      ]
    },
    {
      id: 'linkedin', name: 'LinkedIn', short: 'LI', group: 'Professional', enabled: true,
      summary: 'Company page for the industry. A case-study carousel every two weeks plus launch milestones.',
      acceptsRoles: ['hero', 'featured'],
      caps: { hero: 2, featured: 1 },
      maxPerTitle: 2, minGapHours: 0, noBackToBack: true, balancePlans: false,
      fields: [{ key: 'hook', label: 'Opening line', max: 150 }, { key: 'post', label: 'Post', max: 1300 }],
      copyBrief: 'Company page post for industry professionals. Professional and specific, no consumer hype.',
      slots: [
        { id: 'li-carousel', days: ['Wed'], weeks: [1, 3], time: '11:00', name: 'Case-study carousel', type: 'house', formats: ['Carousel'] },
        { id: 'li-milestone', days: ['Fri'], weeks: [2, 4], time: '11:00', name: 'Launch milestone', roles: ['hero', 'featured'], formats: ['Static'] }
      ]
    },
    {
      id: 'email', name: 'Email newsletter', short: 'EM', group: 'Owned', enabled: false,
      summary: 'Weekly picks email with three titles.',
      acceptsRoles: ['hero', 'featured', 'discovery'],
      caps: { hero: 4, featured: 2, discovery: 1 },
      maxPerTitle: 4, minGapHours: 0, noBackToBack: false, balancePlans: false,
      fields: [{ key: 'subject', label: 'Subject', max: 60 }, { key: 'preview', label: 'Preview text', max: 90 }],
      copyBrief: 'Weekly newsletter. Subject line and inbox preview text.',
      slots: [
        { id: 'em-thu', days: ['Thu'], time: '09:00', name: 'Weekly picks', type: 'set', size: 3, roles: ['hero', 'featured', 'discovery'], formats: ['Email'] }
      ]
    },
    {
      id: 'whatsapp', name: 'WhatsApp channel', short: 'WA', group: 'Owned', enabled: false,
      summary: 'One weekend pick a week for channel followers.',
      acceptsRoles: ['hero', 'featured'],
      caps: { hero: 2, featured: 1 },
      maxPerTitle: 2, minGapHours: 0, noBackToBack: true, balancePlans: false,
      fields: [{ key: 'message', label: 'Message', max: 300 }],
      copyBrief: 'WhatsApp channel update. Friendly, short, one link.',
      slots: [
        { id: 'wa-sat', days: ['Sat'], time: '18:00', name: 'Weekend pick', roles: ['featured', 'hero'], formats: ['Text'] }
      ]
    }
  ];

  // ----------------------------------------------------------- industries
  // Demo catalogs are made up. Each row: [name, genre, average session in
  // minutes, archetype, plan]. Archetypes shape the generated numbers.
  var INDUSTRIES = {
    gaming: {
      id: 'gaming', label: 'Cloud gaming',
      vocab: { item: 'game', items: 'games', audience: 'players', partner: 'publisher', volume: 'Playtime', business: 'cloud gaming subscription service' },
      plans: [{ id: 'premium', label: 'Pro' }, { id: 'basic', label: 'Lite' }],
      bands: ['Snackable', 'Bite-sized', 'Session', 'Immersive'], bandMax: [15, 30, 60],
      demo: [
        ['Lantern Reach', 'Open-world RPG', 82, 'hit', 'premium'],
        ['Velvet Circuit', 'Arcade racer', 12, 'hit', 'both'],
        ['Moss Kingdom', 'Cozy sim', 52, 'hit', 'both'],
        ['Brass Tide', 'Naval strategy', 46, 'steady', 'premium'],
        ['Paper Comets', 'Arcade shooter', 9, 'steady', 'basic'],
        ['Glasshouse', 'Puzzle', 14, 'steady', 'basic'],
        ['Ember Saints', 'Action RPG', 74, 'steady', 'premium'],
        ['Tiny Atlas', 'Puzzle platformer', 19, 'steady', 'both'],
        ['Copperhead Rally', 'Rally racer', 21, 'steady', 'both'],
        ['Starling Street', 'Life sim', 44, 'steady', 'basic'],
        ['Pocket Pharaoh', 'City builder', 35, 'steady', 'premium'],
        ['Kite Season', 'Casual flyer', 8, 'steady', 'basic'],
        ['Riverlight', 'Narrative puzzle', 31, 'niche', 'both'],
        ['Ghost Signal', 'Detective adventure', 58, 'niche', 'premium'],
        ['Bastion of Reeds', 'Tower defence', 27, 'niche', 'basic'],
        ['Iron Orchard', 'Survival', 66, 'declining', 'premium'],
        ['Saltwind', 'Sailing sim', 49, 'declining', 'premium'],
        ['Hexfall', 'Roguelike', 23, 'declining', 'both'],
        ['Nightjar', 'Horror adventure', 51, 'declining', 'premium'],
        ['Marble Run Deluxe', 'Arcade', 9, 'declining', 'basic'],
        ['Frostline Express', 'Train sim', 55, 'declining', 'premium'],
        ['Hollow Crown', 'Story RPG', 86, 'new', 'premium'],
        ['Cloudbreak', 'Platformer', 18, 'new', 'basic'],
        ['Dune Couriers', 'Delivery sim', 41, 'new', 'both'],
        ['Ferro Fist', 'Arcade brawler', 14, 'new', 'basic'],
        ['Overgrown', 'Roguelike', 26, 'new', 'premium'],
        ['Ashen Tide', 'Open-world action', 92, 'upcoming-hero', 'premium'],
        ['Willow Woods', 'Cozy farming', 48, 'upcoming-featured', 'both'],
        ['Lumen Drift', 'Space exploration', 70, 'upcoming', 'premium'],
        ['Grit and Gears', 'Mech action', 39, 'upcoming', 'premium'],
        ['Quill and Cinder', 'Story adventure', 68, 'small', 'premium'],
        ['The Ninth Lockpick', 'Stealth action', 61, 'small', 'premium']
      ]
    },
    ott: {
      id: 'ott', label: 'Video streaming',
      vocab: { item: 'title', items: 'titles', audience: 'viewers', partner: 'studio', volume: 'Watch time', business: 'video streaming subscription service' },
      plans: [{ id: 'premium', label: 'Premium' }, { id: 'basic', label: 'Mobile' }],
      bands: ['Short episode', 'Episode', 'Feature length', 'Binge'], bandMax: [25, 50, 110],
      demo: [
        ['Monsoon Files', 'Crime drama', 96, 'hit', 'premium'],
        ['Second Shift', 'Sitcom', 22, 'hit', 'both'],
        ['Harbour Lights', 'Romance drama', 74, 'hit', 'both'],
        ['Night Market', 'Food docuseries', 41, 'steady', 'both'],
        ['Small Hours', 'Anthology', 46, 'steady', 'premium'],
        ['Ninth Avenue Kitchen', 'Cooking reality', 38, 'steady', 'basic'],
        ['The Long Ledger', 'Finance thriller film', 118, 'steady', 'premium'],
        ['Little Comets', 'Kids animation', 14, 'steady', 'basic'],
        ['Tin Roof Comedy Hour', 'Stand-up special', 58, 'steady', 'both'],
        ['Wild Atlas', 'Nature docuseries', 47, 'steady', 'both'],
        ['Rooftop Radio', 'Sitcom', 21, 'steady', 'basic'],
        ['Common Ground', 'Family drama', 52, 'steady', 'premium'],
        ['The Cartographer', 'Mystery film', 112, 'niche', 'premium'],
        ['Ink and Iron', 'Art docuseries', 33, 'niche', 'both'],
        ['Kilometre Zero', 'Road trip film', 104, 'niche', 'premium'],
        ['Fault Lines', 'Disaster drama', 55, 'declining', 'premium'],
        ['Glass Republic', 'Political thriller', 61, 'declining', 'premium'],
        ['Dust Road', 'Western series', 49, 'declining', 'both'],
        ['Afterglow', 'Music docuseries', 39, 'declining', 'basic'],
        ['Brightwater', 'Teen drama', 44, 'declining', 'basic'],
        ['Open Season', 'Sports comedy', 28, 'declining', 'both'],
        ['The Seventh Room', 'Horror series', 63, 'new', 'premium'],
        ['Paper Lanterns', 'Animated film', 96, 'new', 'both'],
        ['Velvet Hour', 'Talk show', 24, 'new', 'basic'],
        ['Stillwater Bay', 'Detective series', 57, 'new', 'premium'],
        ['Salt and Steel', 'Survival reality', 42, 'new', 'both'],
        ['The Orchard Trial', 'Courtroom drama', 88, 'upcoming-hero', 'premium'],
        ['Quiet Floor', 'Workplace comedy', 23, 'upcoming-featured', 'both'],
        ['Northbound', 'Travel docuseries', 45, 'upcoming', 'both'],
        ['Lowtide', 'Thriller film', 108, 'upcoming', 'premium'],
        ['Copper Sky', 'Indie drama film', 101, 'small', 'premium'],
        ['Pocket Theatre', 'Short films', 12, 'small', 'basic']
      ]
    },
    music: {
      id: 'music', label: 'Music streaming',
      vocab: { item: 'release', items: 'releases', audience: 'listeners', partner: 'label', volume: 'Listening time', business: 'music streaming subscription service' },
      plans: [{ id: 'premium', label: 'Premium' }, { id: 'basic', label: 'Free' }],
      bands: ['Quick listen', 'Commute', 'Full album', 'Deep listen'], bandMax: [10, 25, 50],
      demo: [
        ['Rush Hour Tapes', 'Playlist', 24, 'hit', 'both'],
        ['Late Bloom', 'Indie pop album', 41, 'hit', 'both'],
        ['Focus Fields', 'Study playlist', 78, 'hit', 'premium'],
        ['Monsoon Static', 'Electronic album', 46, 'steady', 'both'],
        ['Night Drive Radio', 'Playlist', 33, 'steady', 'both'],
        ['Paper Boats', 'Folk album', 38, 'steady', 'premium'],
        ['Sunday Slow', 'Acoustic playlist', 52, 'steady', 'both'],
        ['Brass Avenue', 'Jazz album', 44, 'steady', 'premium'],
        ['Gym Floor', 'Workout playlist', 29, 'steady', 'basic'],
        ['Ninety Seconds', 'Singles mix', 8, 'steady', 'basic'],
        ['Coastline', 'Chill playlist', 47, 'steady', 'both'],
        ['Echo Room', 'Live album', 56, 'steady', 'premium'],
        ['Fieldnotes', 'Ambient album', 64, 'niche', 'premium'],
        ['Small Town Choir', 'Choral album', 37, 'niche', 'both'],
        ['Tape Hiss', 'Lo-fi playlist', 71, 'niche', 'premium'],
        ['Golden Hour Classics', 'Throwback playlist', 35, 'declining', 'both'],
        ['Neon Parade', 'Synth-pop album', 39, 'declining', 'premium'],
        ['Rainwater', 'Indie album', 42, 'declining', 'both'],
        ['Party Starter', 'Party playlist', 27, 'declining', 'basic'],
        ['Midnight Office', 'Focus playlist', 61, 'declining', 'premium'],
        ['Hometown Heroes', 'Regional hits', 31, 'declining', 'basic'],
        ['Glass Bridges', 'Alt-rock album', 44, 'new', 'premium'],
        ['Velvet Static', 'R&B album', 38, 'new', 'both'],
        ['First Light', 'Debut EP', 17, 'new', 'basic'],
        ['Long Way Round', 'Country album', 49, 'new', 'both'],
        ['Pocket Symphonies', 'Classical shorts', 9, 'new', 'basic'],
        ['Harbour Songs', 'Major album', 52, 'upcoming-hero', 'premium'],
        ['Weekend Sketches', 'Indie EP', 18, 'upcoming-featured', 'both'],
        ['Afterparty', 'Dance album', 45, 'upcoming', 'premium'],
        ['Quiet Engines', 'Ambient EP', 33, 'upcoming', 'both'],
        ['Basement Demos', 'Demo collection', 22, 'small', 'basic'],
        ['Stray Verses', 'Spoken word', 26, 'small', 'premium']
      ]
    }
  };

  function sessionBands(ind) {
    var ids = ['snack', 'bite', 'session', 'immersive'];
    return ids.map(function (id, i) { return { id: id, label: ind.bands[i], max: i < 3 ? ind.bandMax[i] : null }; });
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function seedOf(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  var ARCHETYPES = {
    hit: { users: [5000, 9000], trend: [5, 25], spu: [6, 9], age: [120, 700] },
    steady: { users: [900, 3000], trend: [1, 14], spu: [3, 6], age: [90, 900] },
    niche: { users: [90, 320], trend: [2, 15], spu: [9, 14], age: [90, 700] },
    declining: { users: [700, 2600], trend: [-45, -12], spu: [2, 4], age: [100, 600] },
    'new': { users: [400, 2500], trend: [60, 220], spu: [3, 7], age: [4, 40] },
    small: { users: [8, 25], trend: [-10, 10], spu: [2, 3], age: [90, 400] }
  };
  var UPCOMING_OFFSETS = { 'upcoming-hero': 9, 'upcoming-featured': 16, upcoming: [5, 34] };

  /**
   * Made-up catalog rows for a preset, with dates placed around the month
   * being planned so every archetype shows up whatever month is chosen.
   * Rows use the same column names a real CSV upload would.
   */
  function demoRows(industryId, year, month) {
    var ind = INDUSTRIES[industryId];
    var rnd = mulberry32(seedOf(industryId));
    var start = Date.UTC(year, month, 1);
    var upCount = 0;
    function between(r) { return r[0] + (r[1] - r[0]) * rnd(); }
    function isoDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
    return ind.demo.map(function (d) {
      var name = d[0], genre = d[1], avg = d[2], arch = d[3], plan = d[4];
      var planLabel = plan === 'both' ? 'both' : ind.plans.filter(function (p) { return p.id === plan; })[0].label;
      if (arch.indexOf('upcoming') === 0) {
        var off = arch === 'upcoming' ? UPCOMING_OFFSETS.upcoming[upCount++ % 2] : UPCOMING_OFFSETS[arch];
        return {
          title: name, genre: genre, release_date: isoDate(start + off * 864e5), plan: planLabel,
          users: '', sessions: '', volume: '', volume_trend: '', avg_session: avg,
          designation: arch === 'upcoming-hero' ? 'hero' : arch === 'upcoming-featured' ? 'featured' : ''
        };
      }
      var a = ARCHETYPES[arch];
      var users = Math.round(between(a.users));
      var spu = between(a.spu);
      var sessions = Math.round(users * spu);
      var avgS = Math.max(3, Math.round(avg * (0.85 + rnd() * 0.3)));
      return {
        title: name, genre: genre,
        release_date: isoDate(start - Math.round(between(a.age)) * 864e5),
        plan: planLabel, users: users, sessions: sessions,
        volume: Math.round(sessions * avgS), volume_trend: Math.round(between(a.trend)),
        avg_session: avgS, designation: ''
      };
    });
  }

  // ------------------------------------------------------------- voice
  var TONES = [
    { id: 'professional', label: 'Professional / Authoritative', guide: 'Clear, confident and precise. Short sentences, no slang, no hype.' },
    { id: 'friendly', label: 'Friendly / Conversational', guide: 'Warm and conversational, like a friend recommending something. Contractions are fine.' },
    { id: 'humorous', label: 'Humorous / Witty', guide: 'Light and witty. At most one joke per post, never at the reader\'s expense.' },
    { id: 'empathetic', label: 'Empathetic / Caring', guide: 'Considerate and reassuring. Acknowledge how people feel before asking them to act.' },
    { id: 'inspirational', label: 'Inspirational / Aspirational', guide: 'Vivid and aspirational. Paint the experience and end on a lift.' },
    { id: 'urgent', label: 'Direct / Urgent', guide: 'Direct and time-bound. Lead with the action and the reason to act now.' },
    { id: 'custom', label: 'Custom...', guide: '' }
  ];

  function blankRules() { return { bannedChars: [], bannedWords: [], noAllCaps: false, noEmoji: false, allowedCaps: [] }; }

  var BRAND_PROFILES = {
    blank: {
      id: 'blank', label: 'Start from scratch',
      tone: 'friendly', customTone: '', voiceSummary: '', examples: '',
      globalRules: blankRules(), channelRules: {}
    },
    gaming: {
      id: 'gaming', label: 'Example: gaming platform',
      tone: 'custom',
      customTone: 'Energetic, cinematic and confident. Action-led calls to action. No filler words.',
      voiceSummary: 'Every message points to one of two ideas: here is something new and worth your time, or pick up where you left off. Never frame anything as competing or winning, because the service is built for single-player discovery.',
      examples: 'New today: Lantern Reach / Drop in for a quick run.\nLantern Reach awaits / Pick up where you left off.\nComing this weekend / Ashen Tide arrives Saturday.',
      globalRules: { bannedChars: ['-', '–', '—', '+'], bannedWords: ['kill', 'die', 'slaughter', 'blood'], noAllCaps: true, noEmoji: false, allowedCaps: [] },
      channelRules: { push: { fieldMax: { header: 24, body: 36 } } }
    }
  };

  return {
    CHANNELS: CHANNELS, INDUSTRIES: INDUSTRIES, TONES: TONES, BRAND_PROFILES: BRAND_PROFILES,
    sessionBands: sessionBands, demoRows: demoRows, blankRules: blankRules
  };
});
