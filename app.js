(async function () {
  const $ = id => document.getElementById(id);
  const FAMCOL = {"Electronic":"#4fd1ff","Pop":"#ff6fb5","Rock":"#ff5a4f","Hip-Hop & R&B":"#ffb347","Jazz & Blues":"#c792ff","Classical & Instrumental":"#e9e4a0","Country, Folk & Roots":"#b6e35a","Reggae & Caribbean":"#3ddc84","Latin":"#ff8a3d","World":"#2ee6c8","Decades & Oldies":"#d6a6ff","Spoken & Talk":"#9db4d4","Religious":"#f2f2f2","Vibes & Moods":"#ff9ec7","Other":"#8fa3c8"};
  const NOGENRE = "#8aa0c4";

  // ---------- load data ----------
  const res = await fetch('data/stations.json', { cache: 'no-cache' });
  const DB = await res.json();
  const G = DB.genres, S = DB.stations;
  $('loading').classList.add('hidden');
  const famOf = G.map(g => g.family);

  // ---------- state ----------
  const BAND = ['Online', 'FM', 'AM', 'Shortwave', 'DAB'];
  let band = -1, playableOnly = false;   // band -1 = every band
  let filter = { kind: 'all' };           // all | genre | family
  let shown = S;                          // currently filtered stations
  let current = null;                     // playing station
  let autoRotate = true;
  const cellKey = (la, lo, c) => Math.floor((la + 90) / c) + ':' + Math.floor((lo + 180) * Math.max(0.15, Math.cos(la * Math.PI / 180)) / c);

  function applyFilter() {
    if (typeof liveFam !== 'undefined') { const lf = famOfFilter(); if (lf !== liveFam) { liveFam = lf; loadLiveFilter(); if (liveOpen) renderLive(); } }
    let base;
    if (filter.kind === 'all') base = S;
    else if (filter.kind === 'genre') base = S.filter(s => s[11].includes(filter.id));
    else { const ids = new Set(G.filter(g => g.family === filter.fam).map(g => g.id)); base = S.filter(s => s[11].some(i => ids.has(i))); }
    bandCounts = [0, 0, 0, 0, 0]; for (const s of base) if (!playableOnly || s[1]) bandCounts[s[14]]++;
    shown = base.filter(s => (band < 0 || s[14] === band) && (!playableOnly || s[1]) && (!favOnly || favs.has(s[13])));
    paintBands(); paintFavs();
    const label = filter.kind === 'all' ? 'All genres' : filter.kind === 'genre' ? G[filter.id].name : filter.fam;
    $('favonly').checked = favOnly;
    $('stat').textContent = label + (band >= 0 ? ' · ' + BAND[band] : '') + ' · ' + shown.length.toLocaleString() + ' stations';
    history.replaceState(null, '', filter.kind === 'all' ? location.pathname : '#' + encodeURIComponent(filter.kind === 'genre' ? G[filter.id].name : filter.fam));
    refreshPoints();
    document.querySelectorAll('.chip,.allbtn').forEach(e => e.classList.remove('on'));
    const on = filter.kind === 'all' ? $('allbtn') : filter.kind === 'genre' ? document.querySelector('.chip[data-g="' + filter.id + '"]') : null;
    if (on) on.classList.add('on');
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
    .onZoom(() => schedule());
  const ctl = globe.controls();
  ctl.autoRotate = true; ctl.autoRotateSpeed = 0.35; ctl.minDistance = 100.12; ctl.maxDistance = 520; ctl.zoomSpeed = 0.9; ctl.enableDamping = true;
  try { globe.renderer().setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth <= 820 ? 1.5 : 2)); } catch (e) {}
  globe.pointOfView({ lat: 30, lng: 10, altitude: innerWidth < 500 ? 4.4 : innerWidth < innerHeight ? 3.2 : 2.4 });
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
  function frame() {
    requestAnimationFrame(frame);
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
      cx.globalAlpha = 0.9 * fade; cx.fillStyle = RED; cx.beginPath(); cx.arc(q.x, q.y, r, 0, 6.2832); cx.fill();
      scr.push({ x: q.x, y: q.y, r, c });
      if (c.n === 1 && alt < 0.012) { const tx = q.x + r + 5, ty = q.y + 4, w = c.list[0][0].length * 6.4; const gk = Math.floor(tx / 90) + ':' + Math.floor(ty / 16); if (!labSeen.has(gk) && !labSeen.has((Math.floor(tx / 90) + 1) + ':' + Math.floor(ty / 16))) { labSeen.add(gk); cx.globalAlpha = fade; cx.font = '600 11px system-ui,sans-serif'; cx.lineWidth = 3; cx.strokeStyle = 'rgba(0,0,0,.75)'; cx.fillStyle = '#fff'; cx.strokeText(c.list[0][0], tx, ty); cx.fillText(c.list[0][0], tx, ty); } }
    }
    // live DJ sets (pulsing red ring) and tonight's events (diamonds)
    const nowT = performance.now() / 1000;
    for (const r of liveItems) {
      if (r.kind !== 'live' || r.ai) continue;
      const q = project(r.lat, r.lng !== undefined ? r.lng : r.lon, 0.0016); if (q.behind || q.vis <= 0) continue;
      const fade = Math.min(1, q.cosv / 0.12), ph = (nowT * 0.8 + (r.lat * 7)) % 1;
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
            const t = ((now - pulseT) / 1300 + k / 3) % 1;
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
  requestAnimationFrame(frame);
  // the bullseye lock-on, the hover highlight and the click all use the same rule, so what it locks onto is what you get
  function pickAt(x, y, touch) { const d = pickNear(x, y, touch ? 34 : 20); return d ? d.c : null; }
  const gEl = $('globe'), tip = document.createElement('div'); tip.id = 'dtip'; tip.className = 'tip hidden'; document.body.appendChild(tip);
  gEl.addEventListener('pointermove', e => {
    if (e.buttons) { tip.classList.add('hidden'); return; }
    const c = pickAt(e.clientX, e.clientY, e.pointerType === 'touch');
    if (c !== hover) { hover = c; dirty = true; gEl.style.cursor = c ? 'pointer' : ''; }
    if (c) { tip.innerHTML = c.live ? '<b>🔴 LIVE · ' + esc(c.live.title) + '</b><span>' + esc(c.live.channel + (c.live.place ? ' · ' + c.live.place : '')) + '</span>' : c.ev ? '<b>' + esc(c.ev.name) + '</b><span>' + esc([c.ev.venue, c.ev.city].filter(Boolean).join(' · ')) + '</span>' : '<b>' + (c.n > 1 ? c.n + ' stations' : esc(c.list[0][0]) + (c.list[0][15] ? ' · ' + esc(c.list[0][15]) : '')) + '</b><span>' + (c.n > 1 ? esc(c.list.slice(0, 3).map(s => s[0]).join(' · ')) + (c.n > 3 ? ' …' : '') : esc(c.list[0][12] || '')) + '</span>'; tip.style.left = Math.min(innerWidth - 300, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; tip.classList.remove('hidden'); } else tip.classList.add('hidden');
  });
  gEl.addEventListener('pointerleave', () => { tip.classList.add('hidden'); hover = null; dirty = true; });
  let down = null;
  gEl.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; ptr = [e.clientX, e.clientY]; updateReticle(e.pointerType === 'touch' ? 34 : 20); });
  gEl.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) { const c = pickAt(e.clientX, e.clientY, e.pointerType === 'touch'); if (c) onCell(c); } down = null; });
  ctl.addEventListener('change', () => { dirty = true; });
  // bullseye: a free scope that follows your mouse and locks onto a dot when you are close; click to choose
  let ptr = null, lockedTo = null;
  function pickNear(x, y, rad) { let best = null, bd = rad; for (const d of scr) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } } return best; }
  function updateReticle(rad) {
    if (!ptr) return;
    const d = pickNear(ptr[0], ptr[1], rad || 20), x = d ? d.x : ptr[0], y = d ? d.y : ptr[1];
    bz.style.transform = 'translate(' + (x - 56).toFixed(1) + 'px,' + (y - 56).toFixed(1) + 'px)'; bz.classList.toggle('lock', !!d);
  }
  gEl.addEventListener('pointermove', e => { ptr = [e.clientX, e.clientY]; if (!e.buttons) updateReticle(e.pointerType === 'touch' ? 34 : 20); });
  ctl.addEventListener('change', () => { draw(); });

  // ---------- Live now: DJ sets streaming right now + tonight's events ----------
  let liveData = { items: [] }, evData = { items: [] }, liveItems = [], evItems = [], liveTab = 'feat', liveOpen = false, watching = null, liveFam = '';
  async function loadLive() {
    try { liveData = await (await fetch('data/live.json?t=' + Date.now())).json(); } catch (e) {}
    try { evData = await (await fetch('data/events.json?t=' + Date.now())).json(); } catch (e) {}
    liveItems = (liveData.items || []).filter(r => r.lat != null && (!liveFam || (r.fam || []).includes(liveFam))).map(r => Object.assign({ lng: r.lon }, r)); evItems = evData.items || [];
    const n = (liveData.items || []).filter(r => r.kind === 'live').length; $('livecount').textContent = n || ''; $('livebtn').title = 'Live right now: ' + n + ' · updated ' + (liveData.updated ? ago(liveData.updated) : '—'); dirty = true;
    if (liveOpen) { const st = $('plist').scrollTop; renderLive(); $('plist').scrollTop = st; }
  }
  function loadLiveFilter() { liveItems = (liveData.items || []).filter(r => r.lat != null && (!liveFam || (r.fam || []).includes(liveFam))).map(r => Object.assign({ lng: r.lon }, r)); dirty = true; }
  setInterval(loadLive, 30 * 1000);
  function ago(ts) { const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; }
  function openLive(tab) { if (tab) liveTab = tab; liveOpen = true; renderLive(); $('panel').classList.remove('hidden'); }
  function famOfFilter() { return filter.kind === 'family' ? filter.fam : filter.kind === 'genre' ? G[filter.id].family : ''; }
  function renderLive() {
    const up = (liveData.upcoming || []), all = (liveData.items || []), rec = (liveData.recent || []);
    const inFam = r => !liveFam || (r.fam || []).includes(liveFam);
    const byViews = (x, y) => (y.views || 0) - (x.views || 0);
    const feat = all.filter(r => r.dj && inFam(r)).sort((x, y) => (x.kind === 'live' ? 0 : 1) - (y.kind === 'live' ? 0 : 1) || byViews(x, y));
    const real = all.filter(r => r.kind === 'live' && !r.ai && !r.dj && inFam(r)).sort(byViews);
    const loops = all.filter(r => r.kind !== 'live' && !r.ai && !r.dj && inFam(r)).sort(byViews);
    const ai = all.filter(r => r.ai && inFam(r)).sort(byViews);
    const soon = up.filter(inFam), recs = rec.filter(inFam);
    const famCount = {}; for (const r of all) for (const f of (r.fam || [])) famCount[f] = (famCount[f] || 0) + 1;
    $('ptitle').textContent = '🔴 Live now'; $('psub').textContent = 'Updated ' + (liveData.updated ? ago(liveData.updated) : '—');
    $('pdetail').classList.remove('hidden');
    const tab = (k, l, n) => '<button data-lt="' + k + '" class="' + (liveTab === k ? 'on' : '') + '">' + l + '<b>' + n + '</b></button>';
    $('pdetail').innerHTML = '<div class="ltabs">' + tab('feat', 'Featured', feat.length) + tab('sets', 'Live', real.length) + tab('loops', '24/7', loops.length) + tab('ai', 'AI', ai.length) + tab('soon', 'Soon', soon.length + recs.length) + '</div>' +
      '<select id="lfsel" class="lfsel"><option value="">All genres</option>' + Object.entries(famCount).sort((a, b) => b[1] - a[1]).map(([f, n]) => '<option value="' + esc(f) + '"' + (liveFam === f ? ' selected' : '') + '>' + esc(f) + ' (' + n + ')</option>').join('') + '</select>' +
      '<div id="livewatch">' + (watching ? watchHTML(watching) : '') + '</div>';
    const rowOf = (r, extra) => '<div class="row lrow" data-v="' + esc(r.id) + '"><img class="lth" loading="lazy" src="https://i.ytimg.com/vi/' + esc(r.id) + '/mqdefault.jpg" onerror="this.style.visibility=\'hidden\'"><div class="t"><div class="n">' + esc(r.title) + '</div><div class="m">' + esc([r.dj || r.channel, extra, r.views ? r.views.toLocaleString() + ' watching' : '', r.place].filter(Boolean).join(' · ')) + '</div></div></div>';
    const empty = m => '<div class="lempty">' + m + '</div>';
    let rows = '';
    if (liveTab === 'soon') {
      rows = soon.map(u => '<div class="row lrow" data-v="' + esc(u.id) + '"><img class="lth" loading="lazy" src="https://i.ytimg.com/vi/' + esc(u.id) + '/mqdefault.jpg" onerror="this.style.visibility=\'hidden\'"><div class="t"><div class="n">' + esc(u.title) + '</div><div class="m">⏰ ' + esc(new Date(u.start * 1000).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' · ' + u.channel) + '</div></div></div>').join('');
      rows += recs.map(r => rowOf(r, 'ended ' + ago(r.last_seen))).join('');
      if (!rows) rows = empty('Nothing scheduled or recently ended yet.');
    } else {
      const list = { feat, sets: real, loops, ai }[liveTab] || real;
      rows = list.length ? list.slice(0, 120).map(r => rowOf(r, r.kind !== 'live' && liveTab === 'feat' ? '24/7' : '')).join('') : empty(liveTab === 'feat' ? 'No featured DJs or festivals are live right now.' : 'Nothing here right now.');
    }
    $('plist').innerHTML = rows; panelList = [];
  }
  const watchHTML = r => '<div class="lw"><iframe src="https://www.youtube-nocookie.com/embed/' + esc(r.id) + '?autoplay=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><div class="lwt"><span>' + esc(r.title) + '</span><button id="lwstop" title="Stop watching">✕</button></div></div>';
  function liveWatch(r) {
    audio.pause(); if (hls) { hls.destroy(); hls = null; } ytStop(); $('pplay').textContent = '▶';
    watching = r; openLive(liveTab);
    if (r.lat != null) { ctl.autoRotate = false; autoRotate = false; globe.pointOfView({ lat: r.lat, lng: r.lon, altitude: 0.5 }, 1200); }
  }
  $('pdetail').addEventListener('click', e => {
    const t = e.target.closest('[data-lt]'); if (t) { liveTab = t.dataset.lt; renderLive(); return; }
    if (e.target.closest('#lwstop')) { watching = null; renderLive(); }
  });
  $('pdetail').addEventListener('change', e => { if (e.target.id === 'lfsel') { liveFam = e.target.value; loadLiveFilter(); renderLive(); } });
  $('plist').addEventListener('click', e => {
    if (!liveOpen) return;
    const v = e.target.closest('[data-v]'); if (v) { const r = (liveData.items || []).concat(liveData.upcoming || [], liveData.recent || []).find(x => x.id === v.dataset.v); if (r) liveWatch(Object.assign({ kind: 'live' }, r)); return; }
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
    const meta = [s[15], s[12], g, s[1] ? s[6] && s[6] + (s[7] ? ' ' + s[7] + 'k' : '') : 'broadcast only · no stream'];
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
    liveOpen = false; panelList = list; panelDone = 0;
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
  $('plist').addEventListener('click', e => { if (liveOpen) return; if (starClick(e)) return; const r = e.target.closest('.row'); if (r && panelList[+r.dataset.i]) play(panelList[+r.dataset.i], true); });
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
    ytPos = p; const sg = ytQ[p]; ytShow(sg[1]); yt.loadVideoById(sg[0]);
  }
  // 1UP Radio: follows the live schedule published at 1upradio.com
  const upNow = () => { let k = 0; const src = Date.now() / 1000 - (upS.delay || 0); for (let i = 0; i < upS.plays.length; i++) { if (upS.plays[i].t <= src) k = i; else break; } return k; };
  let upTimer = null, upCurAlt = 0, upCur = null; const upBad = {};
  function upClear() { if (upTimer) { clearTimeout(upTimer); upTimer = null; } }
  // If YouTube will not play a song here, EVERY listener (this page and 1upradio.com) swaps in the same replacement for that slot, picked by a fixed rule, so they stay in step.
  function upAltIdx(i, n) { const lo = Math.max(0, i - 900), hi = Math.max(lo + 1, i - 40), len = hi - lo; return lo + ((((i * 2654435761 + n * 40503 + 7) % len) + len) % len); }
  function upSlotPlay(i, n) { return n === 0 ? upS.plays[i] : upS.plays[upAltIdx(i, n)]; }
  function upPlayIdx(i, offset, n) {
    upClear();
    const pl = upS.plays; if (!pl.length) return;
    if (i >= pl.length) { i = Math.max(0, pl.length - 40 + ((Math.random() * 30) | 0)); offset = 0; n = 0; }
    n = n || 0; let p = upSlotPlay(i, n);
    while (n < 8 && upBad[p.id]) { n++; p = upSlotPlay(i, n); }
    upIdx = i; upCurAlt = n; upCur = p; const k = p.title.indexOf(' - ');
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
    ytMode = mode || 'bl'; ytOn = true; ytErr = 0;
    let first;
    if (ytMode === 'up') { try { const [k, off] = await upStart(); first = () => upPlayIdx(k, off); } catch (e) { $('pmeta').textContent = '1UP Radio schedule unavailable right now'; ytOn = false; return; } }
    else { await ytSongList(); ytQ = shuffleArr(ytSongs); ytPos = -1; first = () => ytPlayPos(0); }
    const init = () => { if (yt) { first(); return; } yt = new YT.Player('ytplayer', { width: 200, height: 200, playerVars: { playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3 }, events: { onReady: () => { try { yt.setVolume(Math.round(+$('vol').value * 100)); } catch (e) {} first(); },
      onStateChange: e => { if (e.data === 1) { ytPlaying = true; ytErr = 0; try { if (!yt.isMuted()) yt.setVolume(Math.round(+$('vol').value * 100)); } catch (x) {} $('pplay').textContent = '❚❚'; } else if (e.data === 2) { ytPlaying = false; $('pplay').textContent = '▶'; } else if (e.data === 0) ytNext(); },
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
  function ytStop() { if (!ytOn) return; ytOn = false; ytPlaying = false; try { yt && yt.stopVideo(); } catch (e) {} }

  const isUP = s => s && typeof s[1] === 'string' && s[1].startsWith('web:');

  // the BEATS head floats around the screen all the time; tap it to visit billylegal.com
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
    const msUpdate = () => { const s = current; if (!s) return; try { MS.metadata = new MediaMetadata({ title: s[0], artist: [s[15], s[12]].filter(Boolean).join(' · ') || 'Radio Globe', album: 'A View From Space · Radio Globe', artwork: [{ src: 'assets/icon/radio-globe-512.png', sizes: '512x512', type: 'image/png' }] }); MS.playbackState = audio.paused ? 'paused' : 'playing'; } catch (e) {} };
    ['play', 'playing', 'pause', 'loadedmetadata'].forEach(ev => audio.addEventListener(ev, msUpdate));
    try { MS.setActionHandler('play', () => { audio.play().catch(() => {}); }); } catch (e) {}
    try { MS.setActionHandler('pause', () => { audio.pause(); }); } catch (e) {}
    try { MS.setActionHandler('stop', () => { audio.pause(); }); } catch (e) {}
    try { MS.setActionHandler('nexttrack', null); MS.setActionHandler('previoustrack', null); } catch (e) {}
  }
  function play(s, fly) {
    if (isBL(s)) { audio.pause(); if (hls) { hls.destroy(); hls = null; } current = s; detail(s); $('shareBtn').disabled = false; setPlayerLogo(s); $('pplay').disabled = false; ytStart('bl'); pulseT = performance.now(); if (fly) flyTo(s); return; }
    ytStop();
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
    else audio.src = url;
    audio.play().catch(() => {});
    pulseT = performance.now();
    if (fly) flyTo(s);
    document.querySelectorAll('.row').forEach(r => r.classList.toggle('now', panelList[+r.dataset.i] && panelList[+r.dataset.i][13] === s[13]));
    fetch('https://de1.api.radio-browser.info/json/url/' + s[13], { mode: 'no-cors' }).catch(() => {});
  }
  let startElec = null;
  function failed() {
    if (startElec && !randomMode) { startElec(); return; }
    $('pmeta').textContent = 'This stream is unavailable right now' + (randomMode ? ' — trying another…' : '');
    if (randomMode && ++tries < 4) setTimeout(() => randomStation(), 500);
  }
  audio.addEventListener('playing', () => { $('pplay').textContent = '❚❚'; $('pmeta').textContent = [current[15], current[12], current[11].slice(0, 3).map(x => G[x].name).join(', '), current[6] + (current[7] ? ' ' + current[7] + 'k' : ''), current[8] ? 'approx. location' : ''].filter(Boolean).join(' · '); });
  audio.addEventListener('pause', () => $('pplay').textContent = '▶');
  audio.addEventListener('play', () => { if (!ytOn) $('pplay').textContent = '❚❚'; });
  audio.addEventListener('error', failed);
  audio.addEventListener('stalled', () => { if (audio.readyState < 3) $('pmeta').textContent = 'Buffering…'; });
  const prevPlayClick = $('pplay').onclick = () => { if (ytOn && yt && yt.getPlayerState) { ytPlaying ? yt.pauseVideo() : yt.playVideo(); return; } if (!current) return; audio.paused ? audio.play().catch(failed) : audio.pause(); };
  function randomStation() {
    if (!shown.length) return; randomMode = true;
    const pool = shown.filter(x => x[1]); if (!pool.length) return;
    let s, t = 0; do { s = pool[(Math.random() * pool.length) | 0]; } while (s === current && ++t < 5);
    if (roloOn) { rolo.spinTo(s, () => play(s, false)); return; }
    play(s, true); openPanel([s], s[0], s[12] || '');
  }
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
  setSpaced(true);
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
    // every visit starts on a fresh random Electronic station (1UP Radio is the fallback)
    const elec = S.filter(s => s[1] && typeof s[1] === 'string' && !isUP(s) && !isBL(s) && s[11].some(g => famOf[g] === 'Electronic'));
    if (elec.length) {
      elecMode = true; let n = 0;
      const pick = () => { const s = elec[(Math.random() * elec.length) | 0]; play(s, false); };
      startElec = () => { if (++n < 6) pick(); };
      ctl.autoRotate = false; autoRotate = false; $('rotate').style.opacity = .5;
      pick();
      $('panel').classList.add('hidden');   // opens with the info card closed; tap the station name/logo to open it
      // browsers may block sound until the first touch: start the station on the first touch/key anywhere (but not on the player's own buttons)
      let unlocked = false;
      const firstGesture = ev => { if (unlocked) return; if (ev.target && ev.target.closest && ev.target.closest('#player')) { unlocked = true; return; } unlocked = true; if (audio.paused && current && current[1]) audio.play().catch(() => {}); };
      ['pointerdown', 'keydown', 'touchstart'].forEach(evn => addEventListener(evn, firstGesture, { passive: true }));
    } else if (up) {
      play(up, false);
      ctl.autoRotate = false; autoRotate = false; $('rotate').style.opacity = .5;
      // (opening zoom-in to 1UP Radio removed at Billy's request, 2026-10-12)
      setTimeout(() => {   // browsers block sound before the first tap: fall back to muted autoplay, then unmute on the first touch
        if (ytPlaying || ytMode !== 'up') return;
        try { if (yt && yt.mute) { yt.mute(); yt.playVideo(); muted = true; } } catch (e) {}
        tap.style.display = 'block';
      }, 3500);
      setInterval(() => { if (tap.style.display !== 'none' && ytPlaying && !muted) tap.style.display = 'none'; }, 700);
    }
  }
  addEventListener('keydown', e => {
    if (/INPUT/.test(document.activeElement.tagName)) return;
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
      showList(list, 'Stations near ' + nm, placeLabel(p) + ' · within ' + radius + ' km · ' + list.length + ' found');
      globe.pointOfView({ lat: la, lng: lo, altitude: radius > 50 ? 0.3 : 0.2 }, 1500);
    } else {
      const list = shown.filter(s => s[4] === p.cc).sort((a, b) => b[5] - a[5]);
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
  const runSearch = q => { sres = { places: searchPlaces(q), stations: searchStations(q), genres: searchGenres(q), live: searchLive(q) }; renderSearch(); };
  let st, sres = { places: [], stations: [] };
  function renderSearch() {
    const box = $('sresults'); let html = '';
    if ((sres.genres || []).length) html += '<div class="shead">Genres</div>' + sres.genres.map((g, i) => '<div class="row place" data-g="' + i + '"><div class="ph tile" style="background:' + (FAMCOL[g.family] || '#2b4a63') + '">♪</div><div class="t"><div class="n">' + esc(g.name) + '</div><div class="m">' + esc(g.family) + ' · ' + g.n + ' stations</div></div></div>').join('');
    if ((sres.live || []).length) html += '<div class="shead">DJs &amp; live sets</div>' + sres.live.map((r, i) => '<div class="row lrow" data-l="' + i + '"><img class="lth" loading="lazy" src="https://i.ytimg.com/vi/' + esc(r.id) + '/mqdefault.jpg" onerror="this.style.visibility=\'hidden\'"><div class="t"><div class="n">' + esc(r.title) + '</div><div class="m">' + esc([r.dj || r.channel, r.place, r.kind === 'live' ? 'LIVE' : '24/7'].filter(Boolean).join(' · ')) + '</div></div></div>').join('');
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
    const r = e.target.closest('.row'); if (!r) return;
    $('sresults').classList.add('hidden');
    if (r.dataset.p !== undefined) { goPlace(sres.places[+r.dataset.p]); return; }
    if (r.dataset.g !== undefined) { const g = sres.genres[+r.dataset.g]; filter = { kind: 'genre', id: G.indexOf(g) }; applyFilter(); showGenreList(g.name); return; }
    if (r.dataset.l !== undefined) { liveWatch(sres.live[+r.dataset.l]); return; }
    if (r.dataset.i === undefined) return;
    const s = sres.stations[+r.dataset.i]; randomMode = false; if (roloOn) { rolo.reveal(s); return; } play(s, true); openPanel([s], s[0], s[12] || '');
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
      if (Date.now() - lastTouch < 3000) { clearTimeout(playT); playT = setTimeout(() => { const s = list[Math.round(sc.scrollTop / H)]; if (open && s && s !== current) { randomMode = false; play(s, false); render(); } }, 550); }
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
      const from = sc.scrollTop, to = i * H, t0 = performance.now(), dur = Math.min(2200, 900 + Math.abs(to - from) / H * 6);
      snapping = true; clearTimeout(snapT);
      const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); sc.scrollTop = from + (to - from) * e; if (k < 1) requestAnimationFrame(step); else { snapping = false; render(); done(); } };
      requestAnimationFrame(step);
    }
    $('roloClear').onclick = () => { custom = null; src = null; build(); size(); goTo(0, false); render(); };
    // show only a set of stations (a searched city / country) in the wheel, A-Z
    function showCustom(l, label) { custom = l; customLabel = label; src = null; build(); size(); sp.style.height = Math.max(1, list.length * H + VH - H) + 'px'; goTo(0, false); render(); }
    // search result for one station: bring it to the front of the wheel and play it (no info card until it's touched)
    function reveal(s) { if (list.indexOf(s) < 0) { custom = null; src = null; build(); size(); } spinTo(s, () => play(s, false)); }
    // at launch: wheel starts at the top, then spins down to the opening station and plays it
    function intro() { if (!open || !current) return; build(); const i = list.indexOf(current); if (i < 0) return; sc.scrollTop = 0; render(); spinTo(current, () => { if (audio.paused) play(current, false); }); }
    return { intro, spinTo, showCustom, reveal, isOpen: () => open, refresh() { custom = null; if (open) { src = null; build(); size(); goTo(0, false); render(); } else src = null; }, toggle };
  })();
  { let pref = null; try { pref = localStorage.getItem('rg-rolo'); } catch (e) {} if (pref === '1' || (pref === null && innerWidth <= 820)) { rolo.toggle(true); rolo.intro(); } }   // phones start on the Rolodex unless you last left it elsewhere
  { const af = applyFilter; applyFilter = function () { af.apply(this, arguments); rolo.refresh(); }; }
  // ---------- genre sidebar ----------
  const fams = [...new Set(G.map(g => g.family))];
  function buildGenres(q) {
    q = (q || '').toLowerCase(); let html = '<button id="allbtn" class="allbtn' + (filter.kind === 'all' ? ' on' : '') + '">🌍 All stations <small>' + S.length.toLocaleString() + '</small></button>';
    for (const f of fams) {
      const gs = G.filter(g => g.family === f && (!q || g.name.toLowerCase().includes(q)));
      if (!gs.length) continue;
      const fn = gs.reduce((a, g) => a + g.n, 0);
      html += '<div class="fam' + (q ? ' open' : '') + '"><div class="fh" data-fam="' + esc(f) + '"><span class="dot" style="background:' + FAMCOL[f] + '"></span>' + esc(f) + '<span class="caret">›</span></div><div class="gl">' +
        gs.sort((a, b) => b.n - a.n).map(g => '<span class="chip' + (filter.kind === 'genre' && filter.id === g.id ? ' on' : '') + '" data-g="' + g.id + '">' + esc(g.name) + '<small>' + g.n + '</small></span>').join('') + '</div></div>';
    }
    $('genres').innerHTML = html;
  }
  buildGenres();
  $('genres').addEventListener('click', e => {
    if (e.target.closest('#allbtn')) { filter = { kind: 'all' }; return applyFilter(); }
    const chip = e.target.closest('.chip'); if (chip) { filter = { kind: 'genre', id: +chip.dataset.g }; applyFilter(); return showGenreList(G[filter.id].name); }
    const fh = e.target.closest('.fh'); if (fh) { fh.parentElement.classList.toggle('open'); if (e.detail === 2) { filter = { kind: 'family', fam: fh.dataset.fam }; applyFilter(); showGenreList(fh.dataset.fam); } }
  });
  $('gsearch').addEventListener('input', e => {
    buildGenres(e.target.value); clearTimeout(st); const q = e.target.value.trim();
    if (q.length < 2) { $('sresults').classList.add('hidden'); return; }
    st = setTimeout(() => runSearch(q), 140);
  });
  $('gsearch').addEventListener('keydown', e => { if (e.key === 'Enter') { if (innerWidth <= 820) sideOpen(false); setTimeout(() => $('sresults').classList.remove('hidden'), 200); } });

  // initial filter from URL hash
  const h = decodeURIComponent(location.hash.slice(1));
  if (h && !/^s=/.test(h)) { const g = G.find(x => x.name.toLowerCase() === h.toLowerCase()); if (g) filter = { kind: 'genre', id: g.id }; else if (fams.includes(h)) filter = { kind: 'family', fam: h }; }
  buildGenres(); applyFilter();
  const sm = /^s=([^&]+)/.exec(h), altp = /[&?]alt=([\d.]+)/.exec(h);
  if (sm) { const s = S.find(x => x[13] === sm[1]); if (s) { openPanel([s], s[0], s[12] || ''); detail(s); setPlayerLogo(s); $('pname').textContent = s[0]; $('pmeta').textContent = 'Shared station · press ▶ to listen'; $('pplay').disabled = !s[1]; $('shareBtn').disabled = false; globe.pointOfView({ lat: s[2], lng: s[3], altitude: altp ? +altp[1] : 0.4 }, 0); ctl.autoRotate = false; autoRotate = false; $('pplay').onclick = () => { play(s); $('pplay').onclick = prevPlayClick; }; } }
  window.__radioGlobe = { replay() { upPlayIdx(upIdx, Date.now() / 1000 - (upS.delay || 0) - upS.plays[upIdx].t, 0); }, get upCur() { return upCur; }, get yt() { return yt; }, get ytState() { try { return yt && yt.getPlayerState(); } catch (e) { return 'err'; } }, get upIdx() { return upIdx; }, get bad() { return upBad; }, globe, get shown() { return shown; }, get cells() { return cells; }, project };
})();
