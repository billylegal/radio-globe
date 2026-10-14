(async function () {
  const $ = id => document.getElementById(id);
  const FAMCOL = {"Electronic":"#4fd1ff","Pop":"#ff6fb5","Rock":"#ff5a4f","Hip-Hop & R&B":"#ffb347","Jazz & Blues":"#c792ff","Classical & Instrumental":"#e9e4a0","Country, Folk & Roots":"#b6e35a","Reggae & Caribbean":"#3ddc84","Latin":"#ff8a3d","World":"#2ee6c8","Decades & Oldies":"#d6a6ff","Spoken & Talk":"#9db4d4","Religious":"#f2f2f2","Vibes & Moods":"#ff9ec7","Other":"#8fa3c8"};
  const NOGENRE = "#8aa0c4";

  // ---------- load data ----------
  const res = await fetch('data/stations.json', { cache: 'no-cache' });
  const DB = await res.json();
  const G = DB.genres, S = DB.stations;
  G.forEach(g => { if (g.family === 'Classical & Instrumental' || g.family === 'Decades & Oldies') g.family = 'Other'; });   // Billy: these two live under Other
  const famOf = G.map(g => g.family);
  // hand-picked departments: Old-Time Stories (radio drama, audiobooks, old-time radio) and Kids
  const gid = n => { const g = G.find(x => x.name === n); return g ? g.id : -1; };
  const SETS = {
    stories: { label: '📖 Old-Time Stories', ids: [gid('Audiobooks & Drama')],
      re: /old.?time|\botr\b|radio drama|radio theat|audio.?book|storytell|story ?time|bedtime|short stories|tales|mystery theat|golden age of radio|h[öo]rspiel|h[öo]rbuch|livre audio|lectura/i, no: /vinyl|christmas|top ?40|hip.?hop|alternative|gotradio|laut\.fm sound/i },
    kids: { label: '🧒 Kids', ids: [gid('Kids')], re: /\b(kids?|kinder|children|enfants|ni[ñn]os|bambini|junior|cartoon)\b/i, no: /adult|18\+/i }
  };
  for (const k in SETS) { const d = SETS[k]; d.test = s => s[11].some(i => d.ids.includes(i)) || (d.re.test(s[0] + ' ' + (s[18] || '')) && !(d.no && d.no.test(s[0]))); }

  let revealed = false;
  function reveal() { if (revealed) return; revealed = true; const l = $('loading'); l.classList.add('fading'); setTimeout(() => l.classList.add('hidden'), 650); }
  setTimeout(reveal, 7000);   // never keep the cover up for ever

  // ---------- state ----------
  const BAND = ['Online', 'FM', 'AM', 'Shortwave', 'DAB'];
  let lyricsOnly = false; const lyricSet = new Map(), lyricSince = new Map(); let lyricStamp = 0;   // uuid -> title of the song with lyrics it is playing right now
  let band = -1, playableOnly = false;   // band -1 = every band
  let filter = { kind: 'all' };           // all | genre | family
  let shown = S;                          // currently filtered stations
  let scope = null, lastFilter = null;    // scope = {test, label}: a searched country / city; Random stays inside it until you pick a genre, a station or Clear
  function setScope(sc) { scope = sc; const b = $('scopepill'); if (b) { b.classList.toggle('hidden', !sc); b.textContent = sc ? '📍 ' + sc.label + ' ✕' : ''; } }
  let current = null;                     // playing station
  let autoRotate = true;
  const cellKey = (la, lo, c) => Math.floor((la + 90) / c) + ':' + Math.floor((lo + 180) * Math.max(0.15, Math.cos(la * Math.PI / 180)) / c);

  function applyFilter() {
    let base; if (filter !== lastFilter) { lastFilter = filter; setScope(null); }   // a new genre / All = back to the whole world   // (Live is its own department: its genre list is separate from this filter)
    if (filter.kind === 'all') base = S;
    else if (filter.kind === 'genre') base = S.filter(s => s[11].includes(filter.id));
    else if (filter.kind === 'set') base = S.filter(SETS[filter.key].test);
    else { const ids = new Set(G.filter(g => g.family === filter.fam).map(g => g.id)); base = S.filter(s => s[11].some(i => ids.has(i))); }
    if (lyricsOnly) base = base.filter(s => lyricSet.has(s[13]));
    bandCounts = [0, 0, 0, 0, 0]; for (const s of base) if (!playableOnly || s[1]) bandCounts[s[14]]++;
    shown = base.filter(s => (band < 0 || s[14] === band) && (!playableOnly || s[1]) && (!favOnly || favs.has(s[13])));
    paintBands(); paintFavs();
    const label = filter.kind === 'all' ? 'All genres' : filter.kind === 'genre' ? G[filter.id].name : filter.kind === 'set' ? SETS[filter.key].label.replace(/^\S+\s/, '') : filter.fam;
    $('favonly').checked = favOnly;
    $('stat').textContent = label + (lyricsOnly ? ' · with lyrics' : '') + (band >= 0 ? ' · ' + BAND[band] : '') + ' · ' + shown.length.toLocaleString() + ' stations';
    history.replaceState(null, '', filter.kind === 'all' ? location.pathname : '#' + encodeURIComponent(filter.kind === 'genre' ? G[filter.id].name : filter.kind === 'set' ? filter.key : filter.fam));
    refreshPoints();
    document.querySelectorAll('.chip,.allbtn').forEach(e => e.classList.remove('on'));
    const on = filter.kind === 'all' && !lyricsOnly ? $('allbtn') : filter.kind === 'genre' ? document.querySelector('.chip[data-g="' + filter.id + '"]') : null;
    if (on) on.classList.add('on');
    if ($('lyrbtn')) $('lyrbtn').classList.toggle('on', lyricsOnly);
    document.querySelectorAll('#genres .fh[data-set]').forEach(b => b.classList.toggle('on', filter.kind === 'set' && filter.key === b.dataset.set));
  }

  // ---------- clustering ----------
  let bandCounts = [0, 0, 0, 0, 0];
  const bandsEl = $('bands');
  function paintBands() {
    const tot = bandCounts.reduce((a, b) => a + b, 0);
    bandsEl.innerHTML = [[-1, 'All', tot], [1, 'FM', bandCounts[1]], [2, 'AM', bandCounts[2]], [0, 'Online', bandCounts[0]], [3, 'SW', bandCounts[3]], [4, 'DAB', bandCounts[4]]]
      .map(([b, l, n]) => '<span class="chip' + (band === b ? ' on' : '') + '" data-b="' + b + '">' + l + '<small>' + n.toLocaleString() + '</small></span>').join('');
  }
  bandsEl.addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; if (c.dataset.b === 'fav') { toggleDrawer(); return; } band = +c.dataset.b; applyFilter(); });
  $('playable').addEventListener('change', e => { playableOnly = e.target.checked; applyFilter(); });
  // "only stations playing songs with lyrics": the list is built on the PC every few minutes (song titles -> LRCLIB) and published with the site
  async function loadLyricStations() {
    try {
      const d = await (await fetch('data/lyric_stations.json?t=' + Date.now())).json(); if (!d.updated || d.updated === lyricStamp) return; lyricStamp = d.updated;
      lyricSet.clear(); lyricSince.clear(); for (const r of d.items || []) { lyricSet.set(r.u, r.title); if (r.since) lyricSince.set(r.u, { title: r.title, since: r.since, err: r.err }); }
      const lb = $('lyrbtn'); if (lb) lb.querySelector('small').textContent = lyricSet.size ? lyricSet.size + ' now' : '…'; dirty = true; if (lyricsOnly) applyFilter();
    } catch (e) {}
  }
  loadLyricStations(); setInterval(loadLyricStations, 60000);
  function stationColor(s) { return s[11].length ? FAMCOL[famOf[s[11][0]]] || NOGENRE : NOGENRE; }
  function cluster(altitude) {
    const cell = Math.max(0.0015, Math.pow(altitude, 1.4) * 0.3);
    const m = new Map();
    for (const s of shown) {
      const k = cellKey(s[2], s[3], cell);
      let c = m.get(k);
      if (!c) { c = { lat: 0, lng: 0, list: [] }; m.set(k, c); }
      c.list.push(s); c.lat += s[2]; c.lng += s[3];
    }
    const out = [];
    for (const c of m.values()) {
      const n = c.list.length; c.lat /= n; c.lng /= n; c.n = n;
      c.list.sort((a, b) => b[5] - a[5]);
      const fc = {}; for (const s of c.list) { const col = filter.kind === 'genre' ? FAMCOL[G[filter.id].family] : stationColor(s); fc[col] = (fc[col] || 0) + 1; }
      c.bl = c.list.some(isBL);
      c.color = Object.entries(fc).sort((a, b) => b[1] - a[1])[0][0];
      out.push(c);
    }
    return out;
  }

  // ---------- globe ----------
  const globe = Globe()(document.getElementById('globe'))
    .globeImageUrl('vendor/earth-blue-marble.jpg')
    .bumpImageUrl('vendor/earth-topology.png')
    .backgroundImageUrl('vendor/night-sky.png')
    .globeTileEngineUrl((x, y, l) => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + l + '/' + y + '/' + x)
    .globeTileEngineMaxLevel(19)
    .atmosphereColor('#6ab7ff').atmosphereAltitude(0.18)
    .labelLat(c => c[2]).labelLng(c => c[3]).labelText(c => c[0]).labelSize(c => globe.pointOfView().altitude * (0.55 + Math.min(0.35, Math.log10(c[6] + 10) * 0.045))).labelDotRadius(c => globe.pointOfView().altitude * 0.16).labelColor(() => 'rgba(255,255,255,.95)').labelResolution(2).labelAltitude(0.0008)
    .onGlobeReady(() => setTimeout(reveal, 350))
    .onZoom(() => schedule());
  const ctl = globe.controls();
  ctl.autoRotate = true; ctl.autoRotateSpeed = 0.35; ctl.minDistance = 100.12; ctl.maxDistance = 520; ctl.zoomSpeed = 0.9; ctl.enableDamping = true;
  try { globe.renderer().setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth <= 820 ? 1.5 : 2)); } catch (e) {}
  globe.pointOfView({ lat: 30, lng: 10, altitude: innerWidth < 500 ? 3.3 : innerWidth < innerHeight ? 2.4 : 1.7 });
  addEventListener('resize', () => globe.width(innerWidth).height(innerHeight));
  let tmr, lastAlt = -1;
  function schedule() { clearTimeout(tmr); tmr = setTimeout(() => { const a = globe.pointOfView().altitude; if (Math.abs(a - lastAlt) / Math.max(a, .05) > 0.12) refreshPoints(); }, 140); }
  function refreshLabels() {
    const pov = globe.pointOfView(), a = pov.altitude;
    if (!cities.length || a > 0.03) { globe.labelsData([]); return; }
    const span = a * 40 + 0.15, min = a > 0.015 ? 1e6 : a > 0.008 ? 1e5 : 0;
    const list = []; for (const c of cities) { if (c[6] < min) continue; if (Math.abs(c[2] - pov.lat) > span || Math.abs(((c[3] - pov.lng + 540) % 360) - 180) > span / Math.max(0.2, Math.cos(pov.lat * Math.PI / 180))) continue; list.push(c); if (list.length >= 45) break; }
    globe.labelsData(list);
  }
  function refreshPoints() { refreshLabels(); const a = globe.pointOfView().altitude; lastAlt = a; cells = cluster(a); dirty = true; }
  // stop auto-rotation once the user grabs the globe
  ctl.addEventListener('start', () => { ctl.autoRotate = false; autoRotate = false; $('rotate').style.opacity = .5; });

  // ---------- "Ghost" view: no globe, only the station dots ----------
  const TILE_URL = (x, y, l) => 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + l + '/' + y + '/' + x;
  let spaced = false, roloOn = false;
  function setSpaced(on, save) {
    spaced = on; $('spaceBtn').classList.toggle('on', on); $('spaceBtn').style.opacity = 1; $('spaceBtn').textContent = roloOn ? '🎞 Rolodex' : on ? '👻 Ghost' : '🌍 Earth'; $('spaceBtn').title = 'View: Earth, Ghost or Rolodex (tap to switch)';
    if (save) { try { localStorage.setItem('rg-spaced', on ? '1' : '0'); } catch (e) {} }
    if (on) {
      try { globe.globeMaterial().visible = false; } catch (e) {}
      globe.showAtmosphere(false).backgroundImageUrl(null).backgroundColor('#02050c');
      try { globe.globeTileEngineUrl(null); } catch (e) {}
    } else {
      try { globe.globeMaterial().visible = true; } catch (e) {}
      globe.showAtmosphere(true).backgroundImageUrl('vendor/night-sky.png');
      try { globe.globeTileEngineUrl(TILE_URL); } catch (e) {}
    }
    dirty = true;
  }

  function onCell(c) {
    if (c.live) { liveWatch(c.live); return; } if (c.ev) { openLive('events'); return; }
    const alt = globe.pointOfView().altitude;
    if (c.n === 1) { openPanel(c.list, c.list[0][0], 'near ' + (c.list[0][12] || '')); if (c.list[0][1]) play(c.list[0], true); else flyTo(c.list[0]); return; }
    if (alt > 0.45 && c.n > 25) { globe.pointOfView({ lat: c.lat, lng: c.lng, altitude: Math.max(0.12, alt * 0.45) }, 900); return; }
    openPanel(c.list, c.n + ' stations here', c.list[0][12] || ''); globe.pointOfView({ lat: c.lat, lng: c.lng, altitude: Math.min(alt, 0.5) }, 700);
  }

  // ---------- red dots drawn flat on a canvas (Radio Garden style: constant pixel size) ----------
  let cells = [], dirty = true, pulseT = 0, scr = [], hover = null;
  const cv = document.createElement('canvas'); cv.id = 'dots'; document.body.insertBefore(cv, $('loading'));
  const cx = cv.getContext('2d');
  function sizeCanvas() { const d = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; cx.setTransform(d, 0, 0, d, 0, 0); dirty = true; }
  sizeCanvas(); addEventListener('resize', sizeCanvas);
  // phones/tablets: the song info card must sit UNDER the search bar, never over the top buttons (CSS reads --ptop)
  const setPtop = () => { const sw = $('searchwrap'); if (sw) document.documentElement.style.setProperty('--ptop', Math.ceil(sw.getBoundingClientRect().bottom + 8) + 'px'); const pl = $('player'); if (pl) document.documentElement.style.setProperty('--pbot', Math.ceil(innerHeight - pl.getBoundingClientRect().top + 8) + 'px'); };
  try { new ResizeObserver(setPtop).observe($('player')); } catch (e) {}
  setPtop(); addEventListener('resize', setPtop); addEventListener('orientationchange', () => setTimeout(setPtop, 250)); setTimeout(setPtop, 600);
  let RED = '#39ff14', REDRGB = '57,255,20';
  const THEMES = [
    { id: 'nvg', name: 'Night Vision', c: '#39ff14', ink: '#031200', glass: '8,16,8' }, { id: 'amber', name: 'Tactical Amber', c: '#ffb000', ink: '#1a0f00', glass: '20,14,6' },
    { id: 'alert', name: 'Alert Red', c: '#ff2a2a', ink: '#fff', glass: '20,8,8' }, { id: 'hud', name: 'Cyan HUD', c: '#00e5ff', ink: '#001417', glass: '6,16,22' },
    { id: 'olive', name: 'Olive Drab', c: '#b4ff3c', ink: '#0d1500', glass: '14,18,8' }, { id: 'sand', name: 'Desert Sand', c: '#ffe066', ink: '#1a1500', glass: '20,18,10' },
    { id: 'flare', name: 'Orange Flare', c: '#ff6a00', ink: '#190800', glass: '20,11,6' }, { id: 'haze', name: 'Purple Haze', c: '#d946ff', ink: '#fff', glass: '16,8,22' } ];
  function setTheme(id, save) {
    const t = THEMES.find(x => x.id === id) || THEMES[0], r = document.documentElement.style;
    RED = t.c; REDRGB = [1, 3, 5].map(i => parseInt(t.c.slice(i, i + 2), 16)).join(',');
    r.setProperty('--acc', t.c); r.setProperty('--glass', 'rgba(' + t.glass + ',.76)'); r.setProperty('--glass-solid', 'rgba(' + t.glass + ',.96)'); r.setProperty('--acc-ink', t.ink); r.setProperty('--acc-rgb', REDRGB);
    document.querySelectorAll('#themesw button').forEach(b => b.classList.toggle('on', b.dataset.t === t.id));
    if (save) { try { localStorage.setItem('rg-theme', t.id); } catch (e) {} }
    dirty = true;
  }
  $('themesw').innerHTML = THEMES.map(t => '<button data-t="' + t.id + '"><i style="background:' + t.c + '"></i>' + t.name + '</button>').join('');
  $('themesw').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTheme(b.dataset.t, true); });
  // every tap on Theme switches to the next of the 8 colors (no popup), on every device
  $('themeBtn').onclick = e => { e.stopPropagation(); const i = THEMES.findIndex(t => t.c === RED); setTheme(THEMES[(i + 1) % THEMES.length].id, true); };
  document.addEventListener('click', e => { if (!e.target.closest('#themepop') && !e.target.closest('#themeBtn')) $('themepop').classList.add('hidden'); });
  try { setTheme(localStorage.getItem('rg-theme') || 'nvg'); } catch (e) { setTheme('nvg'); }
  function project(lat, lng, alt) {
    const cam = globe.camera(), p = globe.getCoords(lat, lng, alt);
    const v = cam.position.clone().set(p.x, p.y, p.z);
    const len = Math.hypot(p.x, p.y, p.z), cp = cam.position, dx = cp.x - p.x, dy = cp.y - p.y, dz = cp.z - p.z;
    const vis = (p.x * (cp.x - p.x) + p.y * (cp.y - p.y) + p.z * (cp.z - p.z)) / len;   // > 0 : on the camera's side of the horizon
    v.project(cam);
    const cosv = (p.x * dx + p.y * dy + p.z * dz) / (len * Math.hypot(dx, dy, dz) || 1);   // 1 = facing the camera, 0 = on the horizon
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, vis, cosv, behind: v.z > 1 };
  }
  // "resonance": a beat-like level that drives the rings while a station is playing
  const isPlaying = () => (typeof ytOn !== 'undefined' && ytOn) ? ytPlaying : !audio.paused;
  function level() {
    if (!isPlaying()) return 0;
    const t = performance.now() / 1000;
    const v = 0.5 * Math.abs(Math.sin(t * 6.6)) + 0.3 * Math.abs(Math.sin(t * 10.4 + 1.3)) + 0.2 * Math.max(0, Math.sin(t * 17.9) * Math.sin(t * 2.3));
    return Math.min(1, v);
  }
  const bz = document.getElementById('bullseye');
  let lastCam = '';
  let drawnAt = 0;
  function frame() {   // called right after every WebGL render, so the dots are always painted for the exact camera the globe was just drawn with
    drawnAt = performance.now();
    const cam = globe.camera(), key = cam.position.x.toFixed(3) + cam.position.y.toFixed(3) + cam.position.z.toFixed(3) + innerWidth;
    const lv = level(), pulsing = (current && (lv > 0 || performance.now() - pulseT < 3000)) || liveItems.length > 0;
    if (key === lastCam && !dirty && !pulsing) return;
    draw(lv);
  }
  function draw(lv) {
    if (lv === undefined) lv = level();
    const cam = globe.camera(); cam.updateMatrixWorld(true);
    lastCam = cam.position.x.toFixed(3) + cam.position.y.toFixed(3) + cam.position.z.toFixed(3) + innerWidth; dirty = false;
    const dpr = Math.min(2, devicePixelRatio || 1); cx.setTransform(dpr, 0, 0, dpr, 0, 0);   // always start from a clean, un-shifted canvas
    cx.globalAlpha = 1; cx.clearRect(0, 0, innerWidth, innerHeight);
    scr = [];
    const alt = globe.pointOfView().altitude;
    const labSeen = new Set();
    for (const c of cells) {
      const q = project(c.lat, c.lng, 0.0015);
      if (q.behind || q.vis <= 0 || q.x < -20 || q.y < -20 || q.x > innerWidth + 20 || q.y > innerHeight + 20) continue;
      const fade = Math.min(1, q.cosv / 0.12);
      if (c.bl) { cx.globalAlpha = fade; cx.fillStyle = '#ffd45a'; cx.strokeStyle = '#fff'; cx.lineWidth = 1.2; cx.beginPath(); cx.arc(q.x, q.y, 3.6, 0, 6.2832); cx.fill(); cx.stroke(); scr.push({ x: q.x, y: q.y, r: 3.6, c }); continue; }
      const near = alt < 0.03 ? 1 + (0.03 - alt) / 0.03 * 1.6 : 1;   // a little bigger once you are right on top of a city
      const r = (c.n > 1 ? 1.15 + Math.min(0.5, Math.log2(c.n) * 0.08) : 1.15) * near * (hover === c ? 2 : 1);
      if (lyricSet.size && c.list.some(st => lyricSet.has(st[13]))) {   // a station here is playing a song with lyrics right now: lit red (blue when the theme itself is red)
        const lc = RED === '#ff2a2a' ? '#2e8bff' : '#ff2a2a', lr = r + 1.6;
        cx.globalAlpha = 0.28 * fade; cx.fillStyle = lc; cx.beginPath(); cx.arc(q.x, q.y, lr + 3.5, 0, 6.2832); cx.fill();
        cx.globalAlpha = fade; cx.fillStyle = lc; cx.beginPath(); cx.arc(q.x, q.y, lr, 0, 6.2832); cx.fill();
        scr.push({ x: q.x, y: q.y, r: lr, c }); continue;
      }
      cx.globalAlpha = 0.9 * fade; cx.fillStyle = RED; cx.beginPath(); cx.arc(q.x, q.y, r, 0, 6.2832); cx.fill();
      scr.push({ x: q.x, y: q.y, r, c });
      if (c.n === 1 && alt < 0.012) { const tx = q.x + r + 5, ty = q.y + 4, w = c.list[0][0].length * 6.4; const gk = Math.floor(tx / 90) + ':' + Math.floor(ty / 16); if (!labSeen.has(gk) && !labSeen.has((Math.floor(tx / 90) + 1) + ':' + Math.floor(ty / 16))) { labSeen.add(gk); cx.globalAlpha = fade; cx.font = '600 11px system-ui,sans-serif'; cx.lineWidth = 3; cx.strokeStyle = 'rgba(0,0,0,.75)'; cx.fillStyle = '#fff'; cx.strokeText(c.list[0][0], tx, ty); cx.fillText(c.list[0][0], tx, ty); } }
    }
    // live DJ sets (pulsing red ring) and tonight's events (diamonds)
    const nowT = performance.now() / 1000;
    for (const r of liveItems) {
      if (r.kind !== 'live' || r.ai) continue;
      const q = project(r.lat, r.lng !== undefined ? r.lng : r.lon, 0.0016); if (q.behind || q.vis <= 0) continue;
      const fade = Math.min(1, q.cosv / 0.12), ph = (((nowT * 0.8 + (r.lat * 7)) % 1) + 1) % 1;
      cx.globalAlpha = fade * (1 - ph) * 0.8; cx.strokeStyle = '#ff3b3b'; cx.lineWidth = 1.6; cx.beginPath(); cx.arc(q.x, q.y, 4 + ph * 11, 0, 6.2832); cx.stroke();
      cx.globalAlpha = fade; cx.fillStyle = '#ff3b3b'; cx.strokeStyle = '#fff'; cx.lineWidth = 1.2; cx.beginPath(); cx.arc(q.x, q.y, 3.4, 0, 6.2832); cx.fill(); cx.stroke();
      scr.push({ x: q.x, y: q.y, r: 4, c: { live: r, n: 1, list: [] } });
    }
    for (const e of evItems) {
      const q = project(e.lat, e.lon, 0.0016); if (q.behind || q.vis <= 0) continue;
      cx.globalAlpha = Math.min(1, q.cosv / 0.12); cx.save(); cx.translate(q.x, q.y); cx.rotate(Math.PI / 4); cx.fillStyle = '#ffb000'; cx.strokeStyle = '#fff'; cx.lineWidth = 1.1; cx.fillRect(-2.8, -2.8, 5.6, 5.6); cx.strokeRect(-2.8, -2.8, 5.6, 5.6); cx.restore();
      scr.push({ x: q.x, y: q.y, r: 4, c: { ev: e, n: 1, list: [] } });
    }
    cx.globalAlpha = 1;
    if (current) {
      const q = project(current[2], current[3], 0.0015);
      if (!q.behind && q.vis > 0) {
        // sound waves rippling outward from the speaker while the station plays
        cx.lineWidth = 2;
        if (lv > 0 || performance.now() - pulseT < 3000) {
          const now = performance.now();
          for (let k = 0; k < 3; k++) {
            const t = ((((now - pulseT) / 1300 + k / 3) % 1) + 1) % 1;
            cx.strokeStyle = 'rgba(' + REDRGB + ',' + ((1 - t) * (0.3 + 0.6 * lv)) + ')';
            cx.beginPath(); cx.arc(q.x, q.y, 14 + t * (24 + 14 * lv), 0, 6.2832); cx.stroke();
          }
        }
        cx.save(); cx.translate(q.x, q.y);
        cx.shadowColor = 'rgba(0,0,0,.55)'; cx.shadowBlur = 6;
        cx.fillStyle = RED; cx.beginPath(); cx.arc(0, 0, 14, 0, 6.2832); cx.fill();
        cx.shadowBlur = 0; cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.stroke();
        // speaker glyph
        cx.fillStyle = '#fff'; cx.beginPath();
        cx.moveTo(-7, -3); cx.lineTo(-3, -3); cx.lineTo(2, -7); cx.lineTo(2, 7); cx.lineTo(-3, 3); cx.lineTo(-7, 3); cx.closePath(); cx.fill();
        // animated sound waves
        cx.strokeStyle = '#fff'; cx.lineCap = 'round'; cx.lineWidth = 1.7;
        for (let i = 0; i < 2; i++) {
          const rr = 4 + i * 3.6, tw = performance.now() / 1000;
          cx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin((tw * 2.4 - i * 0.25) * Math.PI));
          cx.beginPath(); cx.arc(2.5, 0, rr, -0.85, 0.85); cx.stroke();
        }
        cx.restore(); cx.globalAlpha = 1;
      }
    }
    updateReticle();
  }
  // the bullseye lock-on, the hover highlight and the click all use the same rule, so what it locks onto is what you get
  function pickAt(x, y, touch) { const d = pickNear(x, y, touch ? 34 : 20); return d ? d.c : null; }
  const gEl = $('globe'), tip = document.createElement('div'); tip.id = 'dtip'; tip.className = 'tip hidden'; document.body.appendChild(tip);
  gEl.addEventListener('pointermove', e => {
    if (centerMode) return;   // scope stays fixed at the centre on every device; the mouse just moves the Earth
    if (e.buttons) { tip.classList.add('hidden'); return; }
    const c = pickAt(e.clientX, e.clientY, e.pointerType === 'touch');
    if (c !== hover) { hover = c; dirty = true; gEl.style.cursor = c ? 'pointer' : ''; }
    if (c) { tip.innerHTML = c.live ? '<b>🔴 LIVE · ' + esc(c.live.title) + '</b><span>' + esc(c.live.channel + (c.live.place ? ' · ' + c.live.place : '')) + '</span>' : c.ev ? '<b>' + esc(c.ev.name) + '</b><span>' + esc([c.ev.venue, c.ev.city].filter(Boolean).join(' · ')) + '</span>' : '<b>' + (c.n > 1 ? c.n + ' stations' : esc(c.list[0][0]) + (c.list[0][15] ? ' · ' + esc(c.list[0][15]) : '')) + '</b><span>' + (c.n > 1 ? esc(c.list.slice(0, 3).map(s => s[0]).join(' · ')) + (c.n > 3 ? ' …' : '') : esc(c.list[0][12] || '')) + '</span>'; tip.style.left = Math.min(innerWidth - 300, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; tip.classList.remove('hidden'); } else tip.classList.add('hidden');
  });
  gEl.addEventListener('pointerleave', () => { if (centerMode) return; tip.classList.add('hidden'); hover = null; dirty = true; });
  let down = null;
  gEl.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; ptr = [e.clientX, e.clientY]; updateReticle(e.pointerType === 'touch' ? 34 : 20); });
  gEl.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) { const c = pickAt(e.clientX, e.clientY, e.pointerType === 'touch'); if (c) onCell(c); } down = null; });
  ctl.addEventListener('change', () => { dirty = true; });
  // bullseye: a free scope that follows your mouse and locks onto a dot when you are close; click to choose
  let ptr = null, lockedTo = null;
  function pickNear(x, y, rad) { let best = null, bd = rad; for (const d of scr) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } } return best; }
  function updateReticle(rad) {
    if (centerMode) { bz.style.transform = 'translate(' + (innerWidth / 2 - 56).toFixed(1) + 'px,' + (innerHeight / 2 - 56).toFixed(1) + 'px)'; bz.classList.toggle('lock', !!(autoPick && autoPick.d <= SNAP_R())); return; }
    if (!ptr) return;
    const d = pickNear(ptr[0], ptr[1], rad || 20), x = d ? d.x : ptr[0], y = d ? d.y : ptr[1];
    bz.style.transform = 'translate(' + (x - 56).toFixed(1) + 'px,' + (y - 56).toFixed(1) + 'px)'; bz.classList.toggle('lock', !!d);
  }
  gEl.addEventListener('pointermove', e => { ptr = [e.clientX, e.clientY]; if (!e.buttons) updateReticle(e.pointerType === 'touch' ? 34 : 20); });

  // ---------- Radio Garden style: scroll the globe and the dot under the centre scope is selected; let go and it settles onto it and plays ----------
  let centerMode = true, drag = false, dragMoved = false, snapping = false, autoPick = null, snapT = 0, lastPtr = null;
  const SNAP_R = () => innerWidth <= 820 ? 58 : 46, SEE_R = 150;
  function centerPick() {
    const x = innerWidth / 2, y = innerHeight / 2; let best = null, bd = SEE_R;
    for (const o of scr) { if (!o.c.list.length) continue; const d = Math.hypot(o.x - x, o.y - y) - o.r; if (d < bd) { bd = d; best = o; } }
    return best ? { c: best.c, d: Math.max(0, bd), x: best.x, y: best.y } : null;
  }
  function tipFor(c) { return '<b>' + (c.n > 1 ? c.n + ' stations' : esc(c.list[0][0]) + (c.list[0][15] ? ' · ' + esc(c.list[0][15]) : '')) + '</b><span>' + (c.n > 1 ? esc(c.list.slice(0, 3).map(s => s[0]).join(' · ')) + (c.n > 3 ? ' …' : '') : esc(lyricsOnly && lyricSet.has(c.list[0][13]) ? '♪ ' + lyricSet.get(c.list[0][13]) : (c.list[0][12] || ''))) + '</span>'; }
  let camSpeed = 0, spPos = null, spT = 0, tipKey = null, tipSince = 0;   // the centre tooltip stays up ~3 s, then goes (touch the scope to bring it back)
  function placeTip() {   // label sits centred ABOVE the scope so it never covers the thing you tap
    tip.style.maxWidth = Math.min(300, innerWidth - 24) + 'px';
    tip.style.left = (innerWidth / 2) + 'px'; tip.style.top = (innerHeight / 2 - 66) + 'px'; tip.style.transform = 'translate(-50%,-100%)'; tip.style.textAlign = 'center';
  }
  function trackCenter() {   // runs after every render: highlight what is under the scope
    if (!centerMode || snapping) return;
    { const cp = globe.camera().position, now = performance.now(); if (spPos) { const alt = globe.pointOfView().altitude, px = innerHeight / (0.93 * 100 * (1 + alt)); camSpeed = cp.distanceTo(spPos) * px / Math.max(0.001, (now - spT) / 1000); } spPos = cp.clone(); spT = now; }
    autoPick = centerPick();
    const h = autoPick ? autoPick.c : null;
    if (h !== hover) { hover = h; dirty = true; }
    if (autoPick && autoPick.d <= SNAP_R() && camSpeed < 260 && !(innerWidth <= 820 && !$('panel').classList.contains('hidden')) && ((autoPick.c !== tipKey && (tipKey = autoPick.c, tipSince = performance.now(), true)) || performance.now() - tipSince < 3000)) { tip.innerHTML = tipFor(autoPick.c); placeTip(); tip.classList.remove('hidden'); }
    else { tip.classList.add('hidden'); if (!autoPick || autoPick.d > SNAP_R()) tipKey = null; }
    updateReticle();
  }
  function settle() {
    if (locked) { dragMoved = false; return; }   // locked: no snapping onto a dot, no station change
    if (!dragMoved || drag || snapping || roloOn) return;
    autoPick = centerPick();
    if (!autoPick || autoPick.d > SNAP_R()) { dragMoved = false; return; }
    const c = autoPick.c, pov = globe.pointOfView(), s = c.list[0];
    snapping = true; dragMoved = false; ctl.enableDamping = false; try { ctl.update(); } catch (e) {}   // kill leftover momentum so the glide lands exactly on the dot
    tip.innerHTML = tipFor(c); placeTip(); tip.classList.remove('hidden'); tipKey = c; tipSince = performance.now();
    if (current !== s && !c.live && !c.ev) play(s, false);   // start buffering while it glides in
    const dl = ((((c.lng - pov.lng) % 360) + 540) % 360) - 180;
    globe.pointOfView({ lat: c.lat, lng: pov.lng + dl, altitude: pov.altitude }, 520);
    setTimeout(() => { if (DG) { const q = project(c.lat, c.lng, 0.0015); DG.snaps++; DG.snapErr = Math.round(Math.hypot(q.x - innerWidth / 2, q.y - innerHeight / 2)); } ctl.enableDamping = true; snapping = false; hover = c; dirty = true; updateReticle(); }, 560);
  }
  gEl.addEventListener('pointerdown', e => {
    if (Math.hypot(e.clientX - innerWidth / 2, e.clientY - innerHeight / 2) < 56) tipSince = performance.now();   // tapping the scope shows its label again for 3 s
    drag = true; dragMoved = false; lastPtr = [e.clientX, e.clientY]; gEl.classList.add('grabbing');
    if (snapping) { snapping = false; ctl.enableDamping = true; globe.pointOfView(globe.pointOfView(), 0); }   // grabbing the globe cancels the glide
  });
  // --- grab-the-point dragging: the spot of the Earth under your finger/cursor stays under it (like Radio Garden), with a smooth fling when you let go ---
  ctl.enableRotate = false;   // we rotate; OrbitControls keeps zoom / pinch
  ctl.minPolarAngle = 0.22; ctl.maxPolarAngle = Math.PI - 0.22;   // stop short of the poles, where north-up dragging would swirl the globe
  const GR = 100;
  // ---- #diag: open aviewfromspace.com/#diag on a phone to see a live self-test overlay (fps, touches, drag/fling/snap numbers, errors) ----
  const DG = /diag/.test(location.hash) ? { rot: 0, steps: 0, maxStep: 0, fling: 0, snaps: 0, snapErr: null, errs: [], fps: [], minFps: 999, lastRaf: 0, pinch: 0, maxPtr: 0, zoomMin: 99, zoomMax: 0 } : null;
  function rayHit(px, py) {
    const cam = globe.camera(), cp = cam.position, L = Math.hypot(cp.x, cp.y, cp.z);
    const f = [-cp.x / L, -cp.y / L, -cp.z / L];
    let r = [-f[2], 0, f[0]]; const rl = Math.hypot(r[0], r[1], r[2]) || 1; r = [r[0] / rl, r[1] / rl, r[2] / rl];   // right = f x (0,1,0)
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];                       // true up = r x f
    const th = Math.tan(cam.fov * Math.PI / 360), nx = (px / innerWidth * 2 - 1) * th * (innerWidth / innerHeight), ny = (1 - py / innerHeight * 2) * th;
    let d = [f[0] + nx * r[0] + ny * u[0], f[1] + nx * r[1] + ny * u[1], f[2] + nx * r[2] + ny * u[2]]; const dl = Math.hypot(d[0], d[1], d[2]); d = [d[0] / dl, d[1] / dl, d[2] / dl];
    const b = cp.x * d[0] + cp.y * d[1] + cp.z * d[2], disc = b * b - (L * L - GR * GR);
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc); if (t < 0) return null;
    const x = cp.x + d[0] * t, y = cp.y + d[1] * t, z = cp.z + d[2] * t; return [x / GR, y / GR, z / GR];
  }
  function spinCam(ax, ang) {   // rotate the camera about the globe centre (axis unit vector, angle rad)
    const p = globe.camera().position, c = Math.cos(ang), s = Math.sin(ang), k = ax[0] * p.x + ax[1] * p.y + ax[2] * p.z;
    const cx_ = ax[1] * p.z - ax[2] * p.y, cy_ = ax[2] * p.x - ax[0] * p.z, cz_ = ax[0] * p.y - ax[1] * p.x;
    p.set(p.x * c + cx_ * s + ax[0] * k * (1 - c), p.y * c + cy_ * s + ax[1] * k * (1 - c), p.z * c + cz_ * s + ax[2] * k * (1 - c));
    globe.camera().lookAt(0, 0, 0); ctl.update();
    if (DG) { DG.rot += ang; DG.steps++; DG.maxStep = Math.max(DG.maxStep, ang); }
  }
  let grab = null, gsamp = [], flingRaf = 0, gptrs = 0;
  const stopFling = () => { if (flingRaf) { cancelAnimationFrame(flingRaf); flingRaf = 0; } };
  gEl.addEventListener('pointerdown', e => {
    gptrs = e.isPrimary ? 1 : gptrs + 1; stopFling(); gsamp = [];
    if (gptrs > 1) { grab = null; return; }   // pinch: leave it to the zoom control
    ctl.autoRotate = false; autoRotate = false; $('rotate').style.opacity = .5;
    grab = rayHit(e.clientX, e.clientY) ? [e.clientX, e.clientY] : null;
  });
  addEventListener('pointermove', e => {
    if (!grab || !drag || gptrs > 1) return;
    const pp = grab; grab = [e.clientX, e.clientY];   // grab = previous pointer position (incremental: no catching-up jumps)
    const dpx = Math.hypot(e.clientX - pp[0], e.clientY - pp[1]); if (dpx < 0.3) { grab = pp; return; }
    const p0 = rayHit(pp[0], pp[1]), h = rayHit(e.clientX, e.clientY); if (!p0 || !h) return;
    const cam = globe.camera().position, Lc = Math.hypot(cam.x, cam.y, cam.z);
    { const c = (h[0] * cam.x + h[1] * cam.y + h[2] * cam.z) / Lc, c0 = GR / Lc; if ((c - c0) / (1 - c0) < 0.08) return; }   // right at the horizon: ignore (a hair of movement there would whip the globe round)
    const ax = [h[1] * p0[2] - h[2] * p0[1], h[2] * p0[0] - h[0] * p0[2], h[0] * p0[1] - h[1] * p0[0]], s = Math.hypot(ax[0], ax[1], ax[2]);
    let ang = Math.atan2(s, h[0] * p0[0] + h[1] * p0[1] + h[2] * p0[2]);
    if (s < 1e-9 || ang < 1e-7) return;
    const alt = globe.pointOfView().altitude, radPerPx = (0.93 * (1 + alt)) / innerHeight;   // rotation per pixel at the globe's centre
    ang = Math.min(ang, dpx * radPerPx * 1.35);   // never turn faster than the finger moves at the centre (+35%): steady at the edge
    const n = [ax[0] / s, ax[1] / s, ax[2] / s]; spinCam(n, ang);
    const t = performance.now(); gsamp.push({ t, n, ang }); while (gsamp.length && t - gsamp[0].t > 110) gsamp.shift();
  }, true);
  const grabEnd = () => {
    gptrs = Math.max(0, gptrs - 1); if (gptrs) return; grab = null;
    const t = performance.now(), sm = gsamp.filter(q => t - q.t < 110); gsamp = [];
    if (sm.length < 2) return;
    let wx = 0, wy = 0, wz = 0; for (const q of sm) { wx += q.n[0] * q.ang; wy += q.n[1] * q.ang; wz += q.n[2] * q.ang; }
    const dt = Math.max(30, sm[sm.length - 1].t - sm[0].t + 16) / 1000; let om = [wx / dt, wy / dt, wz / dt];
    const alt = globe.pointOfView().altitude, pxPerRad = GR * innerHeight / (0.93 * GR * (1 + alt)), maxW = 800 / pxPerRad;   // cap the fling speed (a steady glide, never a runaway spin)
    let w = Math.hypot(om[0], om[1], om[2]); if (w > maxW) { om = om.map(v => v * maxW / w); w = maxW; }
    if (DG) DG.fling = Math.round(w * pxPerRad);
    if (w * pxPerRad < 140) return;   // small drags just stop where you let go
    let last = performance.now(), cur = w; const dir = om.map(v => v / w);
    const step = now => {
      const dt2 = Math.min(0.05, (now - last) / 1000); last = now;
      cur *= Math.exp(-dt2 / 0.25);   // quick, controlled glide: velocity halves about every 0.2 s
      spinCam(dir, cur * dt2);
      if (cur * pxPerRad > 6) flingRaf = requestAnimationFrame(step); else flingRaf = 0;
    };
    flingRaf = requestAnimationFrame(step);
  };
  addEventListener('pointerup', grabEnd, true); addEventListener('pointercancel', grabEnd, true);
  // dots in lock-step with the globe: paint them in the same frame, straight after the renderer draws (no lag / lingering when it spins)
  { const rr = globe.renderer(), orig = rr.render; rr.render = function () { const out = orig.apply(this, arguments); try { frame(); if (centerMode) trackCenter(); } catch (e) {} return out; }; }
  setInterval(() => { if (performance.now() - drawnAt > 600) { try { frame(); } catch (e) {} } }, 400);   // safety net if the renderer ever stops

  addEventListener('pointermove', e => {
    if (drag && !dragMoved && lastPtr && Math.hypot(e.clientX - lastPtr[0], e.clientY - lastPtr[1]) > 5) { dragMoved = true; tip.classList.add('hidden'); }
  }, true);
  const dragEnd = e => { gEl.classList.remove('grabbing'); if (!drag) return; drag = false; lastCamPos = null; if (e && e.clientX !== undefined) lastPtr = [e.clientX, e.clientY]; clearTimeout(snapT); snapT = setTimeout(settle, 250); };
  addEventListener('pointerup', dragEnd, true); addEventListener('pointercancel', dragEnd, true); addEventListener('blur', () => dragEnd());
  let lastCamPos = null, lastCamT = 0;   // "still moving?" = the surface slides faster than ~10 px/s (ignores the long slow damping tail, at any frame rate)
  ctl.addEventListener('change', () => {
    if (drag || !dragMoved) return;
    const cp = globe.camera().position, now = performance.now(), alt = globe.pointOfView().altitude, pxPerUnit = innerHeight / (0.93 * 100 * (1 + alt));
    const speed = lastCamPos ? cp.distanceTo(lastCamPos) * pxPerUnit / Math.max(0.001, (now - lastCamT) / 1000) : 1e9;
    lastCamPos = cp.clone(); lastCamT = now;
    if (speed > 10) { clearTimeout(snapT); snapT = setTimeout(settle, 250); }
  });

  // ---------- Lyrics satellite: floats above the Earth while a song with lyrics is playing; tap it for the words ----------
  const lyr = { key: '', data: null, cache: new Map(), tok: 0, t0: null, adj: 0, lines: [], idx: -1, manual: 0 };
  function lyrReset() { lyr.key = ''; lyr.data = null; lyr.t0 = null; lyr.adj = 0; lyr.tok++; }   // new station: the next title we see is a song already in progress
  const sat = document.createElement('div'); sat.id = 'sat'; sat.title = 'Lyrics'; sat.setAttribute('role', 'button'); sat.setAttribute('aria-label', 'Show lyrics');
  sat.innerHTML = '<svg viewBox="0 0 64 44" width="54" height="37" aria-hidden="true"><g stroke="#0b1020" stroke-width="1.2" stroke-linejoin="round"><rect x="2" y="13" width="19" height="14" rx="1.5" fill="#4fa3ff"/><rect x="43" y="13" width="19" height="14" rx="1.5" fill="#4fa3ff"/><path d="M2 20h19M43 20h19M8 13v14M14 13v14M49 13v14M55 13v14" stroke="#cfe6ff" stroke-width=".8" fill="none"/><rect x="21" y="16" width="22" height="8" fill="#9aa7b8"/><rect x="25" y="9" width="14" height="22" rx="3" fill="#e8eef7"/><circle cx="32" cy="20" r="4" fill="var(--acc,#39ff14)"/></g><path d="M32 9V3" stroke="#e8eef7" stroke-width="1.5"/><circle cx="32" cy="2.5" r="2" fill="var(--acc,#39ff14)"/><path d="M26 40q6-5 12 0" stroke="var(--acc,#39ff14)" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg><span>LYRICS</span>';
  document.body.appendChild(sat);
  const lyrBox = document.createElement('div'); lyrBox.id = 'lyrics'; lyrBox.className = 'hidden';
  lyrBox.innerHTML = '<div class="lh"><div><div id="lyT"></div><div id="lyA"></div></div><button id="lyX" aria-label="Close lyrics">✕</button></div><div id="lyB"></div><div class="lf"><span id="lyH"></span><span class="lyn"><button id="lyM" title="Lyrics too early? Nudge later">−0.5s</button><button id="lyP" title="Lyrics too late? Nudge earlier">+0.5s</button></span></div>';
  document.body.appendChild(lyrBox);
  function parseSong(t) {
    const s = String(t || '').replace(/\s*[\(\[][^)\]]*(remaster|version|edit|mix|live|feat|ft\.?|official|video|radio|explicit|lyrics?)[^)\]]*[\)\]]/ig, '').replace(/\s+/g, ' ').trim();
    const m = s.split(/\s[-–—]\s/); return m.length >= 2 ? { artist: m[0].trim(), track: m.slice(1).join(' - ').trim() } : { artist: '', track: s };
  }
  // AI lyrics (made on the PC for songs LRCLIB lacks): index of finished songs, files named by a hash of the folded title
  let aiIdx = {}; const aiKeyOf = async t => { const f = String(t || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(f)); return [...new Uint8Array(b)].slice(0, 6).map(x => x.toString(16).padStart(2, '0')).join(''); };
  async function loadAiIdx() { try { aiIdx = (await (await fetch('data/ai_lyrics_index.json?t=' + Date.now())).json()).items || {}; } catch (e) {} }
  loadAiIdx(); setInterval(loadAiIdx, 120000);
  async function aiLyrics(title) {
    try {
      const k = await aiKeyOf(title); if (!aiIdx[k]) return null;
      const d = await (await fetch('data/ai_lyrics/' + k + '.json')).json(), { artist, track } = parseSong(title);
      return d.lines && d.lines.length ? { t: track || title, a: artist, text: d.lines.map(x => x.l).join('\n'), sync: d.lines.map(x => ({ t: x.t, l: x.l })), dur: 0, ai: true } : null;
    } catch (e) { return null; }
  }
  function parseLRC(s) {   // "[01:23.45] words" -> [{t: seconds, l: 'words'}]
    if (!s) return null; const out = [];
    for (const row of s.split('\n')) { const m = /^\s*((?:\[\d+:\d+(?:\.\d+)?\]\s*)+)(.*)$/.exec(row); if (!m) continue; for (const ts of m[1].match(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) { const mm = /\[(\d+):(\d+(?:\.\d+)?)\]/.exec(ts); out.push({ t: +mm[1] * 60 + +mm[2], l: m[2].trim() }); } }
    out.sort((x, y) => x.t - y.t); return out.length > 4 ? out : null;
  }
  async function fetchLyrics(t) {
    const title = t, { artist, track } = parseSong(t); if (!track || track.length < 2) return null;
    if (/^\s*billy legal\b/i.test(title)) return null;   // Billy's own songs: no verified lyrics source, never guess
    const J = async u => { const r = await fetch(u); return r.ok ? r.json() : null; }, enc = encodeURIComponent;
    const good = d => d && (d.plainLyrics || '').trim().length > 40 && !d.instrumental;
    try {
      const pack = d => ({ t: d.trackName, a: d.artistName, text: d.plainLyrics.trim(), sync: parseLRC(d.syncedLyrics), dur: d.duration || 0 });
      if (artist) { const d = await J('https://lrclib.net/api/get?artist_name=' + enc(artist) + '&track_name=' + enc(track)); if (good(d)) return pack(d); }
      const res = await J('https://lrclib.net/api/search?q=' + enc((artist + ' ' + track).trim())) || [];
      const ft = fold(track), fa = fold(artist);
      const hit = res.find(d => good(d) && (fold(d.trackName).includes(ft) || ft.includes(fold(d.trackName))) && (!fa || fold(d.artistName).includes(fa.split(' ')[0]) || fa.includes(fold(d.artistName).split(' ')[0])));
      return hit ? pack(hit) : await aiLyrics(title);
    } catch (e) { return await aiLyrics(title); }
  }
  async function lyricsFor(title) {
    title = (title || '').trim(); if (title === lyr.key) return;
    const joined = !lyr.key;   // first title after tuning in = joined mid-song (position unknown); a later change = a song just started
    lyr.key = title; lyr.data = null; lyr.idx = -1; lyr.how = '';
    if (!joined) { lyr.t0 = ((lyr.prevSeen || performance.now()) + performance.now()) / 2; lyr.how = 'live'; }   // we watched the title change: it started between our last two looks
    else { lyr.t0 = null; lyr.adj = 0; const k = current && lyricSince.get(current[13]), same = (x, y) => { x = fold(x); y = fold(y); return x === y || x.includes(y) || y.includes(x); };
      if (k && k.since && k.err != null && k.err <= 90 && same(k.title, title)) { lyr.t0 = performance.now() - (Date.now() / 1000 - k.since) * 1000; lyr.how = k.err <= 25 ? 'station' : 'approx'; lyr.err = k.err; } }   // joined mid-song: the collector saw when it started
    const my = ++lyr.tok; lyr.looking = !!title; if (!title) { lyrBox.classList.add('hidden'); return; }
    if (lyr.cache.has(title)) { lyr.data = lyr.cache.get(title); lyr.looking = false; return; }
    const d = await fetchLyrics(title); lyr.cache.set(title, d); if (lyr.cache.size > 80) lyr.cache.delete(lyr.cache.keys().next().value);
    if (my === lyr.tok) { lyr.data = d; lyr.looking = false; }
  }
  function lyrPos() {   // seconds into the song, or null if we cannot tell yet
    if (ytOn && yt && yt.getCurrentTime) { try { return yt.getCurrentTime() + lyr.adj; } catch (e) {} }
    if (lyr.t0 == null) return null;
    let lag = 0; try { if (audio.buffered.length) lag = Math.max(0, Math.min(20, audio.buffered.end(audio.buffered.length - 1) - audio.currentTime)); } catch (e) {}   // the browser plays a little behind the live edge
    return (performance.now() - lyr.t0) / 1000 - lag + lyr.adj;
  }
  function paintLyrics() {
    const d = lyr.data; $('lyT').textContent = d.t; $('lyA').textContent = d.a + (d.ai ? (d.a ? ' · ' : '') + '🤖 AI-transcribed, may contain mistakes' : ''); lyr.idx = -1;
    if (d.sync) { $('lyB').innerHTML = d.sync.map((r, i) => '<div class="ll" data-i="' + i + '">' + (r.l ? esc(r.l) : '♪') + '</div>').join(''); lyrBox.classList.add('sync'); }
    else { $('lyB').textContent = d.text; lyrBox.classList.remove('sync'); }
    $('lyB').scrollTop = 0;
  }
  sat.addEventListener('click', () => {
    if (!lyr.data) return; if (lyrBox.classList.contains('hidden')) { paintLyrics(); lyrBox.classList.remove('hidden'); npPoll(); } else lyrBox.classList.add('hidden');
  });
  $('lyB').addEventListener('click', e => {   // tap the line you are hearing -> lock the timing to it
    const ln = e.target.closest('.ll'); if (!ln || !lyr.data || !lyr.data.sync) return; const t = lyr.data.sync[+ln.dataset.i].t;
    if (ytOn && yt && yt.getCurrentTime) { try { lyr.adj = t - yt.getCurrentTime(); } catch (err) {} } else { lyr.t0 = performance.now() - t * 1000; lyr.adj = 0; }
    lyr.manual = performance.now();
  });
  $('lyM').addEventListener('click', () => { lyr.adj -= 0.5; }); $('lyP').addEventListener('click', () => { lyr.adj += 0.5; });
  $('lyB').addEventListener('wheel', () => { lyr.manual = performance.now(); }, { passive: true }); $('lyB').addEventListener('touchmove', () => { lyr.manual = performance.now(); }, { passive: true });
  setInterval(() => { if (!lyrBox.classList.contains('hidden') && !document.hidden) { try { npPoll(); } catch (e) {} } }, 5000);   // while the words are open, keep checking for the next song quickly
  { const follow = () => {
      requestAnimationFrame(follow);
      if (lyrBox.classList.contains('hidden')) return;
      if (!lyr.data) { $('lyT').textContent = lyr.looking ? 'Finding the lyrics…' : 'No lyrics for this song'; $('lyA').textContent = ''; $('lyH').textContent = ''; lyrBox.dataset.k = ''; return; }
      if (lyrBox.dataset.k !== lyr.key) { lyrBox.dataset.k = lyr.key; paintLyrics(); }   // the song changed while the window was open
      const d = lyr.data, hint = $('lyH');
      if (!d.sync) { hint.textContent = 'No timing for this song · words only'; return; }
      const p = lyrPos();
      hint.classList.toggle('need', p == null);
      if (p == null) { hint.textContent = '👆 Tap the line you hear, or it syncs by itself when the next song starts'; return; }
      hint.textContent = (lyr.how === 'station' ? 'Following · timed from the station' : lyr.how === 'approx' ? 'Following (about ±' + Math.round(lyr.err) + 's)' : 'Following the song') + ' · tap a line to re-sync' + (lyr.adj ? ' · ' + (lyr.adj > 0 ? '+' : '') + lyr.adj.toFixed(1) + 's' : '');
      let i = -1; for (let k = 0; k < d.sync.length; k++) { if (d.sync[k].t <= p + 0.15) i = k; else break; }
      if (i !== lyr.idx) {
        const rows = $('lyB').children; if (rows[lyr.idx]) rows[lyr.idx].classList.remove('on'); lyr.idx = i;
        if (rows[i]) { rows[i].classList.add('on'); if (performance.now() - lyr.manual > 4000) { const b = $('lyB'), r = rows[i]; b.scrollTo({ top: r.offsetTop - b.clientHeight / 2 + r.offsetHeight / 2, behavior: 'smooth' }); } }
      }
    };
    requestAnimationFrame(follow); }
  lyrBox.querySelector('#lyX').addEventListener('click', () => lyrBox.classList.add('hidden'));
  addEventListener('keydown', e => { if (e.key === 'Escape') lyrBox.classList.add('hidden'); });
  { let t0 = performance.now();
    const satTick = now => {
      requestAnimationFrame(satTick);
      const show = !!(lyr.data && isPlaying() && !roloOn);
      if (!show) { sat.classList.remove('on'); if (!lyrBox.classList.contains('hidden') && !lyr.data && !lyr.looking) lyrBox.classList.add('hidden'); return; }
      sat.classList.add('on');
      const cam = globe.camera().position, L = Math.hypot(cam.x, cam.y, cam.z), Rs = Math.tan(Math.asin(Math.min(0.999, GR / L))) / Math.tan(globe.camera().fov * Math.PI / 360) * (innerHeight / 2);
      const t = (now - t0) / 1000, topLimit = (document.getElementById('searchwrap') ? document.getElementById('searchwrap').getBoundingClientRect().bottom : 90) + 26;
      const x = innerWidth / 2 - Math.min(Rs * 0.62, innerWidth * 0.3) + Math.sin(t * 0.6) * 9, y = Math.max(topLimit, innerHeight / 2 - Rs * 1.1) + Math.sin(t * 0.9) * 6;
      sat.style.transform = 'translate(' + (x - 27).toFixed(1) + 'px,' + (y - 18).toFixed(1) + 'px) rotate(' + (Math.sin(t * 0.5) * 6).toFixed(1) + 'deg)';
    };
    requestAnimationFrame(satTick); }

  // ---------- Lock: the MUSIC is locked (no station change from Random, clicks, searches, snapping, Social Live...); spin and zoom the globe freely ----------
  let locked = false;
  const lockMsg = () => toast('🔒 Music is locked · tap 🔒 to unlock');
  function setLock(on) {
    locked = on; document.body.classList.toggle('locked', on); const b = $('lockBtn'); b.textContent = on ? '🔒' : '🔓'; b.classList.toggle('on', on); b.title = on ? 'Music locked: tap to unlock' : 'Lock the music (you can still spin the globe)';
    toast(on ? '🔒 Music locked' + (current ? ' on ' + current[0] : '') + ' · you can still spin and zoom' : '🔓 Unlocked');
  }
  // the lock button floats just above the Save song button, nearly see-through
  const placeLock = () => { const sv = $('saveSong'), b = $('lockBtn'); if (!sv || !b) return; const r = sv.getBoundingClientRect(); if (!r.width) return; b.style.left = Math.round(r.left + r.width / 2 - b.offsetWidth / 2) + 'px'; b.style.top = Math.round(r.top - b.offsetHeight - 6) + 'px'; };
  { const pl = $('player'); try { new ResizeObserver(placeLock).observe(pl); } catch (e) {} addEventListener('resize', placeLock); setInterval(placeLock, 1000); placeLock(); }
  $('lockBtn').onclick = () => setLock(!locked);

  // ---------- Live now: DJ sets streaming right now + tonight's events ----------
  let djOpen = false, liveData = { items: [] }, socialData = { items: [] }, djIndex = { djs: [] }, djProf = { djs: [] }, liveQ = '', evData = { items: [] }, liveItems = [], evItems = [], liveTab = 'yt', liveOpen = false, watching = null, liveFam = '';
  async function loadLive() {
    try { liveData = await (await fetch('data/live.json?t=' + Date.now())).json(); } catch (e) {}
    try { evData = await (await fetch('data/events.json?t=' + Date.now())).json(); } catch (e) {}
    try { socialData = await (await fetch('data/social.json?t=' + Date.now())).json(); } catch (e) {}
    try { djIndex = await (await fetch('data/dj_index.json?t=' + Date.now())).json(); } catch (e) {}
    try { djProf = await (await fetch('data/dj_profiles.json?t=' + Date.now())).json(); } catch (e) {}
    liveItems = (liveData.items || []).filter(r => r.lat != null && (!liveFam || (r.fam || []).includes(liveFam))).map(r => Object.assign({ lng: r.lon }, r)); evItems = evData.items || [];
    const n = ytLive().length + (socialData.items || []).filter(isMusic).length;   // YouTube + Twitch + Kick + TikTok (roster) $('livecount').textContent = n || ''; $('livebtn').title = 'Social live right now: ' + n + ' · updated ' + (liveData.updated ? ago(liveData.updated) : '—'); dirty = true;
    try { document.querySelectorAll('.chip.dj small').forEach(s => { s.textContent = djMixCount(); }); } catch (e) {}
    if (djOpen) { const st = $('plist').scrollTop; renderDJMixes(); $('plist').scrollTop = st; }
    if (liveOpen) { const st = $('plist').scrollTop; renderLive(); $('plist').scrollTop = st; }
  }
  // strictly music: live DJ sets, concerts, performances (same rules as tools/musicfilter.py); rosters of known DJs are always trusted
  const MUSIC_REJECT = new RegExp("\\b(news|court|judge|judgment|verdict|hearing|trial|lawyer|parliament|assembly|minister|politic\\w*|election|protest|rally|debate|speech|sermon|bayan|tilawat|quran|namaz|azan|aarti|bhajan|kirtan|satsang|katha|puja|pooja|prayers?|pray|church|worship|rosary|bible|scripture|jesus|christ|allah|darbar|naat|nasheed|podcast|talk ?show|interview|reactions?|react|vlog|prank|gaming|gameplay|minecraft|fortnite|valorant|just chatting|chatting|q&a|lesson|tutorial|lecture|study|asmr|cooking|shopping|auction|astrology|horoscope|trading|forex|crypto|bitcoin|casino|slots|betting|cricket|football|soccer|nba|nfl|ipl|psl|live tv|tv live|channel live|webcam|cctv|traffic|weather|re-?runs?|replay|wiederholung\\w*|rediffusion|repetici[o\u00f3]n|rebroadcast|archive|repeat|premiere|vod|recorded|highlights|24 ?/ ?7|24x7|non[- ]?stop|loops?|lofi|lo-fi|playlist|giveaway|drama|serial|episode|briefing|statement|announcement|emergency|impeachment|senate|senators|congress|president|nifty|sensex|bazaar|stock market|share market|volleyball|wrestling|wwe|tag team|match|score|league|nhl|mlb|ufc|boxing|racing|flags?|battle|demon hunters|free fire|pubg|roblox|gta|custom room|tv show|show live|bollywood|filmi|mashup|jukebox|evergreen|ost|sleep|relax\\w*|calm|focus|bgm|ambience|rain|thunder|caf[e\u00e9]|coffee|lullaby|christmas|carols|halloween|kids|hymns?|praise|healing|meditation|chants?|temple|mandir|devi|durga|navratri|bhakti|yatra|puja|ganesh|krishna|shiva|hanuman|ramayan|gurbani|shabad|waheguru|bhojpuri|punjabi couple|wedding|shaadi|pawan singh|khesari|slotz|slot|restaurant|car shop|vacation|cocomelon|sing along|nursery|street life|walking|real talk)\\b", 'i'), MUSIC_OK = new RegExp("\\b(djs?|dj sets?|live sets?|b2b|b3b|boiler room|cercle|concerts?|live performance|performing live|live at|festival|rave|club night|gigs?|turntables?|vinyl|live mix|mixing|beat ?making|live band|unplugged|recital|symphony|orchestra|philharmonic|live looping|live session|studio session|vinyl session)\\b", 'i');
  const isMusic = r => { if (r.dj) return true; const blob = [r.title, r.channel].join(' '); if (MUSIC_REJECT.test(blob)) return false; return /^(djs?|live djs?|dj sets?|live music|live performances?)$/i.test(String(r.cat || '').trim()) || MUSIC_OK.test(blob); };
  const ytLive = () => (liveData.items || []).filter(r => r.kind === 'live' && !r.ai && isMusic(r));   // only streams that are LIVE right now (no 24/7 loops, AI, scheduled or ended)
  function loadLiveFilter() { liveItems = (liveData.items || []).filter(r => r.lat != null && (!liveFam || (r.fam || []).includes(liveFam))).map(r => Object.assign({ lng: r.lon }, r)); dirty = true; }
  setInterval(loadLive, 30 * 1000);
  function ago(ts) { const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; }
  function openLive(tab) { if (tab) liveTab = tab; liveOpen = true; renderLive(); $('panel').classList.remove('hidden'); }
  function famOfFilter() { return filter.kind === 'family' ? filter.fam : filter.kind === 'genre' ? G[filter.id].family : ''; }   // (no longer drives the Live list)
  const SRC = { yt: ['YouTube', 'https://www.youtube.com/live'], tw: ['Twitch', 'https://www.twitch.tv/directory/category/music'], kick: ['Kick', 'https://kick.com/categories/music'], tt: ['TikTok', 'https://www.tiktok.com/live'], ig: ['Instagram', 'https://www.instagram.com/'] };
  const TAB2SRC = { tw: 'twitch', kick: 'kick', tt: 'tiktok', ig: 'instagram' };
  const profileURL = (src, id) => { id = String(id).replace(/^@/, ''); return { twitch: 'https://www.twitch.tv/', kick: 'https://kick.com/', tiktok: 'https://www.tiktok.com/@', instagram: 'https://www.instagram.com/', youtube: 'https://www.youtube.com/@', soundcloud: 'https://soundcloud.com/', facebook: 'https://www.facebook.com/' }[src] + encodeURIComponent(id) + (src === 'tiktok' ? '/live' : ''); };
  const myDJs = () => { try { return JSON.parse(localStorage.getItem('rg-mydjs') || '[]'); } catch (e) { return []; } };
  const allDJs = () => (djIndex.djs || []).map(d => ({ src: d.src, id: d.id, name: d.name })).concat(myDJs().map(d => ({ src: d.src, id: d.id, name: d.name, mine: 1 })));
  const socOf = k => (socialData.items || []).filter(r => r.src === k && isMusic(r)).sort((x, y) => (y.viewers || 0) - (x.viewers || 0));
  const liveOfDJ = d => (socialData.items || []).find(r => r.src === d.src && String(r.id).toLowerCase() === String(d.id).replace(/^@/, '').toLowerCase());
  const matchQ = (q, ...parts) => { const h = fold(parts.filter(Boolean).join(' ')); return fold(q).split(' ').filter(Boolean).every(t => h.includes(t)); };
  // switching platform tabs tunes straight into a random live stream of THAT platform (and stops the previous one)
  function autoWatch(tab) {
    if (locked) { renderLive(); return; }
    const pool = (tab === 'tw' ? socOf('twitch') : tab === 'kick' ? socOf('kick') : tab === 'yt' ? ytLive().filter(r => !liveFam || (r.fam || []).includes(liveFam)).sort((x, y) => (y.views || 0) - (x.views || 0)) : []).slice(0, 30);
    const busy = pool.filter(r => (r.viewers || r.views || 0) >= 3); if (busy.length >= 5) { pool.length = 0; pool.push(...busy); }   // prefer streams people are actually watching
    const cur = watching && (watching.src || 'youtube') + ':' + watching.id;
    const opts = pool.filter(r => (r.src || 'youtube') + ':' + r.id !== cur), pick = (opts.length ? opts : pool)[(Math.random() * (opts.length || pool.length)) | 0];
    if (pick) { liveWatch(Object.assign({ kind: 'live' }, pick)); return; }
    watching = null; renderLive();
  }
  const PLOGO = {
    yt: '<svg viewBox="0 0 28 20" width="30" height="21"><rect width="28" height="20" rx="6" fill="#f00"/><path d="M11 5.5v9l8-4.5z" fill="#fff"/></svg>',
    tw: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M3 2h19v13l-5 5h-4l-3 3v-3H3z" fill="#9146ff"/><rect x="11" y="7" width="2.2" height="6" fill="#fff"/><rect x="16" y="7" width="2.2" height="6" fill="#fff"/></svg>',
    kick: '<svg viewBox="0 0 24 24" width="24" height="24"><rect width="24" height="24" rx="4" fill="#53fc18"/><path d="M6 4.5h3.6v5l4.2-5h4.4l-5.3 6.2 5.6 8.8h-4.3l-3.6-5.7-1 1.2v4.5H6z" fill="#0b0e0f"/></svg>'
  };
  function renderLive() {
    const yt = ytLive(), tw = socOf('twitch'), kk = socOf('kick'), tt = socOf('tiktok');
    const famCount = {}; for (const r of yt) for (const f of (r.fam || [])) famCount[f] = (famCount[f] || 0) + 1;
    const tot = yt.length + tw.length + kk.length + tt.length;
    $('ptitle').innerHTML = '🔴 Social Live' + (PLOGO[liveTab] ? ' <span class="onair" title="On air: ' + SRC[liveTab][0] + '">' + PLOGO[liveTab] + '<i>LIVE</i></span>' : ''); $('psub').textContent = tot + ' live right now · updated ' + (liveData.updated ? ago(Math.max(liveData.updated, socialData.updated || 0)) : '—');
    $('pdetail').classList.remove('hidden');
    const tab = (k, l, n) => '<button data-lt="' + k + '" class="' + (liveTab === k ? 'on' : '') + '">' + l + '<b>' + n + '</b></button>';
    $('pdetail').innerHTML = '<div class="ltabs">' + tab('yt', 'YouTube', yt.length) + tab('tw', 'Twitch', tw.length) + tab('kick', 'Kick', kk.length) + tab('tt', 'TikTok', tt.length || '↗') + tab('ig', 'Insta', '↗') + '</div>' +
      '<input id="lsq" class="lfsel" type="search" placeholder="Search ' + SRC[liveTab][0] + ' DJs…" autocomplete="off" value="' + esc(liveQ) + '">' +
      (liveTab === 'yt' ? '<select id="lfsel" class="lfsel"><option value="">All genres</option>' + Object.entries(famCount).sort((a, b) => b[1] - a[1]).map(([f, n]) => '<option value="' + esc(f) + '"' + (liveFam === f ? ' selected' : '') + '>' + esc(f) + ' (' + n + ')</option>').join('') + '</select>' : '') +
      '<div id="livewatch">' + (watching ? watchHTML(watching) : '') + '</div>';
    fillLive();
  }
  function fillLive() {   // each platform is its own category: the search box here only searches the tab you are on
    const inFam = r => !liveFam || (r.fam || []).includes(liveFam), q = liveQ.trim();
    const rowOf = r => {
      const src = r.src || 'youtube', th = src === 'youtube' ? 'https://i.ytimg.com/vi/' + esc(r.id) + '/mqdefault.jpg' : esc(r.thumb || '');
      const m = [r.dj || r.channel, (src === 'youtube' ? r.views : r.viewers) ? (src === 'youtube' ? r.views : r.viewers).toLocaleString() + ' watching' : '', src === 'youtube' ? r.place : [r.cat, r.lang].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
      return '<div class="row lrow" data-v="' + esc(src + ':' + r.id) + '"><img class="lth" loading="lazy" src="' + th + '" onerror="this.style.visibility=\'hidden\'"><div class="t"><div class="n">' + esc(r.title) + '</div><div class="m">' + esc(m) + '</div></div></div>';
    };
    const djRow = d => '<div class="row lrow" data-k="' + esc(d.src + ':' + d.id) + '"><div class="ph tile" style="background:#2b4a63">' + esc((d.name || '?').slice(0, 1).toUpperCase()) + '</div><div class="t"><div class="n">' + esc(d.name) + (d.mine ? ' ★' : '') + '</div><div class="m">' + esc(d.src === 'instagram' ? 'Instagram · open profile ↗' : d.src[0].toUpperCase() + d.src.slice(1) + ' · offline · open profile ↗') + '</div></div></div>';
    const empty = m => '<div class="lempty">' + m + '</div>';
    const addForm = name => '<form id="addDJ" class="adddj"><b>＋ Add a ' + name + ' DJ</b><input name="n" placeholder="DJ name" required><input name="h" placeholder="@handle" required><button>Add</button></form>';
    let rows = '';
    if (liveTab === 'yt') {
      const list = ytLive().filter(inFam).filter(r => !q || matchQ(q, r.title, r.dj, r.channel, r.place)).sort((x, y) => (y.views || 0) - (x.views || 0));
      rows = list.length ? list.slice(0, 150).map(rowOf).join('') : empty('Nobody ' + (liveFam ? 'in this genre ' : '') + (q ? 'matching “' + esc(q) + '” ' : '') + 'is live here right now.');
    } else {
      const src = TAB2SRC[liveTab], live = socOf(src).filter(r => !q || matchQ(q, r.title, r.dj, r.channel, r.id)), liveIds = new Set(socOf(src).map(r => String(r.id).toLowerCase()));
      const known = allDJs().filter(d => d.src === src && !liveIds.has(String(d.id).toLowerCase()) && (!q || matchQ(q, d.name, d.id)));
      rows = (live.length ? '<div class="shead">🔴 Live now · ' + live.length + '</div>' + live.slice(0, 150).map(rowOf).join('') : '') +
        (known.length ? '<div class="shead">DJs on ' + SRC[liveTab][0] + ' · ' + known.length + '</div>' + known.slice(0, 120).map(djRow).join('') : '');
      if (!rows) rows = empty(src === 'instagram' || src === 'tiktok' ? '<b>' + SRC[liveTab][0] + '</b> doesn’t publish a list of who is live, so DJs are added by name (below). TikTok DJs you add are checked for LIVE every minute.' : (q ? 'No ' + SRC[liveTab][0] + ' DJs match “' + esc(q) + '”.' : 'Nobody is live here right now.'));
      if (src === 'tiktok' || src === 'instagram') rows += '<div class="lempty"><a class="lgo" href="' + SRC[liveTab][1] + '" target="_blank" rel="noopener">Open ' + SRC[liveTab][0] + (src === 'tiktok' ? ' LIVE ↗' : ' ↗') + '</a></div>';
      rows += addForm(SRC[liveTab][0]);
    }
    $('plist').innerHTML = rows; panelList = [];
  }
  const watchHTML = r => {
    const src = r.src || 'youtube', host = location.hostname || 'localhost';
    const url = src === 'twitch' ? 'https://player.twitch.tv/?channel=' + encodeURIComponent(r.id) + '&parent=' + encodeURIComponent(host) + '&autoplay=true'
      : src === 'kick' ? 'https://player.kick.com/' + encodeURIComponent(r.id) + '?autoplay=true'
      : 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(r.id) + '?autoplay=1&rel=0&modestbranding=1';
    const page = src === 'twitch' ? 'https://www.twitch.tv/' + encodeURIComponent(r.id) : src === 'kick' ? 'https://kick.com/' + encodeURIComponent(r.id) : 'https://www.youtube.com/watch?v=' + encodeURIComponent(r.id);
    return '<div class="lw"><iframe src="' + url + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><div class="lwt"><span>' + esc(r.title) + '</span><a class="lgo" href="' + page + '" target="_blank" rel="noopener" title="Open on ' + esc({ twitch: 'Twitch', kick: 'Kick' }[src] || 'YouTube') + '">↗</a><button id="lwstop" title="Stop watching">✕</button></div></div>';
  };
  function stopWatch() { if (!watching) return; watching = null; const lw = $('livewatch'); if (lw) lw.innerHTML = ''; }
  function liveWatch(r) {
    if (locked) { lockMsg(); return; }
    audio.pause(); if (hls) { hls.destroy(); hls = null; } ytStop(); $('pplay').textContent = '▶';
    watching = r; if (djOpen) renderDJMixes(); else openLive(liveTab);
    if (r.lat != null) { ctl.autoRotate = false; autoRotate = false; globe.pointOfView({ lat: r.lat, lng: r.lon, altitude: 0.5 }, 1200); }
  }
  $('pdetail').addEventListener('click', e => {
    const t = e.target.closest('[data-lt]'); if (t) { liveTab = t.dataset.lt; liveQ = ''; autoWatch(liveTab); return; }
    if (e.target.closest('#lwstop')) { watching = null; renderLive(); }
  });
  $('pdetail').addEventListener('change', e => { if (e.target.id === 'lfsel') { liveFam = e.target.value; loadLiveFilter(); renderLive(); } });
  $('pdetail').addEventListener('input', e => { if (e.target.id === 'lsq') { liveQ = e.target.value; fillLive(); } });
  $('plist').addEventListener('submit', e => {
    if (e.target.id !== 'addDJ') return; e.preventDefault();
    const n = e.target.n.value.trim(), h = e.target.h.value.trim().replace(/^@/, '').replace(/^https?:\/\/[^/]+\/(@|c\/|user\/)?/, '').split(/[/?#]/)[0]; if (!n || !h) return;
    const list = myDJs(); list.push({ name: n, src: TAB2SRC[liveTab], id: h }); try { localStorage.setItem('rg-mydjs', JSON.stringify(list)); } catch (err) {} toast(n + ' added'); fillLive();
  });
  $('plist').addEventListener('click', e => {
    if (!liveOpen && !djOpen) return;
    const kd = e.target.closest('[data-k]'); if (kd) { const [ks, ...kr] = kd.dataset.k.split(':'); window.open(profileURL(ks, kr.join(':')), '_blank', 'noopener'); return; }
    const v = e.target.closest('[data-v]'); if (v) { const [sk, ...rest] = v.dataset.v.split(':'), id = rest.join(':'); const r = sk === 'youtube' ? (liveData.items || []).find(x => x.id === id) : (socialData.items || []).find(x => x.src === sk && x.id === id); if (r && sk === 'tiktok') { window.open(profileURL('tiktok', r.id), '_blank', 'noopener'); return; } if (r) liveWatch(Object.assign({ kind: 'live' }, r)); return; }
    const ev = e.target.closest('[data-e]'); if (ev) { const x = evItems[+ev.dataset.e]; if (x) { globe.pointOfView({ lat: x.lat, lng: x.lon, altitude: 0.3 }, 1200); if (x.url) window.open(x.url, '_blank', 'noopener'); } }
  }, true);
  $('livebtn').onclick = () => { if (liveOpen && !$('panel').classList.contains('hidden')) { $('panel').classList.add('hidden'); liveOpen = false; } else openLive(); };
  loadLive();

  // ---------- panel ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  // ---------- logos (station favicon -> site favicon -> coloured letter tile) ----------
  const hostOf = u => { try { return new URL(u).hostname; } catch (e) { return ''; } };
  function tile(name, cls) {
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    const l = (name.match(/[A-Za-z0-9À-￿]/) || ['♪'])[0].toUpperCase();
    return '<div class="' + cls + ' tile" style="background:hsl(' + h + ',42%,34%)">' + esc(l) + '</div>';
  }
  window.__lg = img => {
    const n = +img.dataset.n || 0, host = img.dataset.h;
    if (n === 0 && host) { img.dataset.n = 1; img.src = 'https://www.google.com/s2/favicons?domain=' + host + '&sz=128'; }
    else img.replaceWith(Object.assign(document.createElement('div'), { className: img.dataset.c + ' tile', textContent: img.dataset.l, style: 'background:' + img.dataset.bg }));
  };
  function logo(s, cls) {
    const host = hostOf(s[10]);
    let h = 0; for (const ch of s[0]) h = (h * 31 + ch.charCodeAt(0)) % 360;
    const l = (s[0].match(/[A-Za-z0-9À-￿]/) || ['♪'])[0].toUpperCase();
    const src = s[9] || (host ? 'https://www.google.com/s2/favicons?domain=' + host + '&sz=128' : '');
    if (!src) return tile(s[0], cls);
    return '<img class="' + cls + '" loading="lazy" src="' + esc(src) + '" data-n="' + (s[9] ? 0 : 1) + '" data-h="' + esc(host) + '" data-c="' + cls + '" data-l="' + esc(l) + '" data-bg="hsl(' + h + ',42%,34%)" onerror="__lg(this)">';
  }

  // ---------- favorites ----------
  let favs = new Set(); try { favs = new Set(JSON.parse(localStorage.getItem('rg-favs') || '[]')); } catch (e) {}
  let favOnly = false;
  const saveFavs = () => { try { localStorage.setItem('rg-favs', JSON.stringify([...favs])); } catch (e) {} };
  function toggleFav(s) {
    if (favs.has(s[13])) { favs.delete(s[13]); toast('Removed from favorites'); } else { favs.add(s[13]); toast('★ Added to favorites'); }
    saveFavs(); paintFavs(); if (favOnly) applyFilter(); else paintBands(); if (drawer.classList.contains('open')) renderFavs();
  }
  const drawer = $('favdrawer');
  function renderFavs() {
    const list = S.filter(s => favs.has(s[13])).sort((a, b) => (a[0] > b[0]) - (a[0] < b[0]));
    $('favcount').textContent = list.length; $('favtop').dataset.n = list.length;
    $('favlist').innerHTML = list.length ? list.map(s => '<div class="fcard' + (current && current[13] === s[13] ? ' now' : '') + '" data-u="' + esc(s[13]) + '">' + logo(s, 'fl') +
      '<div class="fn">' + esc(s[0]) + '</div><div class="fm">' + esc([s[15], s[12]].filter(Boolean).join(' · ')) + '</div>' +
      '<button class="star on" data-u="' + esc(s[13]) + '" title="Remove from favorites">★</button></div>').join('')
      : '<div class="fempty">No favorites yet.<br>Tap the ☆ on any station to save it here.</div>';
  }
  function toggleDrawer(open) {
    const o = open === undefined ? !drawer.classList.contains('open') : open;
    if (o) { renderFavs(); $('panel').classList.add('lift'); }
    drawer.classList.toggle('open', o); $('favtop').classList.toggle('on', o);
  }
  $('favtop').onclick = () => toggleDrawer();
  $('favclose').onclick = () => toggleDrawer(false);
  $('favonly').addEventListener('change', e => { favOnly = e.target.checked; applyFilter(); });
  $('favlist').addEventListener('click', e => {
    const star = e.target.closest('.star'); if (star) { e.stopPropagation(); const s = S.find(x => x[13] === star.dataset.u); if (s) toggleFav(s); return; }
    const c = e.target.closest('.fcard'); if (!c) return; const s = S.find(x => x[13] === c.dataset.u); if (!s) return;
    randomMode = false; play(s, true); openPanel([s], s[0], s[12] || ''); renderFavs();
  });
  function paintFavs() {
    document.querySelectorAll('.star').forEach(b => { const on = favs.has(b.dataset.u); b.textContent = on ? '★' : '☆'; b.classList.toggle('on', on); });
    $('favtop').dataset.n = favs.size; $('favtopn').textContent = favs.size;
    if (current) { $('favBtn').textContent = favs.has(current[13]) ? '★' : '☆'; $('favBtn').classList.toggle('on', favs.has(current[13])); }
  }
  function rowHTML(s, i) {
    const g = s[11].slice(0, 3).map(x => G[x].name).join(', ');
    const fav = logo(s, 'ph');
    const meta = [lyricsOnly && lyricSet.has(s[13]) ? '♪ ' + lyricSet.get(s[13]) : '', s[15], s[12], g, s[1] ? s[6] && s[6] + (s[7] ? ' ' + s[7] + 'k' : '') : 'broadcast only · no stream'];
    return '<div class="row' + (current && current[13] === s[13] ? ' now' : '') + '" data-i="' + i + '">' + fav + '<div class="t"><div class="n">' + esc(s[0]) + '</div><div class="m">' + esc(meta.filter(Boolean).join(' · ')) + '</div></div><button class="star' + (favs.has(s[13]) ? ' on' : '') + '" data-u="' + esc(s[13]) + '" title="Favorite">' + (favs.has(s[13]) ? '★' : '☆') + '</button></div>';
  }
  let panelList = [];
  // station lists render in chunks of 100 as you scroll, so even a 1,500-station genre opens instantly
  let panelDone = 0;
  function panelMore() {
    if (panelDone >= panelList.length) return;
    const end = Math.min(panelList.length, panelDone + 100);
    $('plist').insertAdjacentHTML('beforeend', panelList.slice(panelDone, end).map((s, k) => rowHTML(s, panelDone + k)).join(''));
    panelDone = end;
  }
  $('plist').addEventListener('scroll', () => { const p = $('plist'); if (!liveOpen && p.scrollTop + p.clientHeight > p.scrollHeight - 500) panelMore(); }, { passive: true });
  function openPanel(list, title, sub) {
    liveOpen = false; djOpen = false; panelList = list; panelDone = 0;
    $('panel').classList.toggle('single', list.length === 1);
    $('ptitle').textContent = title; $('psub').textContent = sub;
    $('plist').innerHTML = ''; $('plist').scrollTop = 0; panelMore(); $('panel').classList.remove('hidden');
    if (panelList.length > panelDone) setTimeout(() => { const p = $('plist'); while (p.scrollHeight <= p.clientHeight + 100 && panelDone < panelList.length) panelMore(); }, 0);
  }
  // every genre opens its full station list (playable stations first, then most-voted)
  function showGenreList(name) {
    if (roloOn) return;
    const list = shown.slice().sort((x, y) => (y[1] ? 1 : 0) - (x[1] ? 1 : 0) || y[5] - x[5]);
    openPanel(list, name, list.length.toLocaleString() + ' stations · scroll for more'); $('pdetail').classList.add('hidden');
  }
  function starClick(e, list) { const b = e.target.closest('.star'); if (!b) return false; e.stopPropagation(); const s = S.find(x => x[13] === b.dataset.u); if (s) toggleFav(s); return true; }
  $('plist').addEventListener('click', e => { if (liveOpen) return; if (starClick(e)) return; const r = e.target.closest('.row'); if (r && panelList[+r.dataset.i]) { randomMode = false; play(panelList[+r.dataset.i], true); } });
  $('pclose').onclick = () => $('panel').classList.add('hidden');

  // ---------- station details + share ----------
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2200); }
  function shareURL(s) { return location.origin + location.pathname + '#s=' + encodeURIComponent(s[13]); }
  async function share(s) {
    if (!s) return;
    const url = shareURL(s), title = s[0] + (s[15] ? ' · ' + s[15] : ''), text = 'Listen to ' + title + (s[12] ? ' (' + s[12] + ')' : '') + ' on Radio Globe';
    try { if (navigator.share) { await navigator.share({ title, text, url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + '\n' + url); toast('Link copied to clipboard'); } catch (e) { prompt('Copy this link:', url); }
  }
  async function copy(txt, what) { try { await navigator.clipboard.writeText(txt); toast(what + ' copied'); } catch (e) { prompt('Copy:', txt); } }
  function flyTo(s) { return;   // zoom-in on station click removed (Billy, 2026-10-12); delete this line to bring it back
    if (s[2] == null) return; ctl.autoRotate = false; autoRotate = false; globe.pointOfView({ lat: s[2], lng: s[3], altitude: 0.1 }, 1600); }
  function zoomTo(s) { ctl.autoRotate = false; autoRotate = false; globe.pointOfView({ lat: s[2], lng: s[3], altitude: 0.004 }, 2600); }
  function detail(s) {
    current = s;
    const row = (k, v) => v ? '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>' : '';
    const gens = s[11].map(i => '<span class="chip" data-g="' + i + '">' + esc(G[i].name) + '</span>').join('');
    const rawTags = (s[18] || '').split(',').map(t => t.trim()).filter(Boolean);
    const place = [s[16], s[12]].filter(Boolean).join(', ');
    const fav = logo(s, 'dlogo');
    $('pdetail').innerHTML =
      '<div class="dhead">' + fav + '<div class="dt"><div class="dn">' + esc(s[0]) + '</div><div class="dm">' + esc([s[15], BAND[s[14]]].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ')) + '</div></div></div>' +
      '<div class="dbtns"><button data-a="zoom">🛰 Zoom in</button><button data-a="share"><svg class="shic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.7"/><circle cx="6" cy="12" r="2.7"/><circle cx="18" cy="19" r="2.7"/><path d="M8.4 10.7l7.2-4.1M8.4 13.3l7.2 4.1"/></svg> Share</button><button data-a="fav" class="fbtn' + (favs.has(s[13]) ? ' on' : '') + '">' + (favs.has(s[13]) ? '★ Favorited' : '☆ Favorite') + '</button>' + (s[1] && !isBL(s) && !isUP(s) ? '<button data-a="copystream">Copy stream URL</button>' : '') + (s[10] ? '<a href="' + esc(s[10]) + '" target="_blank" rel="noopener">Website ↗</a>' : '') +
      '<a href="https://www.google.com/maps?q=' + s[2] + ',' + s[3] + '" target="_blank" rel="noopener">Map ↗</a>' + (/^[0-9a-f-]{36}$/.test(s[13]) ? '<a href="https://www.radio-browser.info/history/' + s[13] + '" target="_blank" rel="noopener">Radio Browser ↗</a>' : '') + (/^wd-Q/.test(s[13]) ? '<a href="https://www.wikidata.org/wiki/' + s[13].split('-')[1] + '" target="_blank" rel="noopener">Wikidata ↗</a>' : '') + '</div>' +
      (gens ? '<div class="dsec">Genres</div><div class="dchips">' + gens + '</div>' : '') +
      '<div class="dsec">Details</div>' +
      row('Band', esc(BAND[s[14]] + (s[15] ? ' · ' + s[15] : ''))) + row('Location', esc(place) + (s[8] ? ' <i>(approximate)</i>' : '')) + row('Coordinates', s[2].toFixed(3) + ', ' + s[3].toFixed(3)) +
      row('Language', esc((s[17] || '').split(',').map(x => x.trim()).filter(Boolean).join(', '))) + row('Format', esc([s[6], s[7] ? s[7] + ' kbps' : ''].filter(Boolean).join(' · '))) +
      row('Listener votes', s[5] ? s[5].toLocaleString() : '') + row('Recent plays', s[19] ? s[19].toLocaleString() : '') +
      row('Stream', isBL(s) ? 'Shuffled 24/7' : isUP(s) ? 'Live from 1upradio.com' : s[1] ? '<span class="url">' + esc(s[1].replace(/^https?:\/\//, '')) + '</span>' : 'No online stream known') +
      (rawTags.length ? '<div class="dsec">Tags</div><div class="dtags">' + rawTags.slice(0, 24).map(t => '<span>' + esc(t) + '</span>').join('') + '</div>' : '');
    $('pdetail').classList.remove('hidden'); $('pdetail').scrollTop = 0;
  }
  $('pdetail').addEventListener('click', e => {
    const b = e.target.closest('button'), c = e.target.closest('.chip');
    if (b && b.dataset.a === 'zoom') zoomTo(current);
    else if (b && b.dataset.a === 'fav') { toggleFav(current); b.classList.toggle('on', favs.has(current[13])); b.textContent = favs.has(current[13]) ? '★ Favorited' : '☆ Favorite'; }
    else if (b && b.dataset.a === 'share') share(current);
    else if (b && b.dataset.a === 'copystream') copy(current[1], 'Stream URL');
    else if (c && c.dataset.g !== undefined) { filter = { kind: 'genre', id: +c.dataset.g }; applyFilter(); }
  });
  // phone layout: the filter panel is a slide-in drawer
  const sideOpen = on => { $('side').classList.toggle('open', on); $('sideScrim').classList.toggle('on', on); };
  $('menuBtn').onclick = () => sideOpen(!$('side').classList.contains('open'));
  $('sideScrim').onclick = () => sideOpen(false);
  $('sideClose').onclick = () => sideOpen(false);
  $('genres').addEventListener('click', e => { if (innerWidth <= 820 && e.target.closest('[data-g]')) setTimeout(() => sideOpen(false), 150); });
  $('bands').addEventListener('click', e => { if (innerWidth <= 820 && e.target.closest('.chip') && !e.target.closest('[data-b="fav"]')) setTimeout(() => sideOpen(false), 150); });
  $('shareBtn').onclick = () => share(current);
  $('favBtn').onclick = () => { if (current) { toggleFav(current); detail(current); } };

  // ---------- Billy Legal Radio (YouTube-backed station) ----------
  const isBL = s => s && typeof s[1] === 'string' && s[1].startsWith('billylegal:');
  let yt = null, ytQ = [], ytPos = -1, ytOn = false, ytPlaying = false, ytErr = 0, ytSongs = null, ytMode = 'bl';
  let upS = null, upIdx = -1;
  const shuffleArr = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  async function ytSongList() { if (!ytSongs) ytSongs = (await (await fetch('data/billylegal.json')).json()).map(r => [r.id, r.title]); return ytSongs; }
  function ytShow(song) { $('pname').textContent = 'Billy Legal Radio'; $('pmeta').textContent = (song ? song + ' · ' : '') + 'Toronto, Canada · shuffled 24/7'; }
  function ytPlayPos(p) {
    if (p >= ytQ.length) { ytQ = shuffleArr(ytSongs); p = 0; } if (p < 0) p = 0;
    ytPos = p; const sg = ytQ[p]; ytShow(sg[1]); ytTrack('Billy Legal - ' + sg[1], sg[0]); yt.loadVideoById(sg[0]);
  }
  // 1UP Radio: follows the live schedule published at 1upradio.com
  const upNow = () => { let k = 0; const src = Date.now() / 1000 - (upS.delay || 0); for (let i = 0; i < upS.plays.length; i++) { if (upS.plays[i].t <= src) k = i; else break; } return k; };
  const ytNow = { t: '', id: '', sid: '' };   // song currently on the 1UP Radio / Billy Legal Radio YouTube player (for the save button)
  const ytTrack = (t, id) => { ytNow.t = t; ytNow.id = id; ytNow.sid = current ? current[13] : ''; try { npPoll(); } catch (e) {} };
  let upTimer = null, upCurAlt = 0, upCur = null; const upBad = {};
  function upClear() { if (upTimer) { clearTimeout(upTimer); upTimer = null; } }
  // If YouTube will not play a song here, EVERY listener (this page and 1upradio.com) swaps in the same replacement for that slot, picked by a fixed rule, so they stay in step.
  function upAltIdx(i, n) { const lo = Math.max(0, i - 900), hi = Math.max(lo + 1, i - 40), len = hi - lo; return lo + ((((i * 2654435761 + n * 40503 + 7) % len) + len) % len); }
  function upSlotPlay(i, n) { return n === 0 ? upS.plays[i] : upS.plays[upAltIdx(i, n)]; }
  function upPlayIdx(i, offset, n) {
    upClear(); if (ytMode !== 'up' || !ytOn) return;   // a timer from an earlier 1UP session must not take over another station
    const pl = upS.plays; if (!pl.length) return;
    if (i >= pl.length) { i = Math.max(0, pl.length - 40 + ((Math.random() * 30) | 0)); offset = 0; n = 0; }
    n = n || 0; let p = upSlotPlay(i, n);
    while (n < 8 && upBad[p.id]) { n++; p = upSlotPlay(i, n); }
    upIdx = i; upCurAlt = n; upCur = p; ytTrack(p.title, p.id); const k = p.title.indexOf(' - ');
    $('pname').textContent = '1UP Radio - Keep the Volume Up';
    $('pmeta').textContent = (k > 0 ? p.title.slice(k + 3) + ' · ' + p.title.slice(0, k) : p.title) + ' · live schedule';
    offset = Math.max(0, Math.floor(offset || 0));
    if (offset > p.dur - 5 && i + 1 < pl.length) { upNext(); return; }       // song is basically over: wait for the next slot
    yt.loadVideoById({ videoId: p.id, startSeconds: offset });
  }
  // after a song ends the next one starts exactly when the schedule says it begins (never early), so this stays in step with 1upradio.com
  function upNext() {
    const n = upIdx + 1;
    if (n >= upS.plays.length) { upPlayIdx(n, 0); return; }
    const wait = (upS.plays[n].t + (upS.delay || 0)) - Date.now() / 1000;
    upClear();
    if (wait > 1) upTimer = setTimeout(() => { upTimer = null; upPlayIdx(n, 0); }, wait * 1000);
    else upPlayIdx(n, Math.max(0, -wait));
  }
  async function upStart() {
    if (!upS) upS = await (await fetch('https://1upradio.com/schedule.json?t=' + Date.now())).json();
    const k = upNow(); upIdx = k; return [k, Date.now() / 1000 - (upS.delay || 0) - upS.plays[k].t];
  }
  const ytNext = () => { if (ytMode === 'up') upNext(); else ytPlayPos(ytPos + 1); };
  async function ytStart(mode) {
    upClear(); ytMode = mode || 'bl'; ytOn = true; ytErr = 0; const tok = ++ytTok;
    let first;
    if (ytMode === 'up') { try { const [k, off] = await upStart(); first = () => upPlayIdx(k, off); } catch (e) { $('pmeta').textContent = '1UP Radio schedule unavailable right now'; ytOn = false; return; } }
    else { await ytSongList(); ytQ = shuffleArr(ytSongs); ytPos = -1; first = () => ytPlayPos(0); }
    if (tok !== ytTok) return;   // another station was chosen while this one was loading
    const init = () => { if (tok !== ytTok) return; if (yt) { first(); return; } yt = new YT.Player('ytplayer', { width: 200, height: 200, playerVars: { playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3 }, events: { onReady: () => { if (tok !== ytTok) return; try { yt.setVolume(Math.round(+$('vol').value * 100)); } catch (e) {} first(); },
      onStateChange: e => { if (e.data === 1 && !ytOn) { try { yt.stopVideo(); } catch (x) {} return; } if (e.data === 1) { playedCur = true; try { audio.pause(); } catch (x) {} stopWatch(); try { announce(); } catch (x) {} try { npPoll(); } catch (x) {} ytPlaying = true; ytErr = 0; try { if (!yt.isMuted()) yt.setVolume(Math.round(+$('vol').value * 100)); } catch (x) {} $('pplay').textContent = '❚❚'; } else if (e.data === 2) { ytPlaying = false; $('pplay').textContent = '▶'; } else if (e.data === 0) ytNext(); },
      onError: () => { if (ytMode === 'up' && upS && upS.plays[upIdx]) { if (upCur) upBad[upCur.id] = 1; if (++ytErr < 8) { upPlayIdx(upIdx, Date.now() / 1000 - (upS.delay || 0) - upS.plays[upIdx].t, upCurAlt + 1); return; } } else if (++ytErr < 6) { ytNext(); return; } else $('pmeta').textContent = (ytMode === 'up' ? '1UP Radio' : 'Billy Legal Radio') + ' is unavailable right now'; } } }); };
    if (window.YT && YT.Player) init(); else { window.onYouTubeIframeAPIReady = init; const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(sc); }
  }
  // 1UP Radio: stay locked to the live schedule (same rule as 1upradio.com): refresh it, and jump back to live after a pause/stall
  let upLast = 0;
  setInterval(async () => {
    if (!ytOn || ytMode !== 'up' || !upS) return;
    try {
      const cur = upS.plays[upIdx] && upS.plays[upIdx].t, fresh = await (await fetch('https://1upradio.com/schedule.json?t=' + Date.now())).json();
      upS = fresh; if (cur != null) { const k = upS.plays.findIndex(p => p.t === cur); if (k >= 0) upIdx = k; }
    } catch (e) {}
  }, 180000);
  setInterval(() => {
    if (!ytOn || ytMode !== 'up' || !ytPlaying || !upS || upIdx < 0 || !upS.plays[upIdx] || upTimer || Date.now() - upLast < 20000) return;
    try {
      const now = Date.now() / 1000 - (upS.delay || 0), k = upNow();
      if (k !== upIdx) { upLast = Date.now(); upPlayIdx(k, now - upS.plays[k].t); return; }          // wrong song for this moment: jump to what is on air
      const expected = now - upS.plays[upIdx].t, cur = yt.getCurrentTime(), dur = yt.getDuration();
      if (dur && expected < dur - 5 && Math.abs(cur - expected) > 20) { upLast = Date.now(); yt.seekTo(expected, true); }   // paused or stalled: catch up to live
    } catch (e) {}
  }, 6000);
  let ytTok = 0;
  function ytStop() { ytTok++; if (typeof upClear === 'function') upClear(); ytOn = false; ytPlaying = false; try { yt && yt.stopVideo(); } catch (e) {} }   // bumping the token cancels any YouTube start that is still loading

  const isUP = s => s && typeof s[1] === 'string' && s[1].startsWith('web:');

  // the BEATS head floats around the screen all the time; tap it to visit billylegal.com
  // ---------- Omarchy Store shuttle: orbits the Earth (tilted ellipse), passes in front, then disappears behind the globe ----------
  {
    const box = document.querySelector('.sh .shx'), link = box && box.querySelector('.shy');
    if (box && link) {
      box.style.cssText += ';animation:none!important;transform-origin:50% 50%;will-change:transform,opacity'; link.style.animation = 'none';
      let th = 4.2, last = performance.now(), hov = false; const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      link.addEventListener('pointerenter', () => { hov = true; }); link.addEventListener('pointerleave', () => { hov = false; });
      const TILT = -0.26, SIDE = Math.min(innerWidth, innerHeight) < 600;
      const tick = now => {
        requestAnimationFrame(tick);
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        if (roloOn || document.hidden) { box.style.display = 'none'; return; } box.style.display = '';
        if (!hov && !still) th += dt * (Math.PI * 2 / 52);   // one lap about every 52 s
        const cam = globe.camera().position, L = Math.hypot(cam.x, cam.y, cam.z), sa = Math.min(0.999, GR / L);
        const Rs = Math.tan(Math.asin(sa)) / Math.tan(globe.camera().fov * Math.PI / 360) * (innerHeight / 2);   // the Earth's radius on screen
        const A = Math.min(Rs * (SIDE ? 1.2 : 1.28), innerWidth * 0.46), B = A * 0.3, c = Math.cos(th), s = Math.sin(th);
        let x = A * c, y = B * s; const ct = Math.cos(TILT), st = Math.sin(TILT);
        const px = innerWidth / 2 + x * ct - y * st, py = innerHeight / 2 + x * st + y * ct;
        const z = s;   // > 0 : in front of the Earth (moving left, nose first), < 0 : behind it
        const base = SIDE ? 74 : 92, w = base * (0.86 + 0.16 * z), h = w * 0.72;
        const d = Math.hypot(px - innerWidth / 2, py - innerHeight / 2);
        let op = 1; if (z < 0 && !spaced) op = Math.max(0, Math.min(1, (d - Rs * 0.97) / (w * 0.45)));   // tucks behind the Earth's edge
        box.style.opacity = op.toFixed(3); link.style.pointerEvents = op > 0.5 ? 'auto' : 'none';
        box.style.filter = z < 0 ? 'brightness(.78)' : '';
        box.style.transform = 'translate(' + (px - w / 2).toFixed(1) + 'px,' + (py - h / 2).toFixed(1) + 'px) scale(' + (w / 96).toFixed(3) + ')';
      };
      requestAnimationFrame(tick);
    }
  }
  // ---------- DJ stickers: search a DJ who has a photo and their sticker pops out and circles the Earth ----------
  const djStk = new Map();
  function spawnDJSticker(p) {
    if (djStk.has(p.name)) return;
    if (djStk.size >= 3) { const k = djStk.keys().next().value; djStk.get(k).el.remove(); djStk.delete(k); }
    const el = document.createElement('div'); el.className = 'djstk';
    el.innerHTML = '<img src="' + esc(p.photo) + '" alt="' + esc(p.name) + '" draggable="false"><i>' + esc(p.name) + '</i><b class="x" role="button" aria-label="Hide sticker">×</b>';
    document.body.appendChild(el);
    const o = { el, name: p.name, th: Math.random() * 6.283, born: performance.now() };
    el.addEventListener('click', e => {
      e.stopPropagation();   // (otherwise the click-outside handler would close the results straight away)
      if (e.target.closest('.x')) { el.remove(); djStk.delete(p.name); return; }
      $('ssearch').value = p.name; runSearch(p.name); $('sresults').classList.remove('hidden');
    });
    djStk.set(p.name, o);
  }
  { let last = performance.now();
    const stkTick = now => {
      requestAnimationFrame(stkTick);
      const dt = Math.min(0.1, (now - last) / 1000); last = now; if (!djStk.size) return;
      const cam = globe.camera().position, L = Math.hypot(cam.x, cam.y, cam.z), Rs = Math.tan(Math.asin(Math.min(0.999, GR / L))) / Math.tan(globe.camera().fov * Math.PI / 360) * (innerHeight / 2);
      const small = Math.min(innerWidth, innerHeight) < 600; let i = 0;
      for (const o of djStk.values()) {
        const hide = roloOn || document.hidden; o.el.style.display = hide ? 'none' : ''; if (hide) continue;
        o.th -= dt * (Math.PI * 2 / 38);   // the other way round from the shuttle
        const A = Math.min(Rs * (1.12 + i * 0.1), innerWidth * 0.46), B = A * 0.34, c = Math.cos(o.th), s = Math.sin(o.th), TILT = 0.32 + i * 0.25;
        const x = A * c, y = B * s, px = innerWidth / 2 + x * Math.cos(TILT) - y * Math.sin(TILT), py = innerHeight / 2 + x * Math.sin(TILT) + y * Math.cos(TILT);
        const pop = Math.min(1, (now - o.born) / 700), w = (small ? 62 : 72) * (0.84 + 0.18 * s) * (0.3 + 0.7 * pop * (2 - pop)), d = Math.hypot(px - innerWidth / 2, py - innerHeight / 2);
        let op = pop; if (s < 0 && !spaced) op *= Math.max(0, Math.min(1, (d - Rs * 0.97) / (w * 0.5)));
        o.el.style.opacity = op.toFixed(3); o.el.style.pointerEvents = op > 0.5 ? 'auto' : 'none'; o.el.style.zIndex = s < 0 ? 3 : 5;
        o.el.style.transform = 'translate(' + (px - w / 2).toFixed(1) + 'px,' + (py - w * 0.5).toFixed(1) + 'px) scale(' + (w / 70).toFixed(3) + ') rotate(' + (Math.sin(now / 900 + i) * 5).toFixed(1) + 'deg)';
        i++;
      }
    };
    requestAnimationFrame(stkTick); }
  const bhead = document.createElement('div'); bhead.id = 'bounceHead'; bhead.setAttribute('aria-hidden', 'true');
  bhead.innerHTML = '<div class="bhx"><a class="bhy" href="https://billylegal.com" target="_blank" rel="noopener" title="Billy Legal" aria-label="Billy Legal"><img src="assets/head.png" alt="" width="62" height="87"></a></div>'; document.body.appendChild(bhead);
  const showHead = on => bhead.classList.toggle('on', !!on);
  showHead(true);
  // ---------- audio ----------
  const audio = $('audio'); let hls = null, tries = 0, randomMode = false;
  audio.volume = 0.8;
  const applyVol = () => { const v = +$('vol').value; audio.volume = v; try { if (yt && yt.setVolume) yt.setVolume(Math.round(v * 100)); } catch (e) {} };
  $('vol').oninput = applyVol; $('vol').onchange = applyVol;
  function setPlayerLogo(s) { $('plogo').innerHTML = logo(s, 'pl'); $('favBtn').disabled = false; paintFavs(); }

  // phone lock screen / notification player: station name, location, play & pause (the stream itself is a normal audio element, so phones keep it going in the background)
  if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
    const MS = navigator.mediaSession;
    const msUpdate = () => { const s = current; if (!s) return; try { MS.metadata = new MediaMetadata({ title: (typeof np !== 'undefined' && np.sid === s[13] && np.title) || s[0], artist: [s[15], s[12]].filter(Boolean).join(' · ') || 'Radio Globe', album: 'A View From Space · Radio Globe', artwork: [{ src: 'assets/icon/radio-globe-512.png', sizes: '512x512', type: 'image/png' }] }); MS.playbackState = audio.paused ? 'paused' : 'playing'; } catch (e) {} };
    ['play', 'playing', 'pause', 'loadedmetadata', 'npchange'].forEach(ev => audio.addEventListener(ev, msUpdate));
    try { MS.setActionHandler('play', () => { audio.play().catch(() => {}); }); } catch (e) {}
    try { MS.setActionHandler('pause', () => { audio.pause(); }); } catch (e) {}
    try { MS.setActionHandler('stop', () => { audio.pause(); }); } catch (e) {}
    try { MS.setActionHandler('nexttrack', null); MS.setActionHandler('previoustrack', null); } catch (e) {}
  }
  // ---------- history tickets: the last three stations you moved on from, as little tickets in the top bar; tap one to go back ----------
  const histBox = document.createElement('div'); histBox.id = 'hist'; document.body.appendChild(histBox);
  let hist = [], playedCur = false;   // playedCur: the current station really started playing (failed tries never reach the history)
  function renderHist() {
    histBox.innerHTML = hist.map((x, i) => '<button class="tk" data-i="' + i + '" style="--tc:' + stationColor(x) + '" title="Go back to ' + esc(x[0]) + '"><i></i><b>' + esc(x[0]) + '</b>' + (x[12] ? '<small>' + esc(String(x[12]).split(',').pop().trim().slice(0, 14)) + '</small>' : '') + '</button>').join('');
  }
  function pushHist(prev) {
    if (!prev || (!prev[1] && !isBL(prev) && !isUP(prev))) return;
    hist = [prev, ...hist.filter(x => x[13] !== prev[13])].slice(0, 3); renderHist();
  }
  histBox.addEventListener('click', e => {
    const b = e.target.closest('.tk'); if (!b) return; const s = hist[+b.dataset.i]; if (!s) return;
    if (locked && current && s[13] !== current[13]) { lockMsg(); return; }
    randomMode = false; play(s, false); hist = hist.filter(x => x[13] !== s[13]); renderHist(); toast('Back to ' + s[0]);
    if (s[2] != null) { ctl.autoRotate = false; autoRotate = false; $('rotate').style.opacity = .5; stopFling(); const pov = globe.pointOfView(), dl = ((((s[3] - pov.lng) % 360) + 540) % 360) - 180; globe.pointOfView({ lat: s[2], lng: pov.lng + dl, altitude: pov.altitude }, 1200); }
  });
  function play(s, fly) {
    if (locked && current && s && s[13] !== current[13]) { lockMsg(); return; }   // the music is locked on this station
    if (current && s && s[13] !== current[13]) { if (playedCur) pushHist(current); playedCur = false; }
    stopWatch(); try { lyrReset(); } catch (e) {}
    if (isBL(s)) { audio.pause(); if (hls) { hls.destroy(); hls = null; } current = s; detail(s); $('shareBtn').disabled = false; setPlayerLogo(s); $('pplay').disabled = false; ytStart('bl'); pulseT = performance.now(); if (fly) flyTo(s); return; }
    ytStop(); stopWatch();
    if (isUP(s)) { audio.pause(); if (hls) { hls.destroy(); hls = null; } current = s; detail(s); $('shareBtn').disabled = false; $('pname').textContent = s[0]; $('pmeta').textContent = 'Tuning in…'; setPlayerLogo(s); $('pplay').disabled = false; ytStart('up'); pulseT = performance.now(); if (fly) flyTo(s); return; }
    if (!s[1]) {
      current = s; detail(s); $('shareBtn').disabled = false; $('pname').textContent = s[0]; setPlayerLogo(s); $('pplay').disabled = true;
      $('pmeta').innerHTML = esc([s[15], s[12]].filter(Boolean).join(' · ')) + ' · no online stream known' + (s[10] ? ' · <a href="' + esc(s[10]) + '" target="_blank" rel="noopener" style="color:var(--acc)">website</a>' : '');
      audio.pause(); pulseT = performance.now();
      if (fly) flyTo(s);
      return;
    }
    current = s; tries = 0; detail(s); $('shareBtn').disabled = false;
    $('pname').textContent = s[0];
    $('pmeta').textContent = 'Connecting… · ' + (s[12] || '') + (s[8] ? ' (approx. location)' : '');
    setPlayerLogo(s);
    $('pplay').disabled = false;
    if (hls) { hls.destroy(); hls = null; }
    const url = s[1];
    if (/\.m3u8(\?|$)/i.test(url) && window.Hls && Hls.isSupported()) { hls = new Hls(); hls.loadSource(url); hls.attachMedia(audio); hls.on(Hls.Events.ERROR, (_, d) => d.fatal && failed()); }
    else if (audio.src !== url) audio.src = url;   // (the early-start script may already be loading this exact stream)
    { const pr = audio.play(); if (pr && pr.catch) pr.catch(err => { if (err && err.name === 'NotAllowedError') startMuted(); }); }
    watchdog(s);
    pulseT = performance.now();
    if (fly) flyTo(s);
    document.querySelectorAll('.row').forEach(r => r.classList.toggle('now', panelList[+r.dataset.i] && panelList[+r.dataset.i][13] === s[13]));
    fetch('https://de1.api.radio-browser.info/json/url/' + s[13], { mode: 'no-cors' }).catch(() => {});
  }
  // phones refuse to start SOUND without a tap, but allow muted autoplay: so start muted (stream buffers right away) and unmute on the first tap
  let needUnmute = !!window.__needUnmute || audio.muted, lastUnmute = 0;
  const paintMuted = () => { $('volIco').textContent = needUnmute ? '🔇' : '🔊'; $('volIco').classList.toggle('mutedpulse', needUnmute); };
  // first real tap/key anywhere: unmute, and start the station if the browser had refused to (touch only counts as a gesture on release, so listen to pointerup/touchend/click)
  let armed = true;
  function onGesture() {
    if (!armed) return;
    if (needUnmute) { needUnmute = false; audio.muted = false; paintMuted(); lastUnmute = Date.now(); }
    if (audio.paused && current && current[1] && !ytOn) { lastUnmute = Date.now(); const pr = audio.play(); if (pr && pr.then) pr.then(() => { armed = false; }, () => {}); }
    else armed = false;
  }
  function startMuted() { audio.muted = true; needUnmute = true; paintMuted(); const p = audio.play(); if (p && p.catch) p.catch(() => {}); }
  paintMuted();
  ['pointerup', 'click', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, onGesture, true));
  let startElec = null, startCur = null, wdT = 0;
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
  const lsAdd = (k, v, cap) => { try { const l = lsGet(k).filter(x => x !== v); l.push(v); localStorage.setItem(k, JSON.stringify(l.slice(-cap))); } catch (e) {} };
  const fastOK = s => s[1] && typeof s[1] === 'string' && /^https:/i.test(s[1]) && !/\.(m3u8|pls|m3u)(\?|$)/i.test(s[1]) && (!s[6] || /^(MP3|AAC\+?)$/i.test(s[6]));   // https + direct MP3/AAC connects fastest (http streams are often blocked on an https page)
  // "energetic" music for the opening spin: hip-hop, country, rock, the 80s, electronic (no chill / ambient / lounge)
  const ENERGY = { hiphop: /^(Hip-Hop|Old School Hip-Hop|Gangsta Rap|Drill|Grime|Reggaeton|Dancehall|Afrobeats|Funk)$/, country: /^(Country|Honky Tonk|Bluegrass|Western|Americana)$/, rock: /^(Rock|Classic Rock|Hard Rock|Alternative|Punk|Metal|Heavy Metal|Grunge|Pop Rock|Southern Rock|Garage Rock|Blues Rock|New Wave|Rockabilly)$/, eighties: /^80s$/, electronic: /^(House|Tech House|Progressive House|Electro House|Afro House|Techno|Trance|Drum & Bass|Dubstep|Hardstyle|EDM|Electro|Dance|Club|Eurodance|Disco|Big Room|Future Bass|Hands Up|Melodic Techno)$/ };
  const ENERGY_IDS = {}; for (const k in ENERGY) ENERGY_IDS[k] = new Set(G.filter(g => ENERGY[k].test(g.name)).map(g => g.id));
  const AVOID_IDS = new Set(G.filter(g => /^(Ambient|Chillout|Lounge|Lo-?fi|Vaporwave|Easy Listening|Beautiful Music|Adult Contemporary|Soft Rock|Smooth Jazz|Jazz|New Age|Meditation|Classical|Talk|News|Sports|Religious|Gospel|Christian|Kids|Variety|Adult Hits|Soul|Neo Soul|R&B|Oldies|Throwback)/i.test(g.name)).map(g => g.id));
  const energyOf = (s, k) => Array.isArray(s[11]) && s[11].length > 0 && ENERGY_IDS[k].has(s[11][0]) && !s[11].some(i => AVOID_IDS.has(i));   // main genre is energetic and nothing chill is tagged
  const isEnergetic = s => !!s && Object.keys(ENERGY).some(k => energyOf(s, k));
  const markBad = s => lsAdd('rg-bad', s[13], 300);
  // one sound at a time: whatever just started playing silences every other source (YouTube radios, live-set video, other open tabs of this site)
  let bc = null; try { bc = new BroadcastChannel('rg-player'); } catch (e) {}
  const tabId = Math.random().toString(36).slice(2);
  const announce = () => { try { bc && bc.postMessage(tabId); } catch (e) {} };
  if (bc) bc.onmessage = e => { if (e.data !== tabId) { try { audio.pause(); } catch (x) {} if (ytOn) { try { yt.pauseVideo(); } catch (x) {} } } };
  audio.addEventListener('playing', () => { if (ytOn) ytStop(); stopWatch(); announce(); });
  audio.addEventListener('playing', () => { playedCur = true; clearTimeout(wdT); startElec = null; if (current && current[1]) { lsAdd('rg-good', current[13], 80); if (fastOK(current)) { try { const l = lsGet('rg-fast').filter(x => x[0] !== current[13]); l.push([current[13], current[1], isEnergetic(current) ? 1 : 0]); localStorage.setItem('rg-fast', JSON.stringify(l.slice(-25))); } catch (e) {} } } });
  // give up on a station that has not produced sound in 3.5 s and try another straight away
  function watchdog(s) {
    clearTimeout(wdT);
    if (!(randomMode || (startElec && s === startCur))) return;
    wdT = setTimeout(() => { if (current === s && audio.readyState < 3) { markBad(s); if (randomMode) randomStation(); else if (startElec && s === startCur) startElec(); } }, 3500);
  }
  function failed() {
    if (current) markBad(current);
    if (startElec && !randomMode && current === startCur) { startElec(); return; }
    $('pmeta').textContent = 'This stream is unavailable right now' + (randomMode ? ' — trying another…' : '');
    if (randomMode && ++tries < 4) setTimeout(() => randomStation(), 500);
  }
  audio.addEventListener('playing', () => { $('pplay').textContent = '❚❚'; $('pmeta').textContent = [current[15], current[12], current[11].slice(0, 3).map(x => G[x].name).join(', '), current[6] + (current[7] ? ' ' + current[7] + 'k' : ''), current[8] ? 'approx. location' : ''].filter(Boolean).join(' · '); });
  audio.addEventListener('pause', () => $('pplay').textContent = '▶');
  audio.addEventListener('play', () => { if (!ytOn) $('pplay').textContent = '❚❚'; });
  audio.addEventListener('error', failed);
  audio.addEventListener('stalled', () => { if (audio.readyState < 3) $('pmeta').textContent = 'Buffering…'; });
  const prevPlayClick = $('pplay').onclick = () => { if (Date.now() - lastUnmute < 600) return; if (ytOn && yt && yt.getPlayerState) { ytPlaying ? yt.pauseVideo() : yt.playVideo(); return; } if (!current) return; audio.paused ? audio.play().catch(failed) : audio.pause(); };
  function randomStation() {
    if (locked) { lockMsg(); return; } if (!shown.length) return; randomMode = true;
    const bad = new Set(lsGet('rg-bad')); let pool = shown.filter(x => x[1] && (!scope || scope.test(x))); if (!pool.length) { if (scope) toast('No playable stations in ' + scope.label + ' with these filters'); return; }
    const fast = pool.filter(x => fastOK(x) && !bad.has(x[13])); if (fast.length > 20) pool = fast;
    let s, t = 0; do { s = pool[(Math.random() * pool.length) | 0]; } while (s === current && ++t < 5);
    if (roloOn) { rolo.spinTo(s, () => {}); return; }
    play(s, true); if (innerWidth <= 820) $('panel').classList.add('hidden'); else openPanel([s], s[0], s[12] || '');   // the info card would block the view on phones/tablets
    if (s[2] != null) {   // swing the Earth round to the station and ease in just a touch
      ctl.autoRotate = false; autoRotate = false; $('rotate').style.opacity = .5; stopFling(); tip.classList.add('hidden');
      const pov = globe.pointOfView(), dl = ((((s[3] - pov.lng) % 360) + 540) % 360) - 180;
      globe.pointOfView({ lat: s[2], lng: pov.lng + dl, altitude: pov.altitude > 1.1 ? Math.max(1.0, pov.altitude * 0.85) : pov.altitude }, 1500);
    }
  }
  $('scopepill').onclick = () => { setScope(null); if (roloOn) $('roloClear').click(); toast('Random is worldwide again'); };
  $('random').onclick = () => { randomMode = true; tries = 0; randomStation(); };
  // tap the station name / logo in the player bar to open or close its info card
  const toggleInfo = () => {
    if (!current) return;
    if (!$('panel').classList.contains('hidden') && $('panel').classList.contains('single')) { $('panel').classList.add('hidden'); return; }
    openPanel([current], current[0], current[12] || ''); detail(current);
  };
  ['plogo', 'pname', 'pmeta'].forEach(id => { $(id).style.cursor = 'pointer'; });
  document.querySelector('#player .info').addEventListener('click', toggleInfo); $('plogo').addEventListener('click', toggleInfo);
  $('randomBar').onclick = () => $('random').click();
  $('rotate').onclick = () => { autoRotate = !autoRotate; ctl.autoRotate = autoRotate; $('rotate').style.opacity = autoRotate ? 1 : .5; };
  $('spaceBtn').onclick = () => { if (roloOn) { rolo.toggle(false); setSpaced(false, true); } else if (spaced) rolo.toggle(true); else setSpaced(true, true); };   // Earth -> Ghost -> Rolodex -> Earth
  // ---------- always open in Ghost view with 1UP Radio playing ----------
  setSpaced(false);
  {
    const up = S.find(isUP);
    const tap = document.createElement('div'); tap.id = 'tapStart'; tap.textContent = '▶ Tap to start 1UP Radio'; tap.style.display = 'none'; document.body.appendChild(tap);
    let muted = false;
    let elecMode = false;
    const unlock = () => {
      if (elecMode) return;
      try { if (yt && yt.unMute) { yt.unMute(); yt.setVolume(Math.round(+$('vol').value * 100)); if (!ytPlaying) yt.playVideo(); } else if (up && !ytOn) play(up, false); } catch (e) {}
      muted = false;
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { if (tap.style.display !== 'none' || muted) unlock(); }, { passive: true }));
    // every visit opens with a little spin and locks onto energetic music (hip-hop, country, rock, 80s, electronic); now and then Billy Legal or 1UP Radio
    const bad0 = new Set(lsGet('rg-bad')), goodIds = new Set(lsGet('rg-good')), bl = S.find(isBL), poolCache = {};
    const poolOf = k => poolCache[k] || (poolCache[k] = (() => {
      const base = S.filter(s => s[1] && typeof s[1] === 'string' && !isUP(s) && !isBL(s) && energyOf(s, k));
      let p = base.filter(s => fastOK(s) && s[5] >= 20 && !bad0.has(s[13])); if (p.length < 20) p = base.filter(s => fastOK(s) && !bad0.has(s[13])); if (p.length < 5) p = base.filter(s => !bad0.has(s[13]));
      return p; })());
    const energetic = () => { const ks = Object.keys(ENERGY), p = poolOf(ks[(Math.random() * ks.length) | 0]); if (!p.length) return null; const gl = p.filter(s => goodIds.has(s[13])), src = gl.length >= 3 && Math.random() < 0.7 ? gl : p; return src[(Math.random() * src.length) | 0]; };
    const r0 = Math.random(), first = bl && r0 < 0.08 ? bl : up && r0 < 0.16 ? up : energetic() || up;
    const openSpin = (s, glide) => {   // one full turn of the Earth that ends with the bullseye on the station (a retry just glides there)
      if (!s || s[2] == null) return; ctl.autoRotate = false; autoRotate = false; $('rotate').style.opacity = .5;
      if (glide) { const pov = globe.pointOfView(), dl = ((((s[3] - pov.lng) % 360) + 540) % 360) - 180; globe.pointOfView({ lat: s[2], lng: pov.lng + dl, altitude: pov.altitude }, 1200); return; }
      setTimeout(() => { const alt = globe.pointOfView().altitude; globe.pointOfView({ lat: s[2], lng: s[3] - 340, altitude: alt }, 0); setTimeout(() => globe.pointOfView({ lat: s[2], lng: s[3], altitude: alt }, 2800), 80); }, 900);
    };
    if (first && !isUP(first) && !isBL(first)) {
      elecMode = true; let n = 0;
      const early = window.__early && S.find(x => x[13] === window.__early.id); window.__early = null;
      const pick = () => { if (early && n === 0) { startCur = early; play(early, false); openSpin(early, false); return; } const s = n === 0 ? first : energetic() || first; startCur = s; play(s, false); openSpin(s, n > 0); };
      startElec = () => { if (++n < 8) pick(); };
      ctl.autoRotate = false; autoRotate = false; $('rotate').style.opacity = .5;
      pick();
      $('panel').classList.add('hidden');   // opens with the info card closed; tap the station name/logo to open it
    } else if (first) {
      play(first, false); openSpin(first); $('panel').classList.add('hidden');
      ctl.autoRotate = false; autoRotate = false; $('rotate').style.opacity = .5;
      setTimeout(() => {   // browsers block sound before the first tap: fall back to muted autoplay, then unmute on the first touch
        if (ytPlaying || (ytMode !== 'up' && ytMode !== 'bl')) return;
        try { if (yt && yt.mute) { yt.mute(); yt.playVideo(); muted = true; } } catch (e) {}
        tap.style.display = 'block'; tap.textContent = first === bl ? '▶ Tap to start Billy Legal Radio' : '▶ Tap to start 1UP Radio';
      }, 3500);
      setInterval(() => { if (tap.style.display !== 'none' && ytPlaying && !muted) tap.style.display = 'none'; }, 700);
    }
  }
  addEventListener('keydown', e => {
    if (/INPUT/.test(document.activeElement.tagName)) return;
    if (locked && (e.key === 'n' || e.key === 'N')) return;   // locked: no random station
    if (e.key === 'n' || e.key === 'N') $('random').click();
    if (e.key === 'f' || e.key === 'F') toggleDrawer();
    if ((e.key === 'z' || e.key === 'Z') && current) zoomTo(current);
    if (e.key === 'Escape') toggleDrawer(false);
    if (e.code === 'Space') { e.preventDefault(); $('pplay').click(); }
  });

  // ---------- search: stations (typo-tolerant), cities, countries ----------
  const fold = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/đ/g, 'd').replace(/ł/g, 'l').replace(/[^a-z0-9Ͱ-ϿЀ-ӿ一-鿿぀-ヿ가-힯]+/g, ' ').trim();
  // Greek / Cyrillic transliteration so "athina", "Αθήνα" etc. still find things
  const words = new Array(S.length), hay = new Array(S.length);
  for (let i = 0; i < S.length; i++) {
    const s = S[i]; const h = fold(s[0] + ' ' + s[16] + ' ' + s[12] + ' ' + s[4] + ' ' + (s[18] || '') + ' ' + (s[17] || '') + ' ' + (s[11] || []).map(g => G[g].name).join(' ')); hay[i] = h;
    const w = h.split(' '), nm = fold(s[0]).split(' '), extra = [];
    // glued forms so "billylegal" finds "Billy Legal ..." (pairs, triples, whole name squashed)
    for (let k = 0; k + 1 < nm.length; k++) { extra.push(nm[k] + nm[k + 1], nm[k + 1] + nm[k]); if (k + 2 < nm.length) extra.push(nm[k] + nm[k + 1] + nm[k + 2]); }
    if (nm.length > 1 && nm.length <= 6) extra.push(nm.join(''));
    words[i] = w.concat(extra);
  }
  const ccName = {}; { const cnt = {}; for (const s of S) if (s[4] && s[12]) { (cnt[s[4]] = cnt[s[4]] || {})[s[12]] = (cnt[s[4]][s[12]] || 0) + 1; } for (const c in cnt) ccName[c] = Object.entries(cnt[c]).sort((a, b) => b[1] - a[1])[0][0]; }
  const CLEAN = { 'The United States Of America': 'United States', 'The United Kingdom Of Great Britain And Northern Ireland': 'United Kingdom', 'The Russian Federation': 'Russia', 'The Netherlands': 'Netherlands', 'Korea, Republic Of': 'South Korea', 'The Republic Of Korea': 'South Korea', 'The Philippines': 'Philippines', 'The Czech Republic': 'Czechia', 'The United Arab Emirates': 'United Arab Emirates', 'Türkiye': 'Turkey' };
  for (const c in ccName) ccName[c] = CLEAN[ccName[c]] || ccName[c].replace(/^The /, '');
  const countries = Object.entries(ccName).map(([cc, name]) => ({ cc, name, f: fold(name) }));
  const ALIAS = { 'usa': 'US', 'us': 'US', 'america': 'US', 'uk': 'GB', 'england': 'GB', 'britain': 'GB', 'uae': 'AE', 'holland': 'NL', 'russia': 'RU', 'korea': 'KR', 'hellas': 'GR' };
  let cities = [];
  fetch('data/cities.json').then(r => r.json()).then(c => { cities = c.map(x => { x.f = fold(x[1] || x[0]); return x; }); refreshPoints(); }).catch(() => {});
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let min = i;
      for (let j = 1; j <= b.length; j++) { const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); cur.push(v); if (v < min) min = v; }
      if (min > max) return max + 1; prev = cur;
    }
    return prev[b.length];
  }
  // inverted index: word -> station ids, so a query only looks at stations that could match
  const vocab = new Map();
  for (let i = 0; i < S.length; i++) for (const w of new Set(words[i])) { if (!w) continue; let a = vocab.get(w); if (!a) vocab.set(w, a = []); a.push(i); }
  const vocabList = [...vocab.keys()];
  function tokenMatches(t) {   // station index -> best score for this token
    const k = t.length <= 3 ? 0 : t.length <= 5 ? 1 : 2, m = new Map();
    for (const w of vocabList) {
      let v = 0;
      if (w === t) v = 3; else if (w.startsWith(t)) v = 2.3; else if (t.length >= 3 && w.includes(t)) v = 1.6;
      else if (k && w.length >= 3 && Math.abs(w.length - t.length) <= k + 1) { const d = lev(t, w.length > t.length + 1 ? w.slice(0, t.length + 1) : w, k); if (d <= k) v = 1.5 - 0.35 * d; }
      if (!v) continue;
      for (const id of vocab.get(w)) if ((m.get(id) || 0) < v) m.set(id, v);
    }
    return m;
  }
  function searchStations(q) {
    const toks = fold(q).split(' ').filter(Boolean); if (!toks.length) return [];
    const phrase = toks.join(' '), need = toks.length === 1 ? 1.1 : toks.length * 0.8;
    const per = toks.map(tokenMatches), tot = new Map();
    for (const m of per) for (const [id, v] of m) tot.set(id, (tot.get(id) || 0) + v);
    const hits = [];
    for (const [i, sc0] of tot) {
      if (sc0 < need) continue;
      let sc = sc0;
      if (hay[i].includes(phrase)) sc += 3; if (fold(S[i][0]).startsWith(phrase)) sc += 1.5;
      sc += Math.log10(S[i][5] + 10) * 0.25 + (S[i][1] ? 0.15 : 0);
      hits.push([sc, i]);
    }
    hits.sort((a, b) => b[0] - a[0]);
    return hits.slice(0, 40).map(h => S[h[1]]);
  }
  function searchPlaces(q) {
    const f = fold(q); if (f.length < 2) return [];
    const out = [];
    for (const c of countries) {
      const al = ALIAS[f] === c.cc;
      let v = al ? 3 : c.f === f ? 3 : c.f.startsWith(f) ? 2.4 : (f.length >= 4 && lev(f, c.f.slice(0, f.length + 1), 1) <= 1) ? 1.4 : 0;
      if (v) out.push({ kind: 'country', cc: c.cc, name: c.name, score: v + 0.5 });
    }
    let n = 0;
    for (const c of cities) {
      let v = c.f === f ? 3 : c.f.startsWith(f) ? 2.2 : (f.length >= 4 && lev(f, c.f.length > f.length + 1 ? c.f.slice(0, f.length + 1) : c.f, f.length <= 5 ? 1 : 2) <= (f.length <= 5 ? 1 : 2)) ? 1.3 : 0;
      if (v) { out.push({ kind: 'city', c, name: c[0], cc: c[4], score: v + Math.log10(c[6] + 10) * 0.15 }); if (++n > 80) break; }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 5);
  }
  function placeLabel(p) { return p.kind === 'country' ? p.name : p.name + (/^[A-Z]{2}$/.test(p.c[5]) ? ', ' + p.c[5] : '') + ', ' + (ccName[p.cc] || p.cc); }
  function kmBetween(la1, lo1, la2, lo2) { const r = Math.PI / 180, dl = (la2 - la1) * r, dn = (lo2 - lo1) * r, a = Math.sin(dl / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(a)); }
  function goPlace(p) {
    if (!roloOn) { $('panel').classList.remove('hidden'); $('pdetail').classList.add('hidden'); } ctl.autoRotate = false; autoRotate = false;
    const showList = (list, title, sub) => roloOn ? rolo.showCustom(list, title) : openPanel(list, title, sub);
    if (p.kind === 'city') {
      const [nm, , la, lo] = p.c; const radius = p.c[6] > 2e6 ? 60 : p.c[6] > 4e5 ? 40 : 25;
      const list = shown.filter(s => Math.abs(s[2] - la) < 1.5 && kmBetween(s[2], s[3], la, lo) <= radius).sort((a, b) => b[5] - a[5]);
      setScope({ label: nm, test: s => s[2] != null && Math.abs(s[2] - la) < 1.5 && kmBetween(s[2], s[3], la, lo) <= radius });
      showList(list, 'Stations near ' + nm, placeLabel(p) + ' · within ' + radius + ' km · ' + list.length + ' found');
      globe.pointOfView({ lat: la, lng: lo, altitude: radius > 50 ? 0.3 : 0.2 }, 1500);
    } else {
      const list = shown.filter(s => s[4] === p.cc).sort((a, b) => b[5] - a[5]);
      setScope({ label: p.name, test: s => s[4] === p.cc });
      showList(list, 'Stations in ' + p.name, list.length + ' found' + (filter.kind !== 'all' || band >= 0 || favOnly || playableOnly ? ' with current filters' : ''));
      const all = S.filter(s => s[4] === p.cc); let la = 0, lo = 0;
      if (all.length) { const m = a => a.sort((x, y) => x - y)[a.length >> 1]; la = m(all.map(s => s[2])); lo = m(all.map(s => s[3])); const sp = Math.max(...all.map(s => Math.abs(s[2] - la)).sort((x, y) => x - y).slice(0, Math.ceil(all.length * .9)).slice(-1), 1); globe.pointOfView({ lat: la, lng: lo, altitude: Math.min(2.2, Math.max(0.35, sp / 14)) }, 1600); }
    }
  }
  function searchGenres(q) { const f = fold(q); if (f.length < 2) return []; return G.filter(g => fold(g.name).includes(f) || fold(g.family).startsWith(f)).sort((x, y) => (fold(y.name).startsWith(f) - fold(x.name).startsWith(f)) || y.n - x.n).slice(0, 6); }
  function searchLive(q) {
    const toks = fold(q).split(' ').filter(Boolean); if (!toks.length) return [];
    return (liveData.items || []).filter(r => { const h = fold([r.title, r.dj, r.channel, r.place, r.q].filter(Boolean).join(' ')); return toks.every(t => h.includes(t)); }).sort((x, y) => (y.views || 0) - (x.views || 0)).slice(0, 8);
  }
  function searchDJs(q) {
    const out = []; for (const src of ['twitch', 'kick', 'tiktok', 'instagram', 'soundcloud', 'facebook', 'youtube']) {
      const m = allDJs().filter(d => d.src === src && matchQ(q, d.name, d.id)).map(d => Object.assign({ live: liveOfDJ(d) }, d)).sort((x, y) => (y.live ? 1 : 0) - (x.live ? 1 : 0) || x.name.localeCompare(y.name)).slice(0, 6);
      out.push(...m);
    } return out;
  }
  // ---------- 🎧 DJ Mixes (first entry under Electronic): live DJ sets right now + every DJ's latest mixes ----------
  const djLive = () => ytLive().filter(r => r.dj || (r.fam || []).includes('Electronic')).sort((x, y) => (y.views || 0) - (x.views || 0)).slice(0, 30)
    .concat((socialData.items || []).filter(r => r.dj || /^(DJs|Live DJ)$/i.test(r.cat || '')).sort((x, y) => (y.viewers || 0) - (x.viewers || 0)).slice(0, 30));
  function djMixCount() { return djLive().length + (djProf.djs || []).reduce((n, p) => n + (p.mixes || []).length, 0); }
  function openDJMixes() { djOpen = true; liveOpen = false; renderDJMixes(); $('panel').classList.remove('hidden'); }
  function renderDJMixes() {
    const live = djLive(), profs = djProf.djs || [];
    $('ptitle').textContent = '🎧 DJ Mixes'; $('psub').textContent = live.length + ' live now · ' + profs.length + ' DJs'; $('panel').classList.remove('single'); $('pdetail').classList.remove('hidden');
    $('pdetail').innerHTML = '<div id="livewatch">' + (watching ? watchHTML(watching) : '') + '</div>';
    const rowOf = r => {
      const src = r.src || 'youtube', th = src === 'youtube' ? 'https://i.ytimg.com/vi/' + esc(r.id) + '/mqdefault.jpg' : esc(r.thumb || '');
      const m = [r.dj || r.channel, (src === 'youtube' ? r.views : r.viewers) ? (src === 'youtube' ? r.views : r.viewers).toLocaleString() + ' watching' : '', { youtube: 'YouTube', twitch: 'Twitch', kick: 'Kick' }[src] || src].filter(Boolean).join(' · ');
      return '<div class="row lrow" data-v="' + esc(src + ':' + r.id) + '"><img class="lth" loading="lazy" src="' + th + '" onerror="this.style.visibility=\'hidden\'"><div class="t"><div class="n">' + esc(r.title) + '</div><div class="m">' + esc(m) + '</div></div></div>';
    };
    let html = live.length ? '<div class="shead">🔴 Live DJ sets right now · ' + live.length + '</div>' + live.map(rowOf).join('') : '<div class="lempty">No DJ sets are live right now.</div>';
    for (const p of profs) {
      html += '<div class="shead">' + esc(p.name) + (p.city ? ' · ' + esc(p.city) : '') + ((p.live || []).length ? ' · 🔴 LIVE' : '') + '</div><div class="row djcard"><div class="t"><div class="sa">' +
        Object.entries(p.links || {}).map(([k, u]) => '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(k[0].toUpperCase() + k.slice(1)) + '</a>').join('') + '</div>' +
        ((p.mixes || []).length ? '<div class="djmix"><div class="m">Latest mixes &amp; live sets</div>' + p.mixes.slice(0, 10).map(m => '<a href="' + esc(m.url) + '" target="_blank" rel="noopener">' + (m.live ? '🔴 ' : '♫ ') + esc(m.title) + '</a>').join('') + '</div>' : '') + '</div></div>';
    }
    html += '<div class="lempty">Search any DJ name in the top bar to find their profile, mixes and live sets.</div>';
    $('plist').innerHTML = html; panelList = [];
  }
  const searchProfiles = q => (djProf.djs || []).filter(p => matchQ(q, p.name, (p.aka || []).join(' '))).slice(0, 3);
  const runSearch = q => { sres = { places: searchPlaces(q), stations: searchStations(q), genres: searchGenres(q), live: searchLive(q), djs: searchDJs(q), profs: searchProfiles(q), q }; renderSearch(); for (const p of sres.profs) if (p.photo) spawnDJSticker(p); };
  let st, sres = { places: [], stations: [] };
  function renderSearch() {
    const box = $('sresults'); let html = '';
    for (const p of (sres.profs || [])) {
      const NM = { instagram: 'Instagram', twitch: 'Twitch', tiktok: 'TikTok', soundcloud: 'SoundCloud', facebook: 'Facebook', youtube: 'YouTube', kick: 'Kick', website: 'Website' }, q = encodeURIComponent(p.name);
      const live = src => (p.live || []).find(l => l.src === src);
      html += '<div class="shead">DJ · ' + esc([p.city, p.genre].filter(Boolean).join(' · ')) + '</div><div class="row djcard"><div class="t"><div class="n">' + esc(p.name) + ((p.live || []).length ? ' <span style="color:#ff5a5f">● LIVE NOW</span>' : '') + '</div><div class="sa">' +
        Object.entries(p.links || {}).map(([k, u]) => '<a href="' + esc(u) + '" target="_blank" rel="noopener"' + (live(k) ? ' style="border-color:#ff5a5f;color:#ff8f93"' : '') + '>' + (live(k) ? '🔴 ' : '') + (NM[k] || k) + (live(k) ? ' LIVE' : '') + '</a>').join('') +
        (p.links && p.links.youtube ? '' : '<a href="https://www.youtube.com/results?search_query=' + q + '+live+mix" target="_blank" rel="noopener">▶ YouTube mixes</a>') +
        '</div>' + ((p.mixes || []).length ? '<div class="djmix"><div class="m">Latest mixes &amp; live sets</div>' + p.mixes.slice(0, 8).map(m => '<a href="' + esc(m.url) + '" target="_blank" rel="noopener">' + (m.live ? '🔴 ' : '♫ ') + esc(m.title) + '</a>').join('') + '</div>' : '') + '</div></div>';
    }
    if ((sres.genres || []).length) html += '<div class="shead">Genres</div>' + sres.genres.map((g, i) => '<div class="row place" data-g="' + i + '"><div class="ph tile" style="background:' + (FAMCOL[g.family] || '#2b4a63') + '">♪</div><div class="t"><div class="n">' + esc(g.name) + '</div><div class="m">' + esc(g.family) + ' · ' + g.n + ' stations</div></div></div>').join('');
    if ((sres.live || []).length) html += '<div class="shead">DJs &amp; live sets</div>' + sres.live.map((r, i) => '<div class="row lrow" data-l="' + i + '"><img class="lth" loading="lazy" src="https://i.ytimg.com/vi/' + esc(r.id) + '/mqdefault.jpg" onerror="this.style.visibility=\'hidden\'"><div class="t"><div class="n">' + esc(r.title) + '</div><div class="m">' + esc([r.dj || r.channel, r.place, r.kind === 'live' ? 'LIVE' : '24/7'].filter(Boolean).join(' · ')) + '</div></div></div>').join('');
    if ((sres.djs || []).length) { const names = { twitch: 'Twitch', kick: 'Kick', tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube', soundcloud: 'SoundCloud', facebook: 'Facebook' }; let last = '';
      sres.djs.forEach((d, i) => { if (d.src !== last) { last = d.src; html += '<div class="shead">DJs · ' + names[d.src] + '</div>'; }
        html += '<div class="row lrow" data-d="' + i + '"><div class="ph tile" style="background:#2b4a63">' + esc((d.name || '?').slice(0, 1).toUpperCase()) + '</div><div class="t"><div class="n">' + esc(d.name) + (d.live ? ' <span style="color:#ff5a5f">● LIVE</span>' : '') + '</div><div class="m">' + esc(d.live ? (d.live.title || '') + (d.live.viewers ? ' · ' + d.live.viewers.toLocaleString() + ' watching' : '') : names[d.src] + ' · open profile ↗') + '</div></div></div>'; }); }
    if ((sres.q || '').length >= 3) { const e = encodeURIComponent(sres.q); html += '<div class="shead">Look up “' + esc(sres.q) + '” mixes online</div><div class="row mixrow"><div class="t"><div class="sa">' +
      '<a href="https://www.youtube.com/results?search_query=' + e + '+live+mix" target="_blank" rel="noopener">▶ YouTube mixes</a><a href="https://www.youtube.com/results?search_query=' + e + '&sp=EgJAAQ%253D%253D" target="_blank" rel="noopener">🔴 YouTube LIVE</a>' +
      '<a href="https://www.mixcloud.com/search/?mixcloud_query=' + e + '" target="_blank" rel="noopener">Mixcloud</a><a href="https://soundcloud.com/search?q=' + e + '" target="_blank" rel="noopener">SoundCloud</a>' +
      '<a href="https://www.twitch.tv/search?term=' + e + '" target="_blank" rel="noopener">Twitch</a><a href="https://kick.com/search?searchable=' + e + '" target="_blank" rel="noopener">Kick</a><a href="https://www.tiktok.com/search/live?q=' + e + '" target="_blank" rel="noopener">TikTok LIVE</a></div></div></div>'; }
    if (sres.places.length) html += '<div class="shead">Places</div>' + sres.places.map((p, i) => '<div class="row place" data-p="' + i + '"><div class="ph tile" style="background:#2b4a63">' + (p.kind === 'country' ? '🌐' : '📍') + '</div><div class="t"><div class="n">' + esc(p.name) + '</div><div class="m">' + esc(p.kind === 'country' ? 'Country' : placeLabel(p).slice(p.name.length + 2)) + ' · show stations here</div></div></div>').join('');
    if (sres.stations.length) html += '<div class="shead">Stations</div>' + sres.stations.map((s, i) => rowHTML(s, i)).join('');
    if (!html) html = '<div class="row"><div class="t"><div class="n">No matches</div><div class="m">Try fewer letters, a genre, DJ, city or country</div></div></div>';
    box.innerHTML = html; box.classList.remove('hidden');
  }
  $('ssearch').addEventListener('input', e => {
    clearTimeout(st); const q = e.target.value.trim();
    if (q.length < 2) { $('sresults').classList.add('hidden'); return; }
    st = setTimeout(() => runSearch(q), 140);
  });
  $('ssearch').addEventListener('keydown', e => { if (e.key === 'Enter') { const r = $('sresults').querySelector('.row'); if (r) r.click(); } if (e.key === 'Escape') $('sresults').classList.add('hidden'); });
  $('sresults').addEventListener('click', e => {
    if (starClick(e)) return;
    if (e.target.closest('.mixrow') || e.target.closest('.djcard')) return;   // the link-outs open by themselves
    const r = e.target.closest('.row'); if (!r) return;
    $('sresults').classList.add('hidden');
    if (r.dataset.p !== undefined) { goPlace(sres.places[+r.dataset.p]); return; }
    if (r.dataset.g !== undefined) { const g = sres.genres[+r.dataset.g]; filter = { kind: 'genre', id: G.indexOf(g) }; applyFilter(); showGenreList(g.name); return; }
    if (r.dataset.l !== undefined) { liveWatch(sres.live[+r.dataset.l]); return; }
    if (r.dataset.d !== undefined) { const d = sres.djs[+r.dataset.d]; if (d.live && d.src !== 'tiktok') { liveTab = d.src === 'twitch' ? 'tw' : d.src === 'kick' ? 'kick' : 'yt'; liveWatch(d.live); } else window.open(profileURL(d.src, d.id), '_blank', 'noopener'); return; }
    if (r.dataset.i === undefined) return;
    const s = sres.stations[+r.dataset.i]; randomMode = false; setScope(null); if (roloOn) { rolo.reveal(s); return; } play(s, true); openPanel([s], s[0], s[12] || '');
  });
  document.addEventListener('click', e => { if (!e.target.closest('#searchwrap') && !e.target.closest('#gsearch')) $('sresults').classList.add('hidden'); });


  // ---------- Rolodex view: every station as a logo card on a flick-able 3D wheel, with an A-Z bar ----------
  const rolo = (() => {
    const el = document.createElement('div'); el.id = 'rolo'; el.className = 'hidden';
    el.innerHTML = '<div id="roloHead"><b>Rolodex</b><span id="roloCnt"></span><button id="roloClear" class="hidden" title="Show all stations again">✕ Show all</button></div><div id="roloStage"></div><div id="roloScroll"><div id="roloSpacer"></div></div><div id="roloAz"></div><div id="roloBubble"></div>';
    document.body.appendChild(el);
    const sc = $('roloScroll'), stage = $('roloStage'), sp = $('roloSpacer'), az = $('roloAz'), bub = $('roloBubble');
    const LET = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    az.innerHTML = LET.map(l => '<span data-l="' + l + '">' + l + '</span>').join('');
    let src = null, custom = null, customLabel = '', list = [], starts = {}, keyL = [], pool = new Map(), H = 78, VH = 400, snapT = 0, snapping = false, open = false;
    const letterOf = k => { const c = k.charAt(0); return c >= 'a' && c <= 'z' ? c.toUpperCase() : '#'; };
    function build() {
      const base = custom || shown; if (src === base) return; src = base;
      const keys = new Map(); for (const s of base) keys.set(s, fold(s[0]));
      list = base.slice().sort((x, y) => { const a = keys.get(x), b = keys.get(y), la = letterOf(a), lb = letterOf(b); return la === lb ? (a < b ? -1 : a > b ? 1 : 0) : la === '#' ? -1 : lb === '#' ? 1 : la < lb ? -1 : 1; });
      starts = {}; keyL = list.map(s => letterOf(keys.get(s))); keyL.forEach((l, i) => { if (!(l in starts)) starts[l] = i; });
      az.querySelectorAll('span').forEach(e => e.classList.toggle('off', !(e.dataset.l in starts)));
      $('roloCnt').textContent = (custom ? customLabel + ' · ' : '') + list.length.toLocaleString() + ' stations · A–Z'; $('roloClear').classList.toggle('hidden', !custom);
      pool.forEach(e => e.remove()); pool.clear();
      sp.style.height = Math.max(1, list.length * H + VH - H) + 'px';
    }
    function mk(i) {
      const s = list[i], d = document.createElement('div'); d.className = 'rc';
      d.innerHTML = '<div class="rlogo">' + logo(s, 'rl') + '</div><div class="rt"><div class="rn">' + esc(s[0]) + '</div><div class="rm">' + esc([s[12], (s[11] || []).slice(0, 2).map(g => G[g].name).join(', '), s[1] ? '' : 'no stream'].filter(Boolean).join(' · ')) + '</div></div><div class="rp">▶</div>';
      return d;
    }
    function render() {
      if (!open || !list.length) return;
      const top = sc.scrollTop, c = top / H, lo = Math.max(0, Math.floor(c - VH / H / 2) - 3), hi = Math.min(list.length - 1, Math.ceil(c + VH / H / 2) + 3);
      pool.forEach((e, i) => { if (i < lo || i > hi) { e.remove(); pool.delete(i); } });
      for (let i = lo; i <= hi; i++) {
        let e = pool.get(i); if (!e) { e = mk(i); stage.appendChild(e); pool.set(i, e); }
        const d = i - c, ad = Math.min(Math.abs(d), 4);
        e.style.transform = 'translateY(' + (VH / 2 + d * H - H / 2) + 'px) translateZ(' + (-ad * 40) + 'px) rotateX(' + (Math.max(-3.5, Math.min(3.5, d)) * -12) + 'deg)';
        e.style.opacity = Math.max(0.12, 1 - ad * 0.2);
        e.classList.toggle('mid', Math.abs(d) < 0.5); e.classList.toggle('now', list[i] === current);
      }
      const l = keyL[Math.max(0, Math.min(list.length - 1, Math.round(c)))];
      az.querySelectorAll('span.on').forEach(e => e.classList.remove('on')); const t = az.querySelector('[data-l="' + l + '"]'); if (t) t.classList.add('on');
    }
    function size() { VH = sc.clientHeight || 400; H = innerWidth <= 820 ? 70 : 80; if (VH < 380) H -= 14; el.style.setProperty('--rh', (H - 10) + 'px'); sp.style.height = Math.max(1, list.length * H + VH - H) + 'px'; }
    const goTo = (i, smooth) => { i = Math.max(0, Math.min(list.length - 1, i)); snapping = true; sc.scrollTo({ top: i * H, behavior: smooth ? 'smooth' : 'auto' }); setTimeout(() => snapping = false, smooth ? 400 : 30); };
    let lastTouch = 0, playT = 0;
    sc.addEventListener('scroll', () => {
      if (Date.now() - lastTouch < 3000) { clearTimeout(playT); playT = setTimeout(() => { const s = list[Math.round(sc.scrollTop / H)]; if (open && s && s !== current) { randomMode = false; play(s, false); render(); } }, 250); }
    }, { passive: true });
    sc.addEventListener('scroll', () => {
      render(); if (snapping) return; clearTimeout(snapT);
      snapT = setTimeout(() => { const i = Math.round(sc.scrollTop / H); if (Math.abs(sc.scrollTop - i * H) > 2) goTo(i, true); }, 140);
    }, { passive: true });
    sc.addEventListener('click', e => {
      const y = e.clientY - sc.getBoundingClientRect().top, i = Math.round(sc.scrollTop / H + (y - VH / 2) / H);
      if (i < 0 || i >= list.length) return;
      const s = list[i], mid = Math.round(sc.scrollTop / H);
      if (i === mid && s === current) {   // touching the playing card again opens / closes its full info
        const pn = $('panel');
        if (!pn.classList.contains('hidden') && pn.classList.contains('single')) pn.classList.add('hidden'); else { openPanel([s], s[0], s[12] || ''); detail(s); }
        return;
      }
      randomMode = false; if (i === mid) { play(s, false); render(); } else goTo(i, true);   // other cards: scroll there, and it plays when the wheel stops
    });
    const jump = e => {
      const r = az.getBoundingClientRect(), k = Math.max(0, Math.min(LET.length - 1, Math.floor((e.clientY - r.top) / r.height * LET.length)));
      let l = LET[k]; if (!(l in starts)) { for (let j = k; j < LET.length; j++) if (LET[j] in starts) { l = LET[j]; break; } }
      if (!(l in starts)) return; bub.textContent = l; bub.classList.add('on'); goTo(starts[l], false);
    };
    az.addEventListener('pointerdown', e => { lastTouch = Date.now(); az.setPointerCapture(e.pointerId); jump(e); e.preventDefault(); });
    az.addEventListener('pointermove', e => { if (az.hasPointerCapture(e.pointerId)) { lastTouch = Date.now(); jump(e); } });
    az.addEventListener('pointerup', () => { bub.classList.remove('on'); });
    az.addEventListener('pointercancel', () => { bub.classList.remove('on'); });
    const onResize = () => { if (!open) return; const i = Math.round(sc.scrollTop / H); size(); sc.scrollTop = i * H; render(); };
    addEventListener('resize', onResize); try { new ResizeObserver(onResize).observe(el); } catch (e) {}
    audio.addEventListener('playing', () => render());
    ['pointerdown', 'wheel', 'touchstart'].forEach(ev => sc.addEventListener(ev, () => { lastTouch = Date.now(); }, { passive: true }));
    audio.addEventListener('loadstart', () => { if (open && !snapping && Date.now() - lastTouch > 4000 && current) { const i = list.indexOf(current); if (i >= 0) goTo(i, true); } });
    function toggle(on) {
      open = on === undefined ? !open : on;
      try { localStorage.setItem('rg-rolo', open ? '1' : '0'); } catch (e) {}
      el.classList.toggle('hidden', !open); roloOn = open; setSpaced(open ? true : spaced); document.body.classList.toggle('rolo-on', open);
      if (!open) return;
      $('panel').classList.add('hidden'); build(); size(); sp.style.height = Math.max(1, list.length * H + VH - H) + 'px';
      const i = current ? list.indexOf(current) : -1; goTo(i >= 0 ? i : 0, false); render();
    }
    addEventListener('keydown', e => { if (!open || /INPUT/.test(document.activeElement.tagName)) return; if (e.key === 'Escape') toggle(false); if (e.key === 'ArrowDown') { goTo(Math.round(sc.scrollTop / H) + 1, true); e.preventDefault(); } if (e.key === 'ArrowUp') { goTo(Math.round(sc.scrollTop / H) - 1, true); e.preventDefault(); } if (e.key === 'Enter') { const s = list[Math.round(sc.scrollTop / H)]; if (s) play(s, false); } });
    // Random while in the Rolodex: spin the wheel down to the chosen station, then play it
    function spinTo(s, done) {
      build(); const i = list.indexOf(s); if (i < 0) { done(); return; }
      if (s !== current) play(s, false);   // start buffering the stream right now, while the wheel is still spinning
      const from = sc.scrollTop, to = i * H, t0 = performance.now(), dur = Math.min(1300, 600 + Math.abs(to - from) / H * 3);
      snapping = true; clearTimeout(snapT);
      const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); sc.scrollTop = from + (to - from) * e; if (k < 1) requestAnimationFrame(step); else { snapping = false; render(); done(); } };
      requestAnimationFrame(step);
    }
    $('roloClear').onclick = () => { setScope(null); custom = null; src = null; build(); size(); goTo(0, false); render(); };
    // show only a set of stations (a searched city / country) in the wheel, A-Z
    function showCustom(l, label) { custom = l; customLabel = label; src = null; build(); size(); sp.style.height = Math.max(1, list.length * H + VH - H) + 'px'; goTo(0, false); render(); }
    // search result for one station: bring it to the front of the wheel and play it (no info card until it's touched)
    function reveal(s) { randomMode = false; if (list.indexOf(s) < 0) { custom = null; src = null; build(); size(); } spinTo(s, () => {}); }
    // at launch: wheel starts at the top, then spins down to the opening station and plays it
    function intro() { if (!open || !current) return; build(); const i = list.indexOf(current); if (i < 0) return; sc.scrollTop = 0; render(); spinTo(current, () => { if (audio.paused) play(current, false); }); }
    return { intro, spinTo, showCustom, reveal, isOpen: () => open, refresh() { setScope(null); custom = null; if (open) { src = null; build(); size(); goTo(0, false); render(); } else src = null; }, toggle };
  })();
  // (always opens in Earth view on every device; Rolodex only when you pick it)
  { const af = applyFilter; applyFilter = function () { af.apply(this, arguments); rolo.refresh(); }; }

  // ---------- now playing (song titles read from the stream) + saved songs ----------
  const np = { title: '', sid: '', vid: '', dead: new Set() };
  async function icyTitle(url) {   // classic Shoutcast/Icecast in-stream metadata (works where the station allows browser access)
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 7000);
    try {
      const r = await fetch(url, { headers: { 'Icy-MetaData': '1' }, signal: ac.signal, cache: 'no-store' });
      const mi = +r.headers.get('icy-metaint'); if (!mi) return null;
      const rd = r.body.getReader(); let buf = new Uint8Array(0);
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        const n = new Uint8Array(buf.length + value.length); n.set(buf); n.set(value, buf.length); buf = n;
        if (buf.length > mi) { const len = buf[mi] * 16; if (buf.length >= mi + 1 + len) { const txt = new TextDecoder().decode(buf.subarray(mi + 1, mi + 1 + len)); const m = txt.match(/StreamTitle='([^]*?)';/); return m ? m[1].trim() : ''; } }
        if (buf.length > mi + 4200) break;
      }
      return '';
    } catch (e) { return null; } finally { clearTimeout(to); ac.abort(); }
  }
  async function icecastTitle(url) {   // Icecast servers often also publish /status-json.xsl
    try {
      const u = new URL(url), ac = new AbortController(), to = setTimeout(() => ac.abort(), 5000);
      const r = await fetch(u.origin + '/status-json.xsl', { cache: 'no-store', signal: ac.signal }); clearTimeout(to);
      const j = await r.json(); let src = j.icestats && j.icestats.source; if (!src) return null; if (!Array.isArray(src)) src = [src];
      const m = src.find(x => (x.listenurl || '').endsWith(u.pathname)) || (src.length === 1 ? src[0] : null); if (!m) return null;
      return String(m.title || m.yp_currently_playing || '').trim();
    } catch (e) { return null; }
  }
  const cleanTitle = (t, s) => { t = (t || '').replace(/\s+/g, ' ').replace(/^[-–\s]+|[-–\s]+$/g, ''); return t.length < 3 || t.toLowerCase() === s[0].toLowerCase() ? '' : t; };
  function npSet(t) { const ts = performance.now(); if ((t || '') !== np.title) lyr.prevSeen = lyr.seenAt || ts; lyr.seenAt = ts; np.title = t || ''; $('pnow').textContent = np.title ? '♪ ' + np.title : ''; $('saveSong').classList.toggle('ready', !!np.title); try { audio.dispatchEvent(new Event('npchange')); } catch (e) {} try { lyricsFor(np.title); } catch (e) {} }
  async function npPoll() {
    const s = current;
    if (s && (isUP(s) || isBL(s))) {   // YouTube-based radios know their own song
      np.sid = s[13]; np.vid = ytNow.sid === s[13] ? ytNow.id : '';
      npSet(ytNow.sid === s[13] ? cleanTitle(ytNow.t.replace(/\s*[\(\[](official|lyrics?|audio|video|hd|hq|music)[^\)\]]*[\)\]]/gi, ''), s) : ''); return;
    }
    np.vid = '';
    if (!s || !s[1] || ytOn || audio.paused || /\.m3u8(\?|$)/i.test(s[1])) return;
    if (np.sid !== s[13]) { np.sid = s[13]; npSet(''); }
    if (np.dead.has(s[13])) return;
    let t = await icyTitle(s[1]); if (t === null) t = await icecastTitle(s[1]);
    if (current !== s) return;
    if (t === null) { np.dead.add(s[13]); return; }   // this station publishes nothing readable from a browser
    npSet(cleanTitle(t, s));
  }
  setInterval(npPoll, 20000);
  audio.addEventListener('loadstart', () => { np.sid = ''; npSet(''); });
  audio.addEventListener('playing', () => setTimeout(npPoll, 600));

  let songs = []; try { songs = JSON.parse(localStorage.getItem('rg-songs') || '[]'); } catch (e) {}
  const saveSongs = () => { try { localStorage.setItem('rg-songs', JSON.stringify(songs)); } catch (e) {} $('songsN').textContent = songs.length; };
  $('songsN').textContent = songs.length;
  async function saveSong() {
    const s = current; if (!s) return;
    $('saveSong').classList.add('busy'); await npPoll(); $('saveSong').classList.remove('busy');
    if (!np.title && (isUP(s) || isBL(s))) for (let i = 0; i < 8 && !np.title && current === s; i++) { await new Promise(r => setTimeout(r, 500)); await npPoll(); }   // the YouTube radios may still be tuning in
    const t = current === s ? np.title : ''; 
    if (!t) { toast(np.dead.has(s[13]) ? "This station doesn't share song titles" : 'No song title right now — try again in a moment'); return; }
    if (songs.some(x => x.t === t && x.sid === s[13])) { toast('Already saved'); return; }
    songs.unshift({ t, st: s[0], sid: s[13], cc: s[12] || '', ts: Date.now(), vid: current === s ? np.vid : '' }); saveSongs(); toast('🎵 Saved: ' + t); lookupMissing(); if (!$('songs').classList.contains('hidden')) renderSongs();
  }
  $('saveSong').onclick = saveSong;
  const q = encodeURIComponent;
  // ---- which music services carry a saved song (Apple Music via iTunes search, Deezer via its search API; both free, no account) ----
  const swords = t => (t || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\b(feat|ft|featuring|remaster(ed)?|radio edit|original mix|mix|version|edit|official|video|audio|lyrics?)\b/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  // exact-song check: the artist must match AND the title must match (so "Billy Legal - X" never matches "Billy Vaughn - X")
  const splitT = t => { const i = t.indexOf(' - '); return i > 0 ? [t.slice(0, i), t.slice(i + 3)] : ['', t]; };
  const inter = (x, y) => x.filter(w => y.includes(w)).length;
  function matchOne(A, T, cA, cT) {
    if (!T.length || !cT.length) return false;
    if (inter(T, cT) / T.length < 0.8 || inter(cT, T) / cT.length < 0.6) return false;
    return !A.length || inter(A, cA) / Math.min(A.length, cA.length || 1) >= 0.7;
  }
  function sameSong(saved, cArtist, cTrack) {
    const p = splitT(saved), A = swords(p[0]), T = swords(p[1]), cA = swords(cArtist), cT = swords(cTrack);
    return matchOne(A, T, cA, cT) || (A.length && matchOne(T, A, cA, cT));   // second try: station sent "Title - Artist"
  }
  const jsonp = u => new Promise(res => { const cb = 'rgjp' + Math.random().toString(36).slice(2), s = document.createElement('script'); const done = d => { clearTimeout(tm); delete window[cb]; s.remove(); res(d); }; const tm = setTimeout(() => done(null), 7000); window[cb] = done; s.onerror = () => done(null); s.src = u + '&output=jsonp&callback=' + cb; document.head.appendChild(s); });
  // links.apple / links.deezer: URL = found, '' = checked and not there, undefined = could not check yet
  async function findLinks(title, prev) {
    const plain = title.replace(/\s+-\s+/, ' '), links = Object.assign({}, prev || {});
    if (links.apple === undefined) for (let k = 0; k < 2 && links.apple === undefined; k++) {
      try { const r = await (await fetch('https://itunes.apple.com/search?media=music&entity=song&limit=8&term=' + q(plain))).json(); const m = (r.results || []).find(x => sameSong(title, x.artistName, x.trackName)); links.apple = m ? m.trackViewUrl.replace(/[?&]uo=\d+/, '') : ''; } catch (e) { await new Promise(r => setTimeout(r, 1200)); }
    }
    if (links.deezer === undefined) {
      try { const d = await jsonp('https://api.deezer.com/search?limit=8&q=' + q(plain)); if (d && d.data) { const m = d.data.find(x => sameSong(title, x.artist.name, x.title_short || x.title)); links.deezer = m ? m.link : ''; } } catch (e) {}
    }
    return links;
  }
  let lookingUp = false;
  async function lookupMissing() {
    if (lookingUp) return; lookingUp = true;
    try { for (const x of songs.slice()) { if (x.lv !== 2) { x.links = {}; x.tries = 0; x.lv = 2; } const l0 = x.links || {};
        if (x.chk && Date.now() - x.chk > 864e5 && (l0.apple === '' || l0.deezer === '')) { if (l0.apple === '') l0.apple = undefined; if (l0.deezer === '') l0.deezer = undefined; x.tries = 0; x.chk = 0; } if (l0.apple !== undefined && l0.deezer !== undefined) continue; if ((x.tries || 0) >= 3) continue; x.tries = (x.tries || 0) + 1; x.links = await findLinks(x.t, x.links); if (x.links.apple !== undefined && x.links.deezer !== undefined) x.chk = Date.now(); saveSongs(); if (!$('songs').classList.contains('hidden')) renderSongs(); await new Promise(r => setTimeout(r, 500)); } } finally { lookingUp = false; }
  }
  function renderSongs() {
    $('songsCount').textContent = songs.length;
    $('songsList').innerHTML = songs.length ? songs.map((x, i) => '<div class="srow" data-i="' + i + '"><div class="st"><div class="sn">' + esc(x.t) + '</div><div class="sm">' + esc([x.st, x.cc, new Date(x.ts).toLocaleDateString()].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="sa"><a class="found" href="' + (x.vid ? 'https://www.youtube.com/watch?v=' + x.vid : 'https://www.youtube.com/results?search_query=' + q(x.t)) + '" target="_blank" rel="noopener">YouTube' + (x.vid ? ' ✓' : ' ⌕') + '</a>' +
      (x.links && x.links.apple ? '<a class="found" href="' + esc(x.links.apple) + '" target="_blank" rel="noopener">Apple ✓</a>' : '') + (x.links && x.links.deezer ? '<a class="found" href="' + esc(x.links.deezer) + '" target="_blank" rel="noopener">Deezer ✓</a>' : '') +
      '<a class="found" href="https://open.spotify.com/search/' + q(x.t) + '" target="_blank" rel="noopener" title="Search Spotify">Spotify ⌕</a><a class="found" href="https://music.youtube.com/search?q=' + q(x.t) + '" target="_blank" rel="noopener" title="Search YouTube Music">YT Music ⌕</a><a class="found" href="https://music.amazon.com/search/' + q(x.t) + '" target="_blank" rel="noopener" title="Search Amazon Music">Amazon ⌕</a><a class="found" href="https://listen.tidal.com/search?q=' + q(x.t) + '" target="_blank" rel="noopener" title="Search Tidal">Tidal ⌕</a>' +
      (x.links && x.links.apple !== undefined && x.links.deezer !== undefined ? (x.links.apple || x.links.deezer ? '' : '<span class="snf">not found on Apple or Deezer</span>') : '<span class="snf">checking Apple &amp; Deezer…</span>') + '<button data-a="tune">📻 Station</button></div></div>' +
      '<button class="sdel" data-a="del" title="Remove">✕</button></div>').join('') : '<div class="fempty">No songs saved yet.<br>Tap 🎵 in the player bar while a song with a title is playing.</div>';
  }
  const songsOpen = on => { $('songs').classList.toggle('hidden', !on); $('songsTop').classList.toggle('on', on); if (on) { renderSongs(); lookupMissing(); } };
  setTimeout(lookupMissing, 4000);
  $('songsTop').onclick = () => songsOpen($('songs').classList.contains('hidden'));
  $('songsClose').onclick = () => songsOpen(false);
  $('songsCopy').onclick = () => { if (songs.length) copy(songs.map(x => x.t + '  [' + x.st + (x.cc ? ', ' + x.cc : '') + ']').join('\n'), 'Song list'); };
  $('songsDl').onclick = () => {
    if (!songs.length) return; const csv = 'Song,Station,Country,Saved\n' + songs.map(x => [x.t, x.st, x.cc, new Date(x.ts).toISOString().slice(0, 10)].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); el.download = 'my-radio-songs.csv'; el.click(); setTimeout(() => URL.revokeObjectURL(el.href), 2000);
  };
  $('songsList').addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'); if (!b) return; const i = +b.closest('.srow').dataset.i, x = songs[i]; if (!x) return;
    if (b.dataset.a === 'del') { songs.splice(i, 1); saveSongs(); renderSongs(); }
    else { const st = S.find(z => z[13] === x.sid); if (st) { randomMode = false; play(st, false); toast('Tuning to ' + st[0]); } }
  });
  // ---------- genre sidebar ----------
  const fams = [...new Set(G.map(g => g.family))].sort((a, b) => (a === 'Other') - (b === 'Other') || a.localeCompare(b, undefined, { sensitivity: 'base' }));   // A-Z, 'Other' last
  { const ci = fams.indexOf('Country, Folk & Roots'), ri = fams.indexOf('Reggae & Caribbean'); if (ci >= 0 && ri >= 0) { fams.splice(ci, 1); fams.splice(fams.indexOf('Reggae & Caribbean') + 1, 0, 'Country, Folk & Roots'); } }   // Billy: Country, Folk & Roots sits right below Reggae & Caribbean
  function buildGenres(q) {
    q = (q || '').toLowerCase(); let html = '<div class="allrow"><button id="allbtn" class="allbtn' + (filter.kind === 'all' && !lyricsOnly ? ' on' : '') + '">🌍 All stations<small>' + S.length.toLocaleString() + '</small></button><button id="lyrbtn" class="allbtn' + (lyricsOnly ? ' on' : '') + '" title="Only stations playing a song with lyrics right now">🎤 Lyric stations<small>' + (lyricSet.size ? lyricSet.size + ' now' : '…') + '</small></button></div>';
    for (const f of fams) {
      const gs = G.filter(g => g.family === f && (!q || g.name.toLowerCase().includes(q)));
      if (!gs.length) continue;
      const fn = gs.reduce((a, g) => a + g.n, 0);
      const djChip = f === 'Electronic' && (!q || 'dj mixes'.includes(q)) ? '<span class="chip dj" data-dj="1">🎧 DJ Mixes<small>' + djMixCount() + '</small></span>' : '';
      html += '<div class="fam' + (q ? ' open' : '') + '"><div class="fh" data-fam="' + esc(f) + '"><span class="dot" style="background:' + FAMCOL[f] + '"></span>' + esc(f) + '<span class="caret">›</span></div><div class="gl">' + djChip +
        gs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })).map(g => '<span class="chip' + (filter.kind === 'genre' && filter.id === g.id ? ' on' : '') + '" data-g="' + g.id + '">' + esc(g.name) + '<small>' + g.n + '</small></span>').join('') + '</div></div>';
    }
    for (const k of ['kids', 'stories']) {   // their own categories at the bottom of the list
      const lab = SETS[k].label, nm = lab.replace(/^\S+\s/, '');
      if (q && !nm.toLowerCase().includes(q)) continue;
      SETS[k].n = SETS[k].n != null ? SETS[k].n : S.filter(SETS[k].test).length;
      html += '<div class="fam setrow"><div class="fh' + (filter.kind === 'set' && filter.key === k ? ' on' : '') + '" data-set="' + k + '"><span class="dot" style="background:' + (k === 'kids' ? '#ffd45a' : '#c79a6b') + '"></span>' + esc(lab) + '<small class="cnt">' + SETS[k].n + '</small></div></div>';
    }
    $('genres').innerHTML = html;
  }
  buildGenres();
  $('genres').addEventListener('click', e => {
    const sb = e.target.closest('.fh[data-set]'); if (sb) { chooseSet(sb.dataset.set); return; }
    if (e.target.closest('.chip[data-dj]')) { openDJMixes(); if (innerWidth <= 820) sideOpen(false); return; }
    if (e.target.closest('#allbtn')) { filter = { kind: 'all' }; lyricsOnly = false; return applyFilter(); }
    if (e.target.closest('#lyrbtn')) { lyricsOnly = !lyricsOnly; if (lyricsOnly && !lyricSet.size) toast('Looking for stations with lyrics…'); applyFilter(); if (lyricsOnly) { showGenreList('Stations with lyrics'); if (innerWidth <= 820) sideOpen(false); } return; }
    const chip = e.target.closest('.chip'); if (chip) { filter = { kind: 'genre', id: +chip.dataset.g }; applyFilter(); return showGenreList(G[filter.id].name); }
    const fh = e.target.closest('.fh'); if (fh) { fh.parentElement.classList.toggle('open'); if (e.detail === 2) { filter = { kind: 'family', fam: fh.dataset.fam }; applyFilter(); showGenreList(fh.dataset.fam); } }
  });
  // Specials: LIVE NOW, Old-Time Stories, Kids (a button each, right under the theme/search in the menu)
  function chooseSet(key) {
    filter = { kind: 'set', key }; applyFilter(); if (innerWidth <= 820) sideOpen(false);
    showGenreList(SETS[key].label.replace(/^\S+\s/, ''));
    const top = shown.filter(s => s[1] && !isUP(s) && !isBL(s) && !/christmas|xmas|3abn/i.test(s[0])).sort((x, y) => y[5] - x[5])[0]; if (top) play(top, false);   // start the most popular one right away
    buildGenres($('gsearch').value);
  }
  $('specials').addEventListener('click', e => { if (e.target.closest('#livebtn') && innerWidth <= 820) sideOpen(false); });
  $('gsearch').addEventListener('input', e => {
    buildGenres(e.target.value); clearTimeout(st); const q = e.target.value.trim();
    if (q.length < 2) { $('sresults').classList.add('hidden'); return; }
    st = setTimeout(() => runSearch(q), 140);
  });
  $('gsearch').addEventListener('keydown', e => { if (e.key === 'Enter') { if (innerWidth <= 820) sideOpen(false); setTimeout(() => $('sresults').classList.remove('hidden'), 200); } });

  // initial filter from URL hash
  const h = decodeURIComponent(location.hash.slice(1));
  if (h && !/^s=/.test(h)) { const g = G.find(x => x.name.toLowerCase() === h.toLowerCase()); if (g) filter = { kind: 'genre', id: g.id }; else if (fams.includes(h)) filter = { kind: 'family', fam: h }; else if (SETS[h]) filter = { kind: 'set', key: h }; }
  buildGenres(); applyFilter();
  const sm = /^s=([^&]+)/.exec(h), altp = /[&?]alt=([\d.]+)/.exec(h);
  if (sm) { const s = S.find(x => x[13] === sm[1]); if (s) { openPanel([s], s[0], s[12] || ''); detail(s); setPlayerLogo(s); $('pname').textContent = s[0]; $('pmeta').textContent = 'Shared station · press ▶ to listen'; $('pplay').disabled = !s[1]; $('shareBtn').disabled = false; globe.pointOfView({ lat: s[2], lng: s[3], altitude: altp ? +altp[1] : 0.4 }, 0); ctl.autoRotate = false; autoRotate = false; $('pplay').onclick = () => { play(s); $('pplay').onclick = prevPlayClick; }; } }
  if (DG) {
    addEventListener('error', e => DG.errs.push((e.message || 'error') + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno));
    addEventListener('unhandledrejection', e => DG.errs.push('promise: ' + String(e.reason && e.reason.message || e.reason).slice(0, 80)));
    addEventListener('pointerdown', () => { setTimeout(() => { DG.maxPtr = Math.max(DG.maxPtr, gptrs); }, 0); }, true);
    const box = document.createElement('div'); box.id = 'diag';
    box.innerHTML = '<pre id="dgT"></pre><div class="dgb"><button id="dgCopy">Copy report</button><button id="dgReset">Reset</button><button id="dgHide">Hide</button></div><ol><li>Drag slowly across Europe</li><li>Flick fast, let it glide</li><li>Drag along the very edge of the Earth</li><li>Pinch in and out</li><li>Tap 🎲 Random twice</li><li>Tap 🔓, try to drag, tap 🔒</li></ol>';
    document.body.appendChild(box);
    const tick = now => { requestAnimationFrame(tick); if (DG.lastRaf) { const f = 1000 / (now - DG.lastRaf); DG.fps.push(f); if (DG.fps.length > 60) DG.fps.shift(); if (DG.fps.length > 20) DG.minFps = Math.min(DG.minFps, f); } DG.lastRaf = now; const z = globe.pointOfView().altitude; DG.zoomMin = Math.min(DG.zoomMin, z); DG.zoomMax = Math.max(DG.zoomMax, z); };
    requestAnimationFrame(tick);
    const report = () => {
      const f = DG.fps.length ? DG.fps.reduce((x, y) => x + y, 0) / DG.fps.length : 0, pov = globe.pointOfView();
      return ['RADIO GLOBE DIAG ' + new Date().toISOString().slice(0, 19), navigator.userAgent.replace(/\(.*?\)/, m => m.slice(0, 40)), 'screen ' + innerWidth + 'x' + innerHeight + ' @' + (devicePixelRatio || 1) + 'x  touch ' + navigator.maxTouchPoints,
        'fps now ' + f.toFixed(0) + '   worst ' + (DG.minFps === 999 ? '-' : DG.minFps.toFixed(0)),
        'drag: ' + DG.steps + ' steps, ' + (DG.rot * 57.2958).toFixed(1) + '° total, biggest step ' + (DG.maxStep * 57.2958).toFixed(2) + '°',
        'fling speed ' + DG.fling + ' px/s   fingers max ' + DG.maxPtr,
        'snaps ' + DG.snaps + '   last snap landed ' + (DG.snapErr === null ? '-' : DG.snapErr + ' px off centre'),
        'zoom altitude ' + pov.altitude.toFixed(2) + '  (seen ' + (DG.zoomMin === 99 ? '-' : DG.zoomMin.toFixed(2)) + ' .. ' + DG.zoomMax.toFixed(2) + ')',
        'view ' + (spaced ? 'ghost' : 'earth') + '  locked ' + locked + '  playing ' + (isPlaying() ? 'yes' : 'no'),
        'station ' + (current ? current[0].slice(0, 28) : '-'),
        'errors ' + DG.errs.length + (DG.errs.length ? ': ' + DG.errs.slice(-3).join(' | ') : '')].join('\n');
    };
    setInterval(() => { $('dgT').textContent = report(); }, 400);
    $('dgCopy').onclick = async () => { try { await navigator.clipboard.writeText(report()); toast('Report copied'); } catch (e) { prompt('Copy this:', report()); } };
    $('dgReset').onclick = () => { Object.assign(DG, { rot: 0, steps: 0, maxStep: 0, fling: 0, snaps: 0, snapErr: null, errs: [], fps: [], minFps: 999, maxPtr: 0, zoomMin: 99, zoomMax: 0 }); };
    $('dgHide').onclick = () => { box.remove(); };
  }
  window.__radioGlobe = { replay() { upPlayIdx(upIdx, Date.now() / 1000 - (upS.delay || 0) - upS.plays[upIdx].t, 0); }, get upCur() { return upCur; }, get yt() { return yt; }, get ytState() { try { return yt && yt.getPlayerState(); } catch (e) { return 'err'; } }, get upIdx() { return upIdx; }, get bad() { return upBad; }, globe, get shown() { return shown; }, get cells() { return cells; }, project };
})();
