/*
 * warmwasser-schema-card.js
 * Animated hydraulic diagram for Home Assistant: storage tank, heat pump, fresh water module,
 * solar thermal, additional heat source and heating circuits. Rendered entirely in the browser.
 * Every device and every value only appears when an entity is configured.
 *
 * Animiertes Anlagenschema für Home Assistant. Wird komplett im Browser gezeichnet.
 * Jedes Gerät und jeder Wert erscheint nur, wenn dafür eine Entität konfiguriert ist.
 *
 * Install: copy to /config/www/, add resource /local/warmwasser-schema-card.js (JavaScript module)
 */

const VERSION = '3.0.2';

/* ---------- Texte / Texts ---------- */
const T = {
  de: {
    titel: 'Warmwasser', speicherAvg: 'Speicher Ø', speicher: 'SPEICHER', zirk: 'Zirkulation', kalt: 'Kaltwasser', warm: 'Warmwasser',
    wpAn: 'Verdichter läuft', wpAus: 'Standby', sperre: 'EVU-Sperre', abtauen: 'Abtauen', kuehlen: 'Kühlbetrieb', waerme: 'Wärme',
    brennt: 'Brennt', glut: 'Glut', aus: 'Aus', an: 'An', brennerAn: 'Brenner an', warmK: 'Warm', aktiv: 'Aktiv', laeuft: 'Läuft',
    legLaeuft: 'Legionellenschutz läuft', legHeute: 'Legionellen: heute', legVor: (n) => `Legionellen: vor ${n} ${n === 1 ? 'Tag' : 'Tagen'}`,
    raum: 'Raum', ww: 'WARMWASSER', puffer: 'PUFFER', modusTitle: 'Pumpenmodus umschalten', zirkTitle: 'Zirkulationspumpe ein/aus',
    mischerTitle: (m) => `Mischer ${m} (Anteil Puffer)`, hk: 'HK', solar: 'Solar', abgas: 'Abgas', luft: 'Luft', enth: 'Enthärtung',
    auto: 'AUTO', hand: 'HAND', modusAus: 'AUS', hsO: 'Heizstab oben', hsU: 'Heizstab unten',
    typ: { kamin: 'Kamin', holzvergaser: 'Holzvergaser', pellet: 'Pellets', gas: 'Gastherme', oel: 'Ölkessel', fernwaerme: 'Fernwärme', bhkw: 'BHKW' },
  },
  en: {
    titel: 'Hot water', speicherAvg: 'Tank Ø', speicher: 'TANK', zirk: 'Circulation', kalt: 'Cold water', warm: 'Hot water',
    wpAn: 'Compressor on', wpAus: 'Standby', sperre: 'Grid lock', abtauen: 'Defrosting', kuehlen: 'Cooling', waerme: 'Heat',
    brennt: 'Burning', glut: 'Embers', aus: 'Off', an: 'On', brennerAn: 'Burner on', warmK: 'Warm', aktiv: 'Active', laeuft: 'Running',
    legLaeuft: 'Legionella protection', legHeute: 'Legionella: today', legVor: (n) => `Legionella: ${n} ${n === 1 ? 'day' : 'days'} ago`,
    raum: 'Room', ww: 'HOT WATER', puffer: 'BUFFER', modusTitle: 'Toggle pump mode', zirkTitle: 'Toggle circulation pump',
    mischerTitle: (m) => `Mixer ${m} (buffer share)`, hk: 'HC', solar: 'Solar', abgas: 'Flue', luft: 'Air', enth: 'Softener',
    auto: 'AUTO', hand: 'MANUAL', modusAus: 'OFF', hsO: 'Heater top', hsU: 'Heater bottom',
    typ: { kamin: 'Stove', holzvergaser: 'Wood boiler', pellet: 'Pellets', gas: 'Gas boiler', oel: 'Oil boiler', fernwaerme: 'District heat', bhkw: 'CHP' },
  },
};
const sprache = (cfg, hass) => {
  const l = cfg && cfg.sprache && cfg.sprache !== 'auto' ? cfg.sprache : (hass && (hass.locale?.language || hass.language)) || 'de';
  return String(l).toLowerCase().startsWith('de') ? 'de' : 'en';
};

const DEFAULTS = {
  hersteller: 'HOVAL',
  name_wp: 'WP',
  name_fm: 'FM',
  fuehler: [],
  hs_stufen: 7,
  t_min: 40,
  t_max: 55,
  farben: {
    aktiv: '#ffb300', warm: '#ff4b3e', kalt: '#3d8bff', led: '#4cd964', solar: '#ff9f1c', quelle: '#2dd4bf',
    tw_kalt: '#34c759', tw_warm: '#ff4b3e', geraet_hell: '#ef4438', geraet_dunkel: '#a3151a',
  },
};
const ZUSATZ_ICON = {
  kamin: 'mdi:fireplace', holzvergaser: 'mdi:fire', pellet: 'mdi:fire', gas: 'mdi:gas-burner', oel: 'mdi:oil',
  fernwaerme: 'mdi:pipe', bhkw: 'mdi:engine',
};
const TYPEN = ['trennblech', 'schicht', 'kombi', 'hygiene', 'getrennt'];
const HK_X = [170, 255, 85, 0, -85, -170];

const CSS = `
:host{display:block}
ha-card{overflow:hidden}
.kopf{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 16px 6px}
.kopf .l{display:flex;align-items:center;gap:12px}
.kopf .ic{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--secondary-background-color)}
.kopf .t1{font-size:16px;font-weight:600;color:var(--primary-text-color)}
.kopf .t2{font-size:12px;color:var(--secondary-text-color)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:999px;font-size:12px;font-weight:600;background:var(--secondary-background-color);color:var(--secondary-text-color)}
svg{display:block;width:100%;height:auto;max-height:860px;padding:4px 8px 8px;box-sizing:border-box}
.en{padding:2px 16px 14px;display:grid;gap:6px}
.er{display:grid;grid-template-columns:20px 110px 1fr 76px;align-items:center;gap:8px;font-size:12px;color:var(--secondary-text-color);cursor:pointer}
.er .b{height:8px;border-radius:4px;background:var(--secondary-background-color);overflow:hidden}
.er .b i{display:block;height:100%;border-radius:4px}
.er .v{text-align:right;font-weight:600;color:var(--primary-text-color);font-variant-numeric:tabular-nums}
.w0,.w1,.w2,.w3,.wa{fill:none;stroke-linecap:round;stroke-linejoin:round}
.w0{stroke:#000;stroke-opacity:.35;stroke-width:10px}.w1{stroke-width:7px}.w2{stroke:#fff;stroke-opacity:.22;stroke-width:2px}
.w3{stroke:#fff;stroke-width:2.6px;stroke-dasharray:1 13;animation:wf 1s linear infinite}.wa{stroke:#fff;stroke-width:1.6px}
.wk,.wn{fill:url(#wwNut);stroke:#1e2126;stroke-width:.8px}.wm{fill:#2b2f35;stroke:#8a9099;stroke-width:1.2px}
.ws{fill:var(--secondary-text-color,#9aa0a6)}.wv{fill:var(--primary-text-color,#e0e3e7)}
.wt{font-weight:700}.wc{text-anchor:middle}.we{text-anchor:end}
.wo{stroke:rgba(0,0,0,.45);stroke-width:2.5px;paint-order:stroke;stroke-linejoin:round}
.wb{animation:wb 1.6s infinite}.wp{animation:wp 1.6s infinite;transform-box:fill-box;transform-origin:center}
.wr{animation:wr 1.2s linear infinite;transform-origin:390px 226px}.wg{animation:wr 2.4s linear infinite;transform-box:fill-box;transform-origin:center}
.wl{animation:wl .9s infinite;transform-box:fill-box;transform-origin:50% 100%}
.wx{cursor:pointer}
@keyframes wf{to{stroke-dashoffset:-28}}@keyframes wb{50%{opacity:.45}}
@keyframes wp{from{opacity:.8}to{opacity:0;transform:scale(1.8)}}@keyframes wr{to{transform:rotate(360deg)}}
@keyframes wl{33%{transform:scale(1.08,.86)}66%{transform:scale(.94,1.1)}}
`;

/* ---------- Hilfsfunktionen ---------- */
const ENT = /^[a-z_]+\.[a-z0-9_]+$/i;
const isEnt = (v) => typeof v === 'string' && ENT.test(v);
const hasEnt = (o) => !!o && typeof o === 'object' && Object.values(o).some(isEnt);
const zeigen = (o) => o === true || (!!o && typeof o === 'object' && (o.anzeigen === true || hasEnt(o)));
const isNum = (v) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v));
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (t) => (isNum(t) ? Number(t).toFixed(1) + '°' : '–');
const watt = (w) => (w >= 1000 ? (w / 1000).toFixed(2) + ' kW' : Math.round(w) + ' W');
const collect = (o, out) => {
  if (isEnt(o)) out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => collect(x, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => collect(x, out));
  return out;
};

/* Gleiche DOM-Struktur? Dann nur Attribute/Texte angleichen, damit Animationen weiterlaufen. */
function sameShape(a, b) {
  if (a.childNodes.length !== b.childNodes.length) return false;
  for (let i = 0; i < a.childNodes.length; i++) {
    const x = a.childNodes[i], y = b.childNodes[i];
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) return false;
    if (x.nodeType === 1 && !sameShape(x, y)) return false;
  }
  return true;
}
function patch(a, b) {
  for (let i = 0; i < a.childNodes.length; i++) {
    const x = a.childNodes[i], y = b.childNodes[i];
    if (x.nodeType === 3) { if (x.data !== y.data) x.data = y.data; continue; }
    if (x.nodeType !== 1) continue;
    for (const at of y.attributes) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
    patch(x, y);
  }
}

/* ======================================================================== */
// Internal diagram template. Ports use local coordinates; a shared coordinate does
// not create an edge. Boundary components identify connections outside this diagram.
function diagramModel(c) {
  const split = c.typ === 'getrennt', tt = c.typ === 'kombi' || c.typ === 'hygiene';
  const fm = !tt && !!(c.fm || c.zirkulationspumpe), wp = !!c.wp, hk = c.heizkreise.length > 0, weiche = hk && !!c.weiche;
  const yt = 40 + 310 * clamp(c.trennung, 35, 70) / 100, gap = split ? 32 : 18;
  const bo = yt - gap, ru = yt + gap, bu = 340, ym = (ru + 338) / 2;
  const fmHeater = split && !!c.heizstab_oben && !!(c.fm || c.zirkulationspumpe);
  const ro = fmHeater ? Math.min(70, bo - 54) : 70;
  const nominalHeaterY = (ro + bo) / 2;
  const heaterY = fmHeater && Math.abs(nominalHeaterY - (bo - 14)) < 18 ? (ro + bo - 14) / 2 : nominalHeaterY;
  const components = {}, junctions = {}, connections = {};
  function component(id, x, y, width, height, parent = null) {
    if (components[id]) throw new Error(`Duplicate component: ${id}`);
    const origin = { x, y }, item = components[id] = { id, origin, baseOrigin: { x, y }, bounds: { x: 0, y: 0, width, height }, ports: {} };
    if (parent) {
      item.parent = parent.id; item.localOrigin = { x: x - parent.origin.x, y: y - parent.origin.y };
      Object.defineProperties(origin, {
        x: { enumerable: true, get: () => parent.origin.x + item.localOrigin.x, set: v => { item.localOrigin.x = v - parent.origin.x; } },
        y: { enumerable: true, get: () => parent.origin.y + item.localOrigin.y, set: v => { item.localOrigin.y = v - parent.origin.y; } },
      });
    }
    return item;
  }
  function port(comp, id, x, y, direction, medium, role, rect) {
    if (comp.ports[id]) throw new Error(`Duplicate port: ${comp.id}.${id}`);
    comp.ports[id] = { id, x: x - comp.origin.x, y: y - comp.origin.y, direction, medium, role,
      stub: rect && { x: rect[0] - comp.origin.x, y: rect[1] - comp.origin.y, width: rect[2], height: rect[3] } };
    return `${comp.id}.${id}`;
  }
  function junction(id, x, y, parent = null, medium = 'heating-water', kind = 'tee') {
    if (junctions[id]) throw new Error(`Duplicate junction: ${id}`);
    const j = junctions[id] = { id, x, y, medium, kind };
    if (parent) {
      j.parent = parent.id; j.local = { x: x - parent.origin.x, y: y - parent.origin.y };
      Object.defineProperties(j, {
        x: { enumerable: true, get: () => parent.origin.x + j.local.x, set: v => { j.local.x = v - parent.origin.x; } },
        y: { enumerable: true, get: () => parent.origin.y + j.local.y, set: v => { j.local.y = v - parent.origin.y; } },
      });
    }
    return id;
  }
  function connection(id, from, to, via = []) {
    if (connections[id]) throw new Error(`Duplicate connection: ${id}`);
    connections[id] = { id, from, to, via };
  }
  const hot = component(split ? 'hot-tank' : 'tank', 72, 14, 130, split ? yt - 22 : 360);
  const buffer = split ? component('buffer-tank', 72, yt + 8, 130, 366 - yt) : hot;
  const p = (comp, id, x, y, dir, role, rect, medium = 'heating-water') => port(comp, id, x, y, dir, medium, role, rect);
  component('tank-feet', 93, 362, 88, 22, buffer);
  if (tt) component('domestic-inner', 100, 18, 76, 334, hot);
  if (c.solar) component('solar-exchanger', 110, 348, 76, 26, buffer);
  if (c.heizstab_oben) component('upper-heater', 106, heaterY - 13, 108, 41, hot);
  if (c.heizstab_unten) component('lower-heater', 106, (ru + bu) / 2 - 13, 108, 41, buffer);
  c.fuehler.forEach((f, i) => {
    const pos = isNum(f.hoehe) ? Number(f.hoehe) : ((i + 0.5) * 100) / c.fuehler.length;
    const y = 40 + 310 * clamp(pos, 0, 100) / 100;
    component(`sensor-${i}`, 2, y - 15, 74, 30, split && y > yt ? buffer : hot);
  });

  const tank = {};
  if (fm) tank.fmSupply = p(hot, 'fm-supply', 206, 46, 'right', 'supply', [198, 40, 14, 12]);
  if (wp) {
    tank.wpSupply = p(hot, 'wp-supply', 206, ro, 'right', 'supply', [198, ro - 6, 14, 12]);
    tank.wpReturn = p(hot, 'wp-return', 206, bo, 'right', 'return', [198, bo - 6, 14, 12]);
  }
  if (wp || hk) {
    tank.lowerSupply = p(buffer, 'lower-supply', 206, ru, 'right', 'supply', [198, ru - 6, 14, 12]);
    tank.lowerReturn = p(buffer, 'lower-return', 206, bu, 'right', 'return', [198, bu - 6, 14, 12]);
  }
  if (c.kamin) {
    const ts = p(buffer, 'additional-supply', 70, ru, 'left', 'supply', [62, ru - 6, 14, 12]);
    const tr = p(buffer, 'additional-return', 70, bu, 'left', 'return', [62, bu - 6, 14, 12]);
    const device = component('additional-heat', -150, -30, 90, 394);
    const ds = p(device, 'supply', -58, ru, 'right', 'supply', [-64, ru - 6, 10, 12]);
    const dr = p(device, 'return', -58, bu, 'right', 'return', [-64, bu - 6, 10, 12]);
    connection('additional-supply', ds, ts);
    if (c.kamin.wmz) {
      const meter = component('additional-meter', -36, ru - 6, 12, 12, device);
      connections['additional-supply'].via.push(junction('additional-meter-point', -30, ru, meter, 'heating-water', 'meter'));
    }
    if (c.kamin.typ === 'fernwaerme') {
      const boundary = component('district-boundary', -120, -26, 30, 1); boundary.boundary = true;
      const a = p(boundary, 'supply', -120, -26, 'top', 'supply', null, 'district-loop');
      const b = p(boundary, 'return', -90, -26, 'top', 'return', null, 'district-loop');
      const d = p(device, 'district-supply', -120, 150, 'top', 'supply', null, 'district-loop');
      const e = p(device, 'district-return', -90, 150, 'top', 'return', null, 'district-loop');
      connection('district-supply', a, d); connection('district-return', e, b);
    }
    if (c.kamin.pumpe) {
      const pump = component('additional-pump', -34, bu - 10, 20, 20);
      const a = p(pump, 'in', -14, bu, 'right', 'return'), b = p(pump, 'out', -34, bu, 'left', 'return');
      connection('additional-return-tank', tr, a); connection('additional-pump-through', a, b); connection('additional-return-device', b, dr);
    } else connection('additional-return', tr, dr);
  }
  if (c.solar) {
    const ts = p(buffer, 'solar-supply', 110, 374, 'bottom', 'supply', [104, 368, 12, 8], 'solar-loop');
    const tr = p(buffer, 'solar-return', 122, 374, 'bottom', 'return', [116, 368, 12, 8], 'solar-loop');
    const sx = c.kamin ? -240 : -85, collector = component('solar-collector', sx, -22, 87, 286);
    const cs = p(collector, 'supply', sx + 52, 36, 'bottom', 'supply', null, 'solar-loop');
    const cr = p(collector, 'return', sx + 8, 36, 'bottom', 'return', null, 'solar-loop');
    connection('solar-supply', cs, ts); connection('solar-coil', ts, tr);
    if (c.solar.pumpe) {
      const pump = component('solar-pump', sx - 2, 190, 20, 20);
      const a = p(pump, 'in', sx + 8, 210, 'bottom', 'return', null, 'solar-loop');
      const b = p(pump, 'out', sx + 8, 190, 'top', 'return', null, 'solar-loop');
      connection('solar-return-tank', tr, a); connection('solar-pump-through', a, b); connection('solar-return-collector', b, cr);
    } else connection('solar-return', tr, cr);
  }
  if (fm) {
    tank.fmReturn = split ? p(hot, 'fm-return', 206, bo - 14, 'right', 'return', [198, bo - 20, 12, 12])
      : p(hot, 'fm-return', 137, 376, 'bottom', 'return', [131, 370, 12, 12]);
    const f = component('fm', 340, 14, 110, 90);
    const fs = p(f, 'supply', 336, 46, 'left', 'supply', [332, 40, 10, 12]);
    const fr = split ? p(f, 'return', 336, 90, 'left', 'return', [332, 84, 10, 12])
      : p(f, 'return', 452, 90, 'right', 'return', [448, 84, 10, 12]);
    p(f, 'cold-water', 362, 12, 'top', 'inlet', [356, 8, 12, 10], 'domestic-water');
    p(f, 'hot-water', 428, 12, 'top', 'outlet', [422, 8, 12, 10], 'domestic-water');
    connection('fm-supply', tank.fmSupply, fs); connection('fm-return', fr, tank.fmReturn);
  }
  if (tt) {
    p(hot, 'cold-water', 110, 18, 'top', 'inlet', [104, 12, 12, 8], 'domestic-water');
    p(hot, 'hot-water', 164, 18, 'top', 'outlet', [158, 12, 12, 8], 'domestic-water');
  }
  if (wp) {
    const w = component('wp', 330, 150, 120, 222), v = component('valve', 228, ym - 14, 49, 28);
    const ws = p(w, 'upper-supply', 350, 146, 'top', 'supply', [344, 142, 12, 10]);
    const wl = p(w, 'lower-supply', 326, ru, 'left', 'supply', [322, ru - 6, 10, 12]);
    const wr = p(w, 'return', 326, ym, 'left', 'return', [322, ym - 6, 10, 12]);
    const vo = p(v, 'upper', 262, ym - 14, 'top', 'return');
    const vu = p(v, 'lower', 262, ym + 14, 'bottom', 'return');
    const vw = p(v, 'wp', 277, ym, 'right', 'return');
    connection('wp-upper-supply', ws, tank.wpSupply);
    if (c.wp.wmz) {
      const meter = component('wp-meter', 294, 94, 12, 12, w);
      connections['wp-upper-supply'].via.push(junction('wp-meter-point', 300, 100, meter, 'heating-water', 'meter'));
    }
    connection('wp-upper-return', tank.wpReturn, vo);
    connection('wp-valve-return', vw, wr);
    if (hk) { junction('supply-tee', 295, ru); junction('return-tee', 240, bu); }
    connection('wp-lower-supply', wl, tank.lowerSupply, hk ? ['supply-tee'] : []);
    connection('wp-lower-return', tank.lowerReturn, vu, hk ? ['return-tee'] : []);
  }
  if (fm || tt) {
    const tk = fm ? 362 : 110, tw = fm ? 428 : 164, bottom = fm ? 12 : 18;
    const boundary = component('domestic-boundary', tk, -26, tw - tk, 1, fm ? components.fm : hot); boundary.boundary = true;
    const cold = p(boundary, 'cold', tk, -26, 'top', 'inlet', null, 'domestic-water');
    const warm = p(boundary, 'hot', tw, -26, 'top', 'outlet', null, 'domestic-water');
    const device = fm ? 'fm' : hot.id;
    if (c.zirkulationspumpe) {
      const cj = junction('domestic-cold-tee', tk, -6, boundary, 'domestic-water');
      const wj = junction('domestic-hot-tee', tw, -6, boundary, 'domestic-water');
      connection('domestic-cold', cold, `${device}.cold-water`, [cj]);
      connection('domestic-hot', `${device}.hot-water`, warm, [wj]);
      const pump = component('circulation-pump', (tk + tw) / 2 - 10, -16, 20, 20, boundary);
      const a = p(pump, 'in', (tk + tw) / 2 + 10, -6, 'right', 'inlet', null, 'domestic-water');
      const b = p(pump, 'out', (tk + tw) / 2 - 10, -6, 'left', 'outlet', null, 'domestic-water');
      connection('circulation-hot', wj, a); connection('circulation-pump-through', a, b); connection('circulation-cold', b, cj);
    } else {
      connection('domestic-cold', cold, `${device}.cold-water`);
      connection('domestic-hot', `${device}.hot-water`, warm);
    }
    if (c.trinkwasser && c.trinkwasser.zaehler) {
      const meter = component('domestic-meter', tk - 6, -24, 12, 12, boundary);
      connections['domestic-cold'].via.unshift(junction('domestic-meter-point', tk, -18, meter, 'domestic-water', 'meter'));
    }
    if (tt) connection('domestic-exchanger', `${device}.cold-water`, `${device}.hot-water`);
  }
  if (wp && ['sole', 'wasser'].includes(c.wp.typ)) {
    const w = components.wp, source = component('heat-source', 382, 404, 100, 156);
    const wa = p(w, 'source-in', 400, 372, 'bottom', 'inlet', [394, 368, 12, 8], 'source-loop');
    const wb = p(w, 'source-out', 430, 372, 'bottom', 'outlet', [424, 368, 12, 8], 'source-loop');
    const a = p(source, 'in', 400, c.wp.typ === 'sole' ? 540 : 535, 'top', 'inlet', null, 'source-loop');
    const b = p(source, 'out', 430, c.wp.typ === 'sole' ? 540 : 535, 'top', 'outlet', null, 'source-loop');
    connection('source-in', wa, a); connection('source-out', b, wb);
    if (c.wp.typ === 'sole') connection('source-ground-loop', a, b);
  }
  if (hk) {
    const dy = weiche ? 70 : 0, yy = 420 + dy, yr = 448 + dy, ymix = 482 + dy, ye = 548 + dy;
    const positions = HK_X.slice(0, c.heizkreise.length).sort((a, b) => a - b);
    const left = Math.min(...positions) - 40;
    const manifold = component('manifolds', left, yy, (weiche ? 372 : 317) - left, yr - yy);
    const supply = junction('manifold-primary-supply', weiche ? 356 : 295, yy, manifold, 'heating-water', weiche ? 'endpoint' : 'tee');
    const ret = junction('manifold-primary-return', weiche ? 372 : 312, yr, manifold, 'heating-water', weiche ? 'endpoint' : 'tee');
    const sl = p(manifold, 'supply-left', left, yy, 'left', 'supply');
    const sr = weiche ? supply : p(manifold, 'supply-right', 300, yy, 'right', 'supply');
    const rl = p(manifold, 'return-left', left, yr, 'left', 'return');
    const rr = weiche ? ret : p(manifold, 'return-right', 317, yr, 'right', 'return');
    const sj = [], rj = [];
    positions.forEach((x, i) => {
      const branch = component(`heating-circuit-${i}`, x - 22, ye - 9, 44, 60);
      const bs = p(branch, 'supply', x - 16, ye, 'top', 'supply');
      const br = p(branch, 'return', x + 16, ye, 'top', 'return');
      const sv = junction(`manifold-supply-${i}`, x - 16, yy, manifold);
      const rv = junction(`manifold-return-${i}`, x + 16, yr, manifold);
      sj.push(sv); rj.push(rv);
      if (c.heizkreise[i].mischer) {
        const mixer = component(`heating-mixer-${i}`, x - 50, ymix - 14, 49, 28, branch);
        const mi = p(mixer, 'supply', x - 16, ymix - 14, 'top', 'supply');
        const mo = p(mixer, 'mixed', x - 16, ymix + 14, 'bottom', 'supply');
        const mb = p(mixer, 'bypass', x - 1, ymix, 'right', 'return');
        const tee = junction(`heating-return-tee-${i}`, x + 16, ymix, branch);
        connection(`heating-supply-${i}`, sv, mi);
        connection(`heating-mixed-${i}`, mo, bs);
        connection(`heating-return-${i}`, br, rv, [tee]);
        connection(`heating-bypass-${i}`, tee, mb);
      } else {
        connection(`heating-supply-${i}`, sv, bs);
        connection(`heating-return-${i}`, br, rv);
      }
      if (c.heizkreise[i].pumpe) {
        const pump = component(`heating-pump-${i}`, x - 26, 504 + dy, 20, 20, branch);
        const a = p(pump, 'in', x - 16, 504 + dy, 'top', 'supply');
        const b = p(pump, 'out', x - 16, 524 + dy, 'bottom', 'supply');
        connections[c.heizkreise[i].mischer ? `heating-mixed-${i}` : `heating-supply-${i}`].to = a;
        connection(`heating-pump-through-${i}`, a, b);
        connection(`heating-pump-out-${i}`, b, bs);
      }
    });
    // The primary connection may land exactly at the visible rail end.
    if (weiche) {
      connection('manifold-supply', sl, supply, sj);
      connection('manifold-return', rl, ret, rj);
    } else {
      connection('manifold-supply', sl, sr, [...sj, supply]);
      connection('manifold-return', rl, rr, [...rj, ret]);
    }
    let hs = supply, hr = ret;
    if (weiche) {
      const w = component('separator', 322, 400, 20, 72);
      const a = p(w, 'primary-supply', 322, 410, 'left', 'supply');
      const b = p(w, 'primary-return', 322, 462, 'left', 'return');
      const d = p(w, 'secondary-supply', 342, 410, 'right', 'supply');
      const e = p(w, 'secondary-return', 342, 462, 'right', 'return');
      connection('separator-supply', d, supply); connection('separator-return', ret, e); hs = a; hr = b;
    }
    connection('hk-supply', wp ? 'supply-tee' : tank.lowerSupply, hs);
    connection('hk-return', hr, wp ? 'return-tee' : tank.lowerReturn);
  }
  const resolve = (ref) => {
    if (junctions[ref]) return junctions[ref];
    const [id, name] = ref.split('.');
    const result = components[id] && components[id].ports[name];
    if (!result) throw new Error(`Unknown diagram reference: ${ref}`);
    return result;
  };
  for (const edge of Object.values(connections)) {
    if (resolve(edge.from).medium !== resolve(edge.to).medium) throw new Error(`Medium mismatch: ${edge.id}`);
    for (const id of edge.via) {
      if (!junctions[id]) throw new Error(`Unknown junction: ${id}`);
      if (junctions[id].medium !== resolve(edge.from).medium) throw new Error(`Medium mismatch: ${edge.id} via ${id}`);
    }
  }
  for (const edge of Object.values(connections)) {
    edge.routingPolicy = /(?:pump-through)/.test(edge.id) ? 'pump-through'
      : /(?:coil|exchanger|ground-loop)/.test(edge.id) ? 'internal-coil'
      : /^manifold-/.test(edge.id) ? 'manifold-rail'
      : ['fm-supply', 'fm-return', 'wp-upper-supply', 'wp-lower-supply', 'wp-upper-return', 'wp-lower-return', 'wp-valve-return'].includes(edge.id) ? 'external' : 'fixed';
  }
  // Routing areas are local painted exclusion zones, separate from reference bounds.
  if (fm) {
    for (const id of new Set([hot.id, buffer.id, 'fm', ...(wp ? ['wp', 'valve'] : [])])) {
      const b = components[id].bounds;
      components[id].routingAreas = [{ ...b }];
      for (const port of Object.values(components[id].ports)) if (port.stub)
        components[id].routingAreas.push({ ...port.stub });
    }
    for (const id of Object.keys(components).filter(id => id.startsWith('sensor-'))) {
      components[id].routingAreas = [{ x:-80, y:0, width:240, height:30 }];
    }
  }
  return { components, junctions, connections, geometry: { yt, ro, bo, ru, bu, ym, heaterY },
    routingScope: { fm: fm && (!wp || (c.wp.typ === 'luft' && !c.wp.wmz && !c.wp.sg_ready && !c.wp.quelle_ein && !c.wp.quelle_aus && String(c.name_wp ?? '').length <= 5 && String(c.text_wp_an ?? '').length <= 12 && String(c.text_wp_aus ?? '').length <= 12)) && !hk && !c.solar && !c.kamin && !c.zirkulationspumpe && !c.trinkwasser && !c.heizstab_oben && !c.heizstab_unten && !c.legionellen && String(c.hersteller ?? '').length <= 8 && String(c.name_fm ?? '').length <= 3 && c.fuehler.every(f => String(f.name ?? '').length <= 20) && String(c.text_tw_kalt ?? '').length <= 20 && String(c.text_tw_warm ?? '').length <= 20 } };

}
function diagramPort(model, reference) {
  if (model.junctions[reference]) return model.junctions[reference];
  const [id, name] = reference.split('.'), component = model.components[id], port = component && component.ports[name];
  if (!port) throw new Error(`Unknown port: ${reference}`);
  return { x: component.origin.x + port.x, y: component.origin.y + port.y };
}
function diagramStub(model, reference) {
  const [id, name] = reference.split('.'), component = model.components[id], port = component && component.ports[name];
  if (!port || !port.stub) throw new Error(`Unknown stub: ${reference}`);
  const r = port.stub;
  return [component.origin.x + r.x, component.origin.y + r.y, r.width, r.height];
}

// clearance is the TOTAL obstacle inflation radius, including any stroke allowance.
// Ports may cross their own owner's inflated obstacles only on their escape segment.
function routeOrthogonalConnection(request) {
  const fail = (code, reason) => ({ status: 'failed', code, reason });
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const vectors = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
  const dirs = ['left', 'right', 'top', 'bottom'];
  const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
  const pointValid = p => p && finite(p.x) && finite(p.y);
  if (!request || !pointValid(request.from) || !pointValid(request.to) ||
      !Object.hasOwn(vectors, request.from.direction) || !Object.hasOwn(vectors, request.to.direction) ||
      (request.vias !== undefined && !Array.isArray(request.vias)) ||
      (request.obstacles !== undefined && !Array.isArray(request.obstacles))) {
    return fail('invalid-input', 'Expected finite ports, cardinal directions, vias and obstacles.');
  }
  const clearance = request.clearance === undefined ? 6 : request.clearance;
  const lead = request.lead === undefined ? 16 : request.lead;
  if (!finite(clearance) || clearance < 0 || !finite(lead) || lead <= 0 ||
      (request.vias || []).some(p => !pointValid(p)) ||
      (request.obstacles || []).some(b => !b || !pointValid(b) || !finite(b.width) || !finite(b.height) || b.width < 0 || b.height < 0)) {
    return fail('invalid-input', 'Clearance, lead, vias or obstacle dimensions are invalid.');
  }
  const boxes = (request.obstacles || []).map(b => ({
    owner: b.owner, left: b.x - clearance, right: b.x + b.width + clearance,
    top: b.y - clearance, bottom: b.y + b.height + clearance
  }));
  if (boxes.some(b => ![b.left, b.right, b.top, b.bottom].every(finite))) {
    return fail('invalid-input', 'Inflated obstacle coordinates must be finite.');
  }
  // Closed obstacle boundaries prevent a centerline from grazing the inflated body.
  const inside = (p, b) => p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;
  const intersects = (a, c, b) => a.y === c.y
    ? a.y >= b.top && a.y <= b.bottom && Math.min(a.x, c.x) <= b.right && Math.max(a.x, c.x) >= b.left
    : a.x === c.x && a.x >= b.left && a.x <= b.right && Math.min(a.y, c.y) <= b.bottom && Math.max(a.y, c.y) >= b.top;
  const sameOwner = (port, box) => port.owner != null && box.owner === port.owner;
  // One unit of numerical space beyond each padded boundary. No iterative probing.
  const margin = 1;
  function escape(port) {
    const [dx, dy] = vectors[port.direction];
    let length = lead;
    for (const b of boxes) {
      if (!sameOwner(port, b)) continue;
      if (dx && port.y >= b.top && port.y <= b.bottom) {
        const far = dx > 0 ? b.right - port.x : port.x - b.left;
        const near = dx > 0 ? b.left - port.x : port.x - b.right;
        if (far >= 0 && near <= length) length = Math.max(length, far + margin);
      } else if (dy && port.x >= b.left && port.x <= b.right) {
        const far = dy > 0 ? b.bottom - port.y : port.y - b.top;
        const near = dy > 0 ? b.top - port.y : port.y - b.bottom;
        if (far >= 0 && near <= length) length = Math.max(length, far + margin);
      }
    }
    const end = { x: port.x + dx * length, y: port.y + dy * length };
    if (!pointValid(end) || boxes.some(b => !sameOwner(port, b) && intersects(port, end, b)) ||
        boxes.some(b => inside(end, b))) return null;
    return end;
  }
  const start = escape(request.from), end = escape(request.to);
  if (!start || !end) return fail('blocked-port', 'A port escape intersects an incompatible obstacle or cannot clear its owner.');
  const vias = request.vias || [];
  if (vias.some(p => boxes.some(b => inside(p, b)))) return fail('no-route', 'A required via lies inside an inflated obstacle.');
  const anchors = [start, ...vias, end];
  const xs = new Set(), ys = new Set();
  for (const p of anchors) { xs.add(p.x); ys.add(p.y); }
  for (const b of boxes) {
    xs.add(b.left - margin); xs.add(b.right + margin);
    ys.add(b.top - margin); ys.add(b.bottom + margin);
  }
  const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b);
  if (![...X, ...Y].every(finite)) return fail('invalid-input', 'Search coordinates must be finite.');
  const target = anchors.map(p => [X.indexOf(p.x), Y.indexOf(p.y)]);
  const advance = (x, y, stage) => {
    while (stage < target.length && target[stage][0] === x && target[stage][1] === y) stage++;
    return stage;
  };
  const key = (x, y, direction, stage) => `${x},${y},${direction},${stage}`;
  const heap = [];
  function push(item) {
    let i = heap.length; heap.push(item);
    while (i) { const p = (i - 1) >> 1; if (heap[p].cost <= item.cost) break; heap[i] = heap[p]; i = p; }
    heap[i] = item;
  }
  function pop() {
    const first = heap[0], last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (2 * i + 1 < heap.length) {
        let c = 2 * i + 1;
        if (c + 1 < heap.length && heap[c + 1].cost < heap[c].cost) c++;
        if (heap[c].cost >= last.cost) break;
        heap[i] = heap[c]; i = c;
      }
      heap[i] = last;
    }
    return first;
  }
  const sx = target[0][0], sy = target[0][1], initialStage = advance(sx, sy, 1);
  const initialKey = key(sx, sy, request.from.direction, initialStage);
  const distance = new Map([[initialKey, 0]]), previous = new Map();
  push({ x: sx, y: sy, direction: request.from.direction, stage: initialStage, cost: 0, key: initialKey });
  let finish = null;
  while (heap.length) {
    const cur = pop();
    if (distance.get(cur.key) !== cur.cost) continue;
    if (cur.stage === target.length && cur.x === target[target.length - 1][0] && cur.y === target[target.length - 1][1] && cur.direction !== request.to.direction) { finish = cur.key; break; }
    for (const direction of dirs) {
      if (direction === opposite[cur.direction]) continue;
      const [dx, dy] = vectors[direction], x = cur.x + dx, y = cur.y + dy;
      if (x < 0 || x >= X.length || y < 0 || y >= Y.length) continue;
      const a = { x: X[cur.x], y: Y[cur.y] }, b = { x: X[x], y: Y[y] };
      if (boxes.some(box => intersects(a, b, box))) continue;
      const stage = advance(x, y, cur.stage), nextKey = key(x, y, direction, stage);
      const cost = cur.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (direction === cur.direction ? 0 : 20);
      if (cost >= (distance.get(nextKey) ?? Infinity)) continue;
      distance.set(nextKey, cost); previous.set(nextKey, cur.key);
      push({ x, y, direction, stage, cost, key: nextKey });
    }
  }
  if (!finish) return fail('no-route', 'No obstacle-free orthogonal route satisfies the ports and required vias.');
  const raw = [];
  for (let k = finish; k; k = previous.get(k)) {
    const [x, y] = k.split(',').map(Number);
    raw.push({ x: X[x], y: Y[y] });
  }
  raw.reverse();
  // Preserve all mandatory via coordinates, even when collinear.
  const viaAt = p => vias.some(v => v.x === p.x && v.y === p.y);
  const simplified = raw.filter((p, i) => i === 0 || i === raw.length - 1 || viaAt(p) ||
    !((raw[i - 1].x === p.x && p.x === raw[i + 1].x) || (raw[i - 1].y === p.y && p.y === raw[i + 1].y)));
  const points = [{ x: request.from.x, y: request.from.y }, ...simplified, { x: request.to.x, y: request.to.y }];
  return { status: 'routed', points: points.filter((p, i) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y) };
}

/* Compiles a batch of already validated orthogonal centerlines. The router must
 * validate straight segments including halfWidth and owner escape exceptions.
 * This compiler additionally validates conservative corner/bridge envelopes. */
function compilePipeRoutes(routes, options = {}) {
  const radius = options.radius ?? 8, bridgeRadius = options.bridgeRadius ?? 6, halfWidth = options.halfWidth ?? 5;
  const obstacles = options.obstacles ?? [];
  const fail = (code, ids, reason) => ({status:'failed', code, connectionIds:[...new Set(ids)].sort(), reason});
  if (![radius, bridgeRadius, halfWidth].every(n => Number.isFinite(n) && n >= 0) || bridgeRadius === 0 || !Array.isArray(routes)) return fail('invalid-input', [], 'Invalid compiler options or routes');
  const rs = routes.map(r => ({...r})).sort((a,b) =>
    Number(a.role === 'supply') - Number(b.role === 'supply') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const eq = (a,b) => a.x === b.x && a.y === b.y;
  const dist = (a,b) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  const inRange = (v,a,b) => v >= Math.min(a,b) && v <= Math.max(a,b);
  const nodeAt = (r,p) => (r.nodes || []).filter(n => n.ref != null && eq(n,p));
  const junction = (a,b,p) => nodeAt(a,p).some(n => nodeAt(b,p).some(m => m.ref === n.ref));
  const pointSegmentDistance = (p,a,b) => {
    const x=Math.max(Math.min(a.x,b.x),Math.min(Math.max(a.x,b.x),p.x));
    const y=Math.max(Math.min(a.y,b.y),Math.min(Math.max(a.y,b.y),p.y));
    return Math.hypot(p.x-x,p.y-y);
  };
  const segmentDistance = (a,b,c,d) => Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
  const seen = new Set();
  for (const r of rs) {
    if (typeof r.id !== 'string' || seen.has(r.id) || !Array.isArray(r.points) || r.points.length < 2 || !Array.isArray(r.nodes) || r.points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return fail('invalid-input', [r.id].filter(x => typeof x === 'string'), 'Invalid route or duplicate ID');
    seen.add(r.id);
    for (let i=0;i<r.points.length-1;i++) { const a=r.points[i],b=r.points[i+1]; if (eq(a,b) || (a.x !== b.x && a.y !== b.y)) return fail('invalid-centerline',[r.id],'Segments must be nonzero and orthogonal'); }
    r._compilerRadii = r.points.map((p,i) => {
      if (!i || i === r.points.length-1 || nodeAt(r,p).length) return 0;
      const a=r.points[i-1], b=r.points[i+1];
      if ((a.x === p.x) === (p.x === b.x)) return 0;
      return Math.min(radius,dist(a,p)/2,dist(p,b)/2);
    });
    r._compilerCrossings = [];
  }
  for (const r of rs) for (let i=0;i<r.points.length-1;i++) for (let j=i+1;j<r.points.length-1;j++) {
    const a=r.points[i], b=r.points[i+1], c=r.points[j], d=r.points[j+1], ah=a.y===b.y, ch=c.y===d.y;
    let contact=false, overlap=false, point;
    if (ah===ch) {
      if (ah ? a.y===c.y : a.x===c.x) {
        const lo=Math.max(Math.min(ah?a.x:a.y,ah?b.x:b.y),Math.min(ah?c.x:c.y,ah?d.x:d.y));
        const hi=Math.min(Math.max(ah?a.x:a.y,ah?b.x:b.y),Math.max(ah?c.x:c.y,ah?d.x:d.y));
        contact=lo<=hi; overlap=lo<hi;
        if(contact) point=ah?{x:lo,y:a.y}:{x:a.x,y:lo};
      }
    } else {
      point=ah?{x:c.x,y:a.y}:{x:a.x,y:c.y};
      contact=inRange(point.x,a.x,b.x)&&inRange(point.y,a.y,b.y)&&inRange(point.x,c.x,d.x)&&inRange(point.y,c.y,d.y);
    }
    if(contact && (j!==i+1 || overlap || !eq(point,b))) return fail('self-contact',[r.id],'Route intersects or overlaps itself');
  }
  // The later route in paint order owns the bridge at each crossing.
  for (let i=0;i<rs.length;i++) for (let j=i+1;j<rs.length;j++) {
    const a=rs[i], b=rs[j];
    for(let ai=0;ai<a.points.length-1;ai++) for(let bi=0;bi<b.points.length-1;bi++) {
      const p=a.points[ai],q=a.points[ai+1],u=b.points[bi],v=b.points[bi+1], ah=p.y===q.y,bh=u.y===v.y;
      let x;
      if (ah===bh) {
        if ((ah ? p.y!==u.y : p.x!==u.x)) {
          const separation=Math.abs(ah?p.y-u.y:p.x-u.x);
          const lo=Math.max(Math.min(ah?p.x:p.y,ah?q.x:q.y),Math.min(ah?u.x:u.y,ah?v.x:v.y));
          const hi=Math.min(Math.max(ah?p.x:p.y,ah?q.x:q.y),Math.max(ah?u.x:u.y,ah?v.x:v.y));
          if (segmentDistance(p,q,u,v)<2*halfWidth) return fail('pipe-clearance',[a.id,b.id],'Pipe envelopes overlap');
          continue;
        }
        const lo=Math.max(Math.min(ah?p.x:p.y,ah?q.x:q.y),Math.min(ah?u.x:u.y,ah?v.x:v.y));
        const hi=Math.min(Math.max(ah?p.x:p.y,ah?q.x:q.y),Math.max(ah?u.x:u.y,ah?v.x:v.y));
        if (lo>hi) { if (segmentDistance(p,q,u,v)<2*halfWidth) return fail('pipe-clearance',[a.id,b.id],'Pipe envelopes overlap'); continue; }
        if (lo<hi) return fail('collinear-overlap',[a.id,b.id],'Collinear segments overlap');
        x=ah?{x:lo,y:p.y}:{x:p.x,y:lo};
      } else {
        x=ah?{x:u.x,y:p.y}:{x:p.x,y:u.y};
        if (!inRange(x.x,p.x,q.x)||!inRange(x.y,p.y,q.y)||!inRange(x.x,u.x,v.x)||!inRange(x.y,u.y,v.y)) { if (segmentDistance(p,q,u,v)<2*halfWidth) return fail('pipe-clearance',[a.id,b.id],'Pipe envelopes overlap'); continue; }
      }
      if (junction(a,b,x)) continue;
      if (ah===bh || eq(x,p)||eq(x,q)||eq(x,u)||eq(x,v)) return fail('unnamed-contact',[a.id,b.id],'Contact is not a named shared junction');
      const clearance=bridgeRadius+halfWidth;
      if (dist(x,p)<=a._compilerRadii[ai]+clearance || dist(x,q)<=a._compilerRadii[ai+1]+clearance || dist(x,u)<=b._compilerRadii[bi]+clearance || dist(x,v)<=b._compilerRadii[bi+1]+clearance) return fail('crossing-near-corner',[a.id,b.id],'Crossing too close to an endpoint or corner');
      // The later route takes the bridge; the earlier route remains straight.
      b._compilerCrossings.push({point:x, segment:bi, otherId:a.id, otherSegment:ai, bridge:true});
      a._compilerCrossings.push({point:x, segment:ai, otherId:b.id, otherSegment:bi, bridge:false});
    }
  }
  const intersectsObstacle = (box) => obstacles.some(o => Number.isFinite(o.x)&&Number.isFinite(o.y)&&Number.isFinite(o.width)&&Number.isFinite(o.height) && box.x1 <= o.x+o.width && box.x2 >= o.x && box.y1 <= o.y+o.height && box.y2 >= o.y);
  const bbox = pts => ({x1:Math.min(...pts.map(p=>p.x))-halfWidth,y1:Math.min(...pts.map(p=>p.y))-halfWidth,x2:Math.max(...pts.map(p=>p.x))+halfWidth,y2:Math.max(...pts.map(p=>p.y))+halfWidth});
  const connectedLegs = (route, indices) => {
    const chosen=new Set(indices), ps=route.points;
    const sameDirection = (i,j) => Math.sign(ps[i+1].x-ps[i].x)===Math.sign(ps[j+1].x-ps[j].x) && Math.sign(ps[i+1].y-ps[i].y)===Math.sign(ps[j+1].y-ps[j].y);
    for (const start of indices) {
      let i=start; while(i>0 && sameDirection(i-1,i)) chosen.add(--i);
      i=start; while(i<ps.length-2 && sameDirection(i,i+1)) chosen.add(++i);
    }
    // A short S-shaped continuation remains one stroke: the leg beyond
    // the next bend must continue in the same direction, never reverse.
    if (indices.length===2) {
      let left=Math.min(...chosen), right=Math.max(...chosen);
      if (left>0 && sameDirection(left-1,right)) {
        chosen.add(--left); while(left>0 && sameDirection(left-1,left)) chosen.add(--left);
      }
      if (right<ps.length-2 && sameDirection(right+1,Math.min(...indices))) {
        chosen.add(++right); while(right<ps.length-2 && sameDirection(right,right+1)) chosen.add(++right);
      }
    }
    return chosen;
  };
  const curvePipeConflict = (box, route, bridge, ownSegments) => {
    const allowedOwn=connectedLegs(route,ownSegments);
    for (const other of rs) {
      for (let i=0;i<other.points.length-1;i++) {
        const a=other.points[i], b=other.points[i+1];
        // The bridge deliberately crosses this one segment. Other segments,
        // even from the same route, still have to clear its envelope.
        if (other.id===route.id && allowedOwn.has(i)) continue;
        if (bridge && bridge.otherId===other.id && bridge.otherSegment===i) continue;
        const segment=bbox([a,b]);
        if (box.x1<=segment.x2 && box.x2>=segment.x1 && box.y1<=segment.y2 && box.y2>=segment.y1) return other.id;
      }
    }
    return null;
  };
  const result={};
  for (const r of rs) {
    let d=`M${r.points[0].x} ${r.points[0].y}`;
    for(let i=0;i<r.points.length-1;i++) {
      const a=r.points[i], b=r.points[i+1], dx=Math.sign(b.x-a.x),dy=Math.sign(b.y-a.y), endR=r._compilerRadii[i+1];
      const crossings=r._compilerCrossings.filter(c=>c.segment===i && c.bridge).sort((c,e)=>dist(a,c.point)-dist(a,e.point));
      for(let k=0;k<crossings.length;k++) {
        const c=crossings[k], p=c.point, br=bridgeRadius;
        if (k && dist(p,crossings[k-1].point)<=2*(br+halfWidth)) return fail('crossings-too-close',[r.id,c.otherId,crossings[k-1].otherId],'Bridge envelopes overlap');
        const before={x:p.x-dx*br,y:p.y-dy*br}, after={x:p.x+dx*br,y:p.y+dy*br};
        // Full circle envelope is conservative for either SVG arc sweep.
        const bridgeBox=bbox([{x:p.x-br,y:p.y-br},{x:p.x+br,y:p.y+br}]);
        if (intersectsObstacle(bridgeBox)) return fail('curve-obstacle',[r.id],'Bridge envelope intersects an obstacle');
        const bridgeConflict=curvePipeConflict(bridgeBox,r,c,[i]);
        if (bridgeConflict) return fail('curve-pipe-clearance',[r.id,bridgeConflict],'Bridge envelope intersects another pipe');
        d+=`L${before.x} ${before.y}A${br} ${br} 0 0 1 ${after.x} ${after.y}`;
      }
      const before={x:b.x-dx*endR,y:b.y-dy*endR}; d+=`L${before.x} ${before.y}`;
      if(endR) {
        const next=r.points[i+2], after={x:b.x+Math.sign(next.x-b.x)*endR,y:b.y+Math.sign(next.y-b.y)*endR};
        const cornerBox=bbox([before,b,after]);
        if(intersectsObstacle(cornerBox)) return fail('curve-obstacle',[r.id],'Corner envelope intersects an obstacle');
        const cornerConflict=curvePipeConflict(cornerBox,r,null,[i,i+1]);
        if(cornerConflict) return fail('curve-pipe-clearance',[r.id,cornerConflict],'Corner envelope intersects another pipe');
        d+=`Q${b.x} ${b.y} ${after.x} ${after.y}`;
      }
    }
    result[r.id]={points:r.points.map(p=>({x:p.x,y:p.y})),path:d,crossings:r._compilerCrossings.map(c=>({point:c.point,otherId:c.otherId,bridge:c.bridge}))};
  }
  return {status:'routed',routes:result,paintOrder:rs.map(r => r.id)};
}

// Resolve model references without mutating geometry or confusing bounds with obstacles.
function routeDiagramConnections(model, ids, options = {}) {
  const result = {}, candidates = [];
  const primary = ['fm-supply', 'fm-return', 'wp-upper-supply', 'wp-lower-supply', 'wp-upper-return', 'wp-lower-return', 'wp-valve-return'];
  if (model.components.wp && model.components.fm && ids.some(id => primary.includes(id)) &&
      (ids.length !== primary.length || primary.some(id => !ids.includes(id)))) {
    for (const id of ids) result[id] = { status:'unsupported', reason:'incomplete-batch' };
    return result;
  }
  const resolve = ref => {
    const j = model.junctions[ref];
    if (j) return { x: j.x, y: j.y, medium: j.medium, ref };
    const dot = ref.lastIndexOf('.'), owner = ref.slice(0, dot), c = model.components[owner], p = c && c.ports[ref.slice(dot + 1)];
    return p && { x: c.origin.x + p.x, y: c.origin.y + p.y, direction: p.direction, medium: p.medium, role: p.role, owner, ref };
  };
  const obstacles = [];
  for (const [id, c] of Object.entries(model.components)) for (const area of c.routingAreas || [])
    obstacles.push({ id, owner: id, x: c.origin.x + area.x, y: c.origin.y + area.y, width: area.width, height: area.height });
  if (model.routingScope) {
    // Domestic paths are fixed V-then-H polylines, with their full painted width.
    for (const id of ['domestic-cold', 'domestic-hot']) {
      const edge = model.connections[id]; if (!edge) continue;
      const a = resolve(edge.from), b = resolve(edge.to); if (!a || !b) continue;
      obstacles.push({ id, x: a.x - 5, y: Math.min(a.y,b.y) - 5, width: 10, height: Math.abs(a.y-b.y) + 10 });
      if (a.x !== b.x) obstacles.push({ id, x: Math.min(a.x,b.x) - 5, y: b.y - 5, width: Math.abs(a.x-b.x) + 10, height: 10 });
    }
    const boundary = model.components['domestic-boundary'];
    if (boundary) obstacles.push({ id:'domestic-labels', x: boundary.origin.x - 120, y: boundary.origin.y - 8, width: 350, height: 22 });
    if (Object.keys(model.components).some(id => id.startsWith('sensor-'))) obstacles.push({ id:'legend', x: 370, y: 110, width: 90, height: 28 });
  }
  for (const id of ids) {
    const edge = model.connections[id];
    if (!edge) { result[id] = { status:'failed', code:'unknown-reference' }; continue; }
    const refs = [edge.from, ...(edge.via || []), edge.to], resolved = refs.map(resolve);
    if (resolved.some(p => !p)) { result[id] = { status:'failed', code:'unknown-reference' }; continue; }
    if (resolved.some(p => p.medium !== resolved[0].medium)) { result[id] = { status:'failed', code:'medium-mismatch' }; continue; }
    if (edge.routingPolicy !== 'external') { result[id] = { status:'unsupported', reason:'connection-policy' }; continue; }
    if (!resolved[0].direction || !resolved.at(-1).direction) { result[id] = { status:'unsupported', reason:'direction-required' }; continue; }
    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).length) { result[id] = { status:'failed', code:'invalid-options' }; continue; }
    if (model.routingScope && !model.routingScope.fm) { result[id] = { status:'unsupported', reason:'unsupported-configuration' }; continue; }
    const routed = routeOrthogonalConnection({ from: resolved[0], to: resolved.at(-1), vias: resolved.slice(1,-1).map(p => ({ id:p.ref, x:p.x, y:p.y })), obstacles, clearance:13, lead:16 });
    if (routed.status !== 'routed') { result[id] = routed; continue; }
    const role = resolved[0].role === 'supply' && resolved.at(-1).role === 'supply' ? 'supply' : 'neutral';
    candidates.push({ id, role, points:routed.points, nodes:resolved.map(p => ({ ref:p.ref, x:p.x, y:p.y })) });
  }
  if (candidates.length) {
    const compiled = compilePipeRoutes(candidates, { radius:8, bridgeRadius:6, halfWidth:5, obstacles });
    if (compiled.status === 'routed') for (const [id, route] of Object.entries(compiled.routes)) result[id] = { status:'routed', ...route, paintOrder:compiled.paintOrder.indexOf(id) };
    else for (const c of candidates) result[c.id] = { status:'failed', code:compiled.code, reason:compiled.reason };
  }
  return result;
}

class WarmwasserSchemaCard extends HTMLElement {
  static getConfigElement() { return document.createElement('warmwasser-schema-card-editor'); }
  static getStubConfig() { return { speicher: { typ: 'trennblech' }, fuehler: [] }; }
  getCardSize() { return 10; }
  getGridOptions() { return { columns: 'full', min_columns: 6 }; }

  setConfig(config) {
    if (!config) throw new Error('Keine Konfiguration / no configuration');
    const c = { ...DEFAULTS, ...config, farben: { ...DEFAULTS.farben, ...(config.farben || {}) } };
    c.fuehler = (config.fuehler || [])
      .map((f) => (Array.isArray(f) ? { name: f[0], entity: f[1], hoehe: f[2] } : { name: f.name, entity: f.entity, hoehe: f.hoehe }))
      .filter((f) => isEnt(f.entity));
    const sp = config.speicher || {};
    const tr = sp.trennung ?? config.trennung;
    c.typ = TYPEN.includes(sp.typ) ? sp.typ : tr === false || tr === null ? 'schicht' : 'trennblech';
    c.trennung = isNum(tr) ? Number(tr) : 50;
    c.volumen = sp.volumen ?? config.volumen ?? null;
    c.volumen_ww = sp.volumen_ww ?? null;
    c.heizstab_oben = hasEnt(config.heizstab_oben) ? { ...config.heizstab_oben } : null;
    c.heizstab_unten = hasEnt(config.heizstab_unten) ? { ...config.heizstab_unten } : null;
    const wpc = config.wp || (config.wp_leistung ? { leistung: config.wp_leistung, schwelle: config.wp_schwelle } : null);
    c.wp = hasEnt(wpc) ? { schwelle: 100, typ: 'luft', ...wpc } : null;
    const kz = config.zusatzwaerme || config.kamin;
    c.kamin = hasEnt(kz) ? { warm: 30, feuer: 35, ...kz, typ: ZUSATZ_ICON[kz.typ] ? kz.typ : 'kamin' } : null;
    c.solar = hasEnt(config.solar) ? { ...config.solar } : null;
    c.fm = zeigen(config.fm) ? (typeof config.fm === 'object' ? { ...config.fm } : {}) : null;
    c.weiche = zeigen(config.weiche) ? (typeof config.weiche === 'object' ? { ...config.weiche } : {}) : null;
    c.trinkwasser = hasEnt(config.trinkwasser) ? { ...config.trinkwasser } : null;
    c.zirkulationspumpe = isEnt(config.zirkulationspumpe) ? config.zirkulationspumpe : '';
    c.pv = isEnt(config.pv) ? config.pv : config.pv && isEnt(config.pv.leistung) ? config.pv.leistung : '';
    c.aussen = isEnt(config.aussen) ? config.aussen : '';
    c.legionellen = hasEnt(config.legionellen) ? { tage: 7, ...config.legionellen } : null;
    c.heizkreise = (config.heizkreise || []).filter(hasEnt).slice(0, 6);
    c.energie = (config.energie || []).filter((e) => e && isEnt(e.entity));
    this._cfg = c;
    this._model = diagramModel(c);
    this._ents = [...new Set(collect(c, []))];
    this._key = null;
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  _init() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><ha-card><div id="c"></div></ha-card>`;
    this._box = root.getElementById('c');
    root.addEventListener('click', (ev) => this._click(ev));
  }

  _update() {
    if (!this._cfg || !this._hass) return;
    const key = sprache(this._cfg, this._hass) + '|' + this._ents.map((e) => this._hass.states[e]?.state).join('|');
    if (key === this._key) return;
    this._key = key;
    if (!this._box) this._init();
    const tpl = document.createElement('template');
    tpl.innerHTML = this._render();
    if (this._box.firstChild && sameShape(this._box, tpl.content)) patch(this._box, tpl.content);
    else this._box.replaceChildren(tpl.content);
  }

  _click(ev) {
    const el = ev.composedPath().find((n) => n.dataset && (n.dataset.act || n.dataset.more));
    if (!el || !this._hass) return;
    ev.stopPropagation();
    if (el.dataset.act === 'modus') {
      this._hass.callService('input_select', 'select_next', { entity_id: this._cfg.kamin.modus, cycle: true });
    } else if (el.dataset.act === 'zirk') {
      this._hass.callService('homeassistant', 'toggle', { entity_id: this._cfg.zirkulationspumpe });
    } else if (el.dataset.more) {
      const e = new Event('hass-more-info', { bubbles: true, composed: true });
      e.detail = { entityId: el.dataset.more };
      this.dispatchEvent(e);
    }
  }

  _render() {
    const c = this._cfg, h = this._hass, F = c.farben, L = T[sprache(c, h)];
    const S = (e) => (e && h.states[e] ? h.states[e].state : 'unknown');
    const U = (e, d) => (e && h.states[e]?.attributes?.unit_of_measurement) || d;
    const ON = (e) => { const s = S(e); return s === 'on' || (isNum(s) && Number(s) > 0); };
    const NUM = (e) => (e && isNum(S(e)) ? Number(S(e)) : 0);
    const more = (e) => (e ? ` data-more="${esc(e)}" class="wx"` : '');
    const titel = c.titel ?? L.titel;

    /* ---------- Speicher ---------- */
    const fl = c.fuehler.map((f, i) => {
      const pos = isNum(f.hoehe) ? Number(f.hoehe) : ((i + 0.5) * 100) / c.fuehler.length;
      return { name: f.name, entity: f.entity, index: i, wert: S(f.entity), y: 40 + (310 * clamp(pos, 0, 100)) / 100 };
    }).sort((a, b) => a.y - b.y);
    const TYP = c.typ, TG = TYP === 'trennblech', SPLIT = TYP === 'getrennt', TT = TYP === 'kombi' || TYP === 'hygiene';
    const model = this._model, geo = model.geometry;
    const y_t = geo.yt, y_ro = geo.ro, y_bo = geo.bo, y_ru = geo.ru, y_bu = geo.bu, y_m = geo.ym;
    const point = (ref) => diagramPort(model, ref);
    // Canonical symbol recipes stay byte-identical at the configured origin.
    const openComponent = (id) => {
      const b = model.components[id], dx = b.origin.x - b.baseOrigin.x, dy = b.origin.y - b.baseOrigin.y;
      return dx || dy ? `<g transform="translate(${dx} ${dy})">` : '';
    };
    const closeComponent = (id) => {
      const b = model.components[id];
      return b.origin.x !== b.baseOrigin.x || b.origin.y !== b.baseOrigin.y ? '</g>' : '';
    };
    const portStub = (ref) => stub(...diagramStub(model, ref));
    const tankId = SPLIT ? 'hot-tank' : 'tank', bufferId = SPLIT ? 'buffer-tank' : 'tank';
    const ueber = fl.filter((f) => f.y < y_t), unter = fl.filter((f) => f.y > y_t);
    const w_ueber = ueber.length ? ueber[ueber.length - 1].wert : unter.length ? unter[0].wert : 'x';
    const w_unter = unter.length ? unter[0].wert : w_ueber;
    const stops = (TG || SPLIT || !fl.length ? [...fl, { y: y_t - 2, wert: w_ueber }, { y: y_t + 2, wert: w_unter }] : [...fl]).sort((a, b) => a.y - b.y);
    const temps = fl.map((f) => f.wert).filter(isNum).map(Number);
    const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
    const col = (t) => {
      if (!isNum(t)) return 'rgb(138,144,153)';
      const x = clamp((Number(t) - c.t_min) / (c.t_max - c.t_min), 0, 1);
      if (x < 0.5) { const k = x * 2; return `rgb(${Math.trunc(47 + 119 * k)},${Math.trunc(107 - 37 * k)},${Math.trunc(255 - 15 * k)})`; }
      const k = (x - 0.5) * 2; return `rgb(${Math.trunc(166 + 89 * k)},${Math.trunc(70 - 11 * k)},${Math.trunc(240 - 192 * k)})`;
    };

    /* ---------- Heizstäbe ---------- */
    const heiz = (x, n) => {
      if (!x) return null;
      const step = x.stufe && isNum(S(x.stufe)) ? Math.trunc(Number(S(x.stufe))) : 0;
      const p = NUM(x.leistung);
      return { ...x, name: x.name || n, step, p, on: x.stufe ? step > 0 : p > 5 };
    };
    const hso = heiz(c.heizstab_oben, L.hsO), hsu = heiz(c.heizstab_unten, L.hsU);
    const HS = !!(hso || hsu), hs_on = (hso && hso.on) || (hsu && hsu.on);
    const hs_p = (hso ? hso.p : 0) + (hsu ? hsu.p : 0), hs_hatP = (hso && hso.leistung) || (hsu && hsu.leistung);

    /* ---------- Wärmepumpe ---------- */
    const W = c.wp, WP = !!W;
    const wp = W ? NUM(W.leistung) : 0;
    const wp_sperre = W && W.sperre ? ON(W.sperre) : false;
    const wp_abtau = W && W.abtauen ? ON(W.abtauen) : false;
    const kuehl = W && W.kuehlen ? ON(W.kuehlen) : false;
    const wp_on = WP && !wp_sperre && (W.betrieb ? ON(W.betrieb) : wp > W.schwelle);
    const CW = kuehl ? F.kalt : F.warm, CK = kuehl ? F.warm : F.kalt;
    const QT = W ? (['sole', 'wasser'].includes(W.typ) ? W.typ : 'luft') : null;
    /* Umschaltventil: vb = Anteil obere Zone (Warmwasser), null = unbekannt */
    let vb = null;
    if (W && W.ventil) {
      const s = S(W.ventil), sl = String(s).toLowerCase();
      if (isNum(s)) vb = clamp(Number(s) > 1 ? Number(s) / 100 : Number(s), 0, 1);
      else if (sl === 'on' || /warm|ww|dhw|trink|oben|upper|hot/.test(sl)) vb = 1;
      else if (sl === 'off' || /heiz|puffer|unten|lower|heat|buffer|hz/.test(sl)) vb = 0;
    }
    const wpO = wp_on && (vb === null || vb > 0.04), wpU = wp_on && (vb === null || vb < 0.96);
    const tO = vb === null ? 1 : 1 / Math.max(vb, 0.04), tU = vb === null ? 1 : 1 / Math.max(1 - vb, 0.04);

    /* ---------- Frischwassermodul / Trinkwasser ---------- */
    const ZK = !!c.zirkulationspumpe, FMx = c.fm, FM = !TT && !!(FMx || ZK);
    const TW = FM || TT;
    const dc = TW ? point(model.connections['domestic-cold'].from) : null, de = TW ? point(model.connections['domestic-cold'].to) : null;
    const dh = TW ? point(model.connections['domestic-hot'].from) : null, dw = TW ? point(model.connections['domestic-hot'].to) : null;
    const tk = TW ? dc.x : 0, tw = TW ? dw.x : 0, tyb = TW ? de.y : 0, tm = (tk + tw) / 2;
    const zirk_on = ZK && ON(c.zirkulationspumpe);
    const zapf = FMx && FMx.durchfluss ? NUM(FMx.durchfluss) > 0.1 : false;
    const fm_on = FMx && FMx.pumpe ? ON(FMx.pumpe) : zapf || zirk_on;
    // Keep validation and paint text identical. These strings do not affect route geometry.
    const fmTempText = FMx && FMx.temp ? fmt(S(FMx.temp)) : '';
    const fmFlowText = FMx && FMx.durchfluss ? `${r1(NUM(FMx.durchfluss))} l/min` : '';
    const wpPowerText = W && W.leistung ? watt(wp) : '';
    const wpCopText = W && W.cop ? `COP ${isNum(S(W.cop)) ? Number(S(W.cop)).toFixed(1) : '–'}` : '';
    const wpStatus = WP ? (wp_sperre ? [L.sperre, F.warm] : wp_abtau ? [L.abtauen, F.kalt] : kuehl && wp_on ? [L.kuehlen, F.kalt]
      : wp_on ? [W.waerme ? L.waerme + ' ' + watt(NUM(W.waerme)) : c.text_wp_an ?? L.wpAn, '#9aa0a6'] : [c.text_wp_aus ?? L.wpAus, '#9aa0a6']) : null;
    const wpTemperatures = W ? [W.vorlauf ? 'VL ' + fmt(S(W.vorlauf)) : '', W.ruecklauf ? 'RL ' + fmt(S(W.ruecklauf)) : ''].filter(Boolean).join(' · ') : '';

    /* ---------- Zusatzwärme ---------- */
    const K = c.kamin;
    const kTyp = K ? K.typ : null, kName = K ? K.name || L.typ[kTyp] : '';
    const kFeuerTyp = !!K && ['kamin', 'holzvergaser', 'pellet', 'gas', 'oel'].includes(kTyp);
    let t_k = 'x', k_tr = 'flat', k_warm = false, k_feuer = false, k_glut = false, k_pumpe = false, k_mod = ['', '#8a9099'];
    if (K) {
      t_k = K.temp ? S(K.temp) : 'x';
      const tkf = isNum(t_k) ? Number(t_k) : 0;
      if (K.trend) {
        const tr = S(K.trend).toLowerCase();
        k_tr = /steig|ris|up/.test(tr) ? 'up' : /fall|sink|down/.test(tr) ? 'down' : 'flat';
      }
      k_pumpe = K.pumpe ? ON(K.pumpe) : false;
      k_warm = isNum(t_k) && tkf >= K.warm;
      k_feuer = K.brenner ? ON(K.brenner) : !kFeuerTyp && K.pumpe ? k_pumpe : isNum(t_k) && tkf >= K.feuer;
      k_glut = kFeuerTyp && !k_feuer && k_warm;
      if (K.modus) {
        const km = S(K.modus).toLowerCase();
        k_mod = km.includes('auto') ? [L.auto, F.led] : km.includes('hand') || km.includes('manu') ? [L.hand, F.aktiv]
          : [['0', 'aus', 'off'].includes(km) ? L.modusAus : km.slice(0, 6).toUpperCase(), '#8a9099'];
      }
    }
    const kHell = !!K && ['pellet', 'gas', 'oel', 'fernwaerme', 'bhkw'].includes(kTyp);

    /* ---------- Solar ---------- */
    const SO = c.solar;
    const so_on = SO && SO.pumpe ? ON(SO.pumpe) : SO && SO.leistung ? NUM(SO.leistung) > 10 : false;
    const x0 = K ? -240 : -85;

    /* ---------- Heizkreise ---------- */
    const W8 = !!c.weiche, dyw = W8 ? 70 : 0;
    const hkPos = c.heizkreise.map((_, i) => model.components[`heating-circuit-${i}`].origin.x + 22);
    const hks = c.heizkreise.map((hk, i) => {
      const MIX = !!hk.mischer, m = MIX ? S(hk.mischer) : 'x';
      const a = MIX && isNum(m) ? (clamp(Number(m), -100, 100) + 100) / 200 : 1;
      const zeilen = [];
      if (hk.vorlauf || hk.vorlauf_soll)
        zeilen.push({ t: 'VL ' + [hk.vorlauf ? fmt(S(hk.vorlauf)) : '', hk.vorlauf_soll ? '→ ' + fmt(S(hk.vorlauf_soll)) : ''].filter(Boolean).join(' '), e: hk.vorlauf || hk.vorlauf_soll });
      if (hk.raum) zeilen.push({ t: L.raum + ' ' + fmt(S(hk.raum)), e: hk.raum });
      if (hk.wmz) zeilen.push({ t: r1(NUM(hk.wmz)) + ' ' + U(hk.wmz, 'kWh'), e: hk.wmz });
      return {
        ...hk, name: hk.name || `${L.hk} ${i + 1}`, MIX, m, a, x: hkPos[i], zeilen,
        on: !!hk.pumpe && ON(hk.pumpe),
        c: MIX ? `color-mix(in srgb,${CW} ${Math.round(a * 100)}%,${CK})` : CW,
      };
    });
    const HK = hks.length > 0;
    const hk_fl = hks.filter((x) => x.on).reduce((s, x) => s + x.a, 0);
    const akt = hks.map((x, i) => x.on && x.a > 0.04 ? i : -1).filter((i) => i >= 0);
    const aktSupply = akt.map((i) => model.junctions[`manifold-supply-${i}`].x);
    const aktReturn = akt.map((i) => model.junctions[`manifold-return-${i}`].x);
    const td = `animation-duration:${r2(1 / Math.max(hk_fl, 0.04))}s`;
    const hkExtra = HK ? Math.max(0, ...hks.map((x) => x.zeilen.length * 12 + (x.typ ? 26 : 0))) : 0;
    const bx1 = HK ? model.components.manifolds.origin.x : 130;

    /* ---------- Bausteine ---------- */
    const rohr = (d, cl, f = false, t = 1) =>
      `<path d="${d}" class="w0"/><path d="${d}" class="w1" style="stroke:${cl}"/><path d="${d}" class="w2"/>` +
      (f ? `<path d="${d}" class="w3"${t !== 1 ? ` style="animation-duration:${r2(t)}s"` : ''}/>` : '');
    const pumpe = (x, y, d, on) => {
      const dx = { l: -1, r: 1 }[d] || 0, dy = { u: -1, d: 1 }[d] || 0, cl = on ? F.aktiv : '#8a9099';
      return (on ? `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="${cl}" stroke-width="1.5" class="wp"/>` : '') +
        `<circle cx="${x}" cy="${y}" r="10" fill="#2b2f35" stroke="${cl}" stroke-width="1.6"/>` +
        `<path d="M${r2(x + 10 * dx)} ${r2(y + 10 * dy)}L${r2(x - 5 * dx + 8.66 * dy)} ${r2(y - 5 * dy + 8.66 * dx)}L${r2(x - 5 * dx - 8.66 * dy)} ${r2(y - 5 * dy - 8.66 * dx)}Z" fill="${on ? F.aktiv : '#6b7280'}"/>`;
    };
    const mischer = (x, y, cl, a = null, cw = CW, ck = CK) =>
      `<line x1="${x}" y1="${y}" x2="${x - 18}" y2="${y}" stroke="#8a9099" stroke-width="2"/>` +
      `<rect x="${x - 34}" y="${y - 9}" width="16" height="18" rx="3" class="wm"/>` +
      `<text x="${x - 26}" y="${y + 3}" font-size="8" class="wc wt" fill="#cfd4da">M</text>` +
      `<path d="M${x - 9} ${y - 14}H${x + 9}L${x} ${y}ZM${x - 9} ${y + 14}H${x + 9}L${x} ${y}ZM${x + 15} ${y - 9}V${y + 9}L${x} ${y}Z" fill="#1f2329" stroke="${cl}" stroke-width="1.6" stroke-linejoin="round"/>` +
      (a !== null ? `<path d="M${x - 9} ${y - 14}H${x + 9}L${x} ${y}Z" fill="${cw}" fill-opacity="${r2(0.1 + 0.8 * a)}"/><path d="M${x + 15} ${y - 9}V${y + 9}L${x} ${y}Z" fill="${ck}" fill-opacity="${r2(0.9 - 0.8 * a)}"/>` : '') +
      `<circle cx="${x}" cy="${y}" r="2.5" fill="${cl}"/>`;
    const verteiler = (edge, cl) => {
      const from = point(edge.from), to = point(edge.to);
      const points = edge.via.map((id) => model.junctions[id]);
      const route = (offset) => {
        if (to.y === from.y && points.every((j) => j.y === from.y && j.x >= Math.min(from.x, to.x) && j.x <= Math.max(from.x, to.x))) return `M${from.x} ${from.y + offset}H${to.x}`;
        return `M${from.x} ${from.y + offset}` + points.map((j) => `H${j.x}V${j.y + offset}`).join('') + `H${to.x}V${to.y + offset}`;
      };
      return `<path d="${route(0)}" stroke="#000" stroke-opacity=".35" stroke-width="18"/><path d="${route(0)}" stroke="${cl}" stroke-width="14"/>` +
        `<path d="${route(-3)}" stroke="#fff" stroke-opacity=".25" stroke-width="3"/>` +
        `<rect x="${from.x - 5}" y="${from.y - 10}" width="5" height="20" rx="1.5" class="wk"/><rect x="${to.x}" y="${to.y - 10}" width="5" height="20" rx="1.5" class="wk"/>`;
    };
    const tee = (x, y) => `<circle cx="${x}" cy="${y}" r="5.5" class="wn"/><circle cx="${x - 1.5}" cy="${y - 1.5}" r="1.6" fill="#fff" opacity=".45"/>`;
    const stub = (x, y, w, hh) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="2" class="wk"/>`;
    const zaehlerSym = (x, y) => `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" rx="2" fill="#2b2f35" stroke="#cfd4da"/><circle cx="${x}" cy="${y}" r="2.6" fill="none" stroke="#cfd4da"/>`;
    const flamme = (w, hh) =>
      `M${-w} 0C${-w - 2} ${r1(-hh * 0.45)} ${r1(-w * 0.15)} ${r1(-hh * 0.6)} ${r1(w * 0.1)} ${-hh}C${r1(w * 0.5)} ${r1(-hh * 0.6)} ${r1(w + 2)} ${r1(-hh * 0.4)} ${w} 0Z`;
    const pille = (f) => {
      const y = r1(f.y), cl = col(f.wert);
      return `<g${more(f.entity)}><line x1="60" y1="${y}" x2="72" y2="${y}" stroke="${cl}" stroke-width="1.5"/>` +
        `<rect x="2" y="${r1(y - 15)}" width="58" height="30" rx="10" style="fill:var(--secondary-background-color,#2a2d33)" stroke="${cl}" stroke-width="1.5"/>` +
        `<text x="31" y="${r1(y - 3)}" font-size="8" class="wc ws" font-weight="600" letter-spacing=".8">${esc(f.name)}</text>` +
        `<text x="31" y="${r1(y + 10)}" font-size="12" class="wc wt wv">${fmt(f.wert)}</text>` +
        `<circle cx="72" cy="${y}" r="4" fill="${cl}" stroke="#fff" stroke-width="1.5"/></g>`;
    };
    const stab = (y, hs) => {
      const cl = hs.on ? F.aktiv : '#b0b6bd', pitch = 70 / c.hs_stufen;
      let s = hs.on ? `<ellipse cx="156" cy="${y}" rx="50" ry="13" fill="url(#wwHeat)" class="wb" style="animation-duration:2.4s"/>` : '';
      s += `<g${more(hs.stufe || hs.leistung || hs.temp)}><path d="M202 ${y}h-10l-3-4${'l-6 8l-6-8'.repeat(6)}l-3 4" fill="none" stroke="${cl}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
      s += `<rect x="198" y="${y - 11}" width="16" height="22" rx="3" fill="#2b2f35" stroke="${cl}" stroke-width="1.5"/>`;
      s += `<text x="192" y="${y - 13}" font-size="9.5" class="we wo wt" fill="${hs.on ? F.aktiv : '#fff'}">${esc(hs.name)}</text>`;
      if (hs.stufe) for (let i = 0; i < c.hs_stufen; i++)
        s += `<rect x="${r2(124 + i * pitch)}" y="${y + 11}" width="${r2(pitch - 2)}" height="4" rx="1.5" fill="${i < hs.step ? F.aktiv : 'rgba(255,255,255,.3)'}"/>`;
      const info = [hs.leistung ? watt(hs.p) : '', hs.temp ? fmt(S(hs.temp)) : ''].filter(Boolean).join(' · ');
      if (info) s += `<text x="192" y="${y + (hs.stufe ? 28 : 22)}" font-size="9" class="we wo" fill="#fff">${info}</text>`;
      return s + '</g>';
    };
    const chip = (icon, text, on, e) =>
      `<span class="chip${e ? ' wx' : ''}"${e ? ` data-more="${esc(e)}"` : ''}${on ? ` style="background:color-mix(in srgb,${F.aktiv} 16%,transparent);color:${F.aktiv}"` : ''}><ha-icon icon="${icon}" style="--mdc-icon-size:15px"></ha-icon>${text}</span>`;

    /* ---------- Kopfzeile ---------- */
    let o = `<div class="kopf"><div class="l"><div class="ic"><ha-icon icon="mdi:water-boiler" style="--mdc-icon-size:22px;color:${avg !== null ? col(avg) : 'var(--secondary-text-color)'}"></ha-icon></div>`;
    o += `<div><div class="t1">${esc(titel)}</div>${avg !== null ? `<div class="t2">${L.speicherAvg} ${r1(avg)} °C</div>` : ''}</div></div><div class="chips">`;
    if (c.aussen) o += chip('mdi:thermometer', fmt(S(c.aussen)), false, c.aussen);
    if (c.pv) o += chip('mdi:solar-power', watt(NUM(c.pv)), NUM(c.pv) > 10, c.pv);
    if (SO && SO.kollektor) o += chip('mdi:solar-panel', fmt(S(SO.kollektor)), so_on, SO.kollektor);
    if (K && (K.temp || K.brenner || K.pumpe)) o += chip(ZUSATZ_ICON[kTyp], K.temp ? fmt(t_k) : k_feuer ? L.an : L.aus, k_feuer, K.temp || K.brenner || K.pumpe);
    if (WP && W.leistung) o += chip(kuehl ? 'mdi:snowflake' : 'mdi:heat-pump', watt(wp), wp_on, W.leistung);
    if (HS && hs_hatP) o += chip('mdi:heating-coil', watt(hs_p), hs_on);
    o += '</div></div>';

    /* ---------- Abmessungen ---------- */
    const QS = WP && QT !== 'luft';
    const baseMinX = Math.min(0, K ? -160 : 0, SO ? x0 - 10 : 0, HK ? bx1 - 30 : 0);
    let unten = HK ? 574 + dyw + hkExtra : SO ? 412 : 400;
    if (QS) unten = Math.max(unten, 566);
    let minX = baseMinX, maxX = 486, minY = -30, maxY = unten;
    // Internal origin changes are used by tests and must not clip moved symbols.
    for (const b of Object.values(model.components)) {
      const dx = b.origin.x - b.baseOrigin.x, dy = b.origin.y - b.baseOrigin.y;
      if (dx || dy) {
        minX = Math.min(minX, baseMinX + dx); maxX = Math.max(maxX, 486 + dx);
        minY = Math.min(minY, -30 + dy); maxY = Math.max(maxY, unten + dy);
      }
    }
    o += `<svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}"><defs>`;
    o += `<linearGradient id="wwTemp" gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="0" y2="374"><stop offset="0" stop-color="${col(stops[0].wert)}"/>` +
      stops.map((st) => `<stop offset="${Math.round(((st.y - 14) / 360) * 1000) / 1000}" stop-color="${col(st.wert)}"/>`).join('') +
      `<stop offset="1" stop-color="${col(stops[stops.length - 1].wert)}"/></linearGradient>`;
    for (const id of new Set([tankId, bufferId])) {
      const tank = model.components[id], dy = tank.origin.y - tank.baseOrigin.y;
      if (dy) o += `<linearGradient id="wwTemp-${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${14 + dy}" x2="0" y2="${374 + dy}"><stop offset="0" stop-color="${col(stops[0].wert)}"/>` +
        stops.map((st) => `<stop offset="${Math.round(((st.y - 14) / 360) * 1000) / 1000}" stop-color="${col(st.wert)}"/>`).join('') +
        `<stop offset="1" stop-color="${col(stops[stops.length - 1].wert)}"/></linearGradient>`;
    }
    o += `<linearGradient id="wwCyl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".18" stop-color="#fff" stop-opacity=".12"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>`;
    o += `<linearGradient id="wwRed" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${F.geraet_hell}"/><stop offset="1" stop-color="${F.geraet_dunkel}"/></linearGradient>`;
    o += `<linearGradient id="wwBox" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>`;
    o += `<linearGradient id="wwLegend"><stop offset="0" stop-color="rgb(47,107,255)"/><stop offset=".5" stop-color="rgb(166,70,240)"/><stop offset="1" stop-color="rgb(255,59,48)"/></linearGradient>`;
    o += `<radialGradient id="wwHeat"><stop offset="0" stop-color="${F.aktiv}" stop-opacity=".75"/><stop offset="1" stop-color="${F.aktiv}" stop-opacity="0"/></radialGradient>`;
    o += `<linearGradient id="wwNut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7dbe0"/><stop offset=".35" stop-color="#9aa1aa"/><stop offset=".55" stop-color="#6b727c"/><stop offset="1" stop-color="#3a3f46"/></linearGradient>`;
    if (K) {
      o += kHell
        ? `<linearGradient id="wwSteel"><stop offset="0" stop-color="#f1f3f5"/><stop offset=".5" stop-color="#d4d8dd"/><stop offset="1" stop-color="#9aa1aa"/></linearGradient>`
        : `<linearGradient id="wwSteel"><stop offset="0" stop-color="#5c626b"/><stop offset=".45" stop-color="#3d4249"/><stop offset="1" stop-color="#1c1f23"/></linearGradient>`;
      o += `<linearGradient id="wwFlue"><stop offset="0" stop-color="#7a818b"/><stop offset=".5" stop-color="#4a4f57"/><stop offset="1" stop-color="#2a2d33"/></linearGradient>`;
      o += `<radialGradient id="wwFire" cx=".5" cy="1" r=".95"><stop offset="0" stop-color="${kTyp === 'gas' ? '#7fb2ff' : '#ffb347'}" stop-opacity=".95"/><stop offset=".45" stop-color="${kTyp === 'gas' ? '#3d8bff' : '#ff5a1f'}" stop-opacity=".45"/><stop offset="1" stop-color="#ff3b1f" stop-opacity="0"/></radialGradient>`;
      o += `<radialGradient id="wwGlut"><stop offset="0" stop-color="#ff8c2a" stop-opacity=".95"/><stop offset="1" stop-color="#ff3b1f" stop-opacity="0"/></radialGradient>`;
      o += `<clipPath id="wwWin"><rect x="-136" y="218" width="62" height="76" rx="4"/></clipPath>`;
    }
    if (SO) o += `<linearGradient id="wwSol" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b4a8a"/><stop offset="1" stop-color="#0f1a33"/></linearGradient>`;
    if (W8) o += `<linearGradient id="wwW8" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CW}"/><stop offset="1" stop-color="${CK}"/></linearGradient>`;
    o += `<pattern id="wwGrid" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 4L4 0M-1 1L1-1M3 5L5 3M0 0L4 4M-1 3L1 5M3-1L5 1" stroke="#fff" stroke-opacity=".55" stroke-width=".5"/></pattern>`;
    o += `<filter id="wwShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity=".35"/></filter></defs>`;

    /* ---------- Rohre ---------- */
    const routingIds = ['fm-supply', 'fm-return', ...(WP ? ['wp-upper-supply', 'wp-lower-supply', 'wp-upper-return', 'wp-lower-return', 'wp-valve-return'] : [])];
    const movedRouting = FM && [...new Set([tankId, ...(SPLIT ? ['buffer-tank'] : []), 'fm', ...(WP ? ['wp', 'valve'] : [])])].some(id => { const b = model.components[id]; return b.origin.x !== b.baseOrigin.x || b.origin.y !== b.baseOrigin.y; });
    const routes = movedRouting ? routeDiagramConnections(model, routingIds) : null;
    if (routes) for (const [id, route] of Object.entries(routes)) if (route.status !== 'routed') {
      const error = new Error(`Pipe routing ${route.status}: ${id}: ${route.code || route.reason}`);
      error.code = route.code || route.reason; throw error;
    }
    if (movedRouting && ([fmTempText.length > 7, fmFlowText.length > 10,
      wpPowerText.length > 10, wpCopText.length > 12, wpTemperatures.length > 20,
      wpStatus && ![L.wpAn, L.wpAus, L.sperre, L.abtauen, L.kuehlen].includes(wpStatus[0]) && String(wpStatus[0]).length > 14].some(Boolean))) {
      const error = new Error('Pipe routing unsupported: display label overflow');
      error.code = 'label-overflow'; throw error;
    }
    const primaryPipes = {};
    const primaryPipe = (id, legacyPath, color, on, duration) => {
      const svg = rohr(routes ? routes[id].path : legacyPath, color, on, duration);
      if (routes) { primaryPipes[id] = svg; return ''; }
      return svg;
    };
    if (FM) {
      const fs = point(model.connections['fm-supply'].from), fe = point(model.connections['fm-supply'].to);
      const fr = point(model.connections['fm-return'].from), ft = point(model.connections['fm-return'].to);
      o += primaryPipe('fm-supply', `M${fs.x} ${fs.y}H${fe.x}${fe.y !== fs.y ? `V${fe.y}` : ''}`, F.warm, fm_on);
      // Separate tanks need the fresh-water return on the hot-water tank,
      // while shared tanks retain the bottom connection.
      const radius = Math.min(8, Math.max(0, (ft.y - fr.y) / 2));
      const simpleReturn = WP && ft.y > 108 && ft.y <= 147 && !c.wp.wmz;
      const returnX = simpleReturn ? 280 : WP && (ft.y > 108 || c.wp.wmz) ? 322 : 315;
      // Near the charging-pipe corner, cross its straight leg instead. With a
      // meter on that leg, carry the return below the crossing and back up.
      const returnDetour = WP && ft.y <= 147 && !!c.wp.wmz;
      const detourY = Math.max(155, ft.y + 32);
      const fmRuecklauf = SPLIT
        ? returnDetour
          ? `M${fr.x} ${fr.y}H330Q322 ${fr.y} 322 ${fr.y + 8}V${detourY - 8}Q322 ${detourY} 314 ${detourY}H288Q280 ${detourY} 280 ${detourY - 8}V${ft.y + 8}Q280 ${ft.y} 272 ${ft.y}H${ft.x}`
          : `M${fr.x} ${fr.y}H${returnX + radius}Q${returnX} ${fr.y} ${returnX} ${fr.y + radius}V${ft.y - radius}Q${returnX} ${ft.y} ${returnX - radius} ${ft.y}H${ft.x}`
        : `M${fr.x} ${fr.y}H458Q466 90 466 98V382Q466 390 458 390H${ft.x + 8}Q${ft.x} 390 ${ft.x} 382V${ft.y}`;
      o += primaryPipe('fm-return', fmRuecklauf, F.kalt, fm_on);
    }
    if (WP) {
      const returnTee = HK ? model.junctions[model.connections['wp-lower-return'].via[0]] : null;
      const wo = point(model.connections['wp-upper-return'].from), wv = point(model.connections['wp-upper-return'].to);
      const wu = point(model.connections['wp-lower-return'].from), wvu = point(model.connections['wp-lower-return'].to);
      const wvp = point(model.connections['wp-valve-return'].from), wr = point(model.connections['wp-valve-return'].to);
      const ws = point(model.connections['wp-upper-supply'].from), wst = point(model.connections['wp-upper-supply'].to);
      const wl = point(model.connections['wp-lower-supply'].from), wlt = point(model.connections['wp-lower-supply'].to);
      o += primaryPipe('wp-upper-return', `M${wo.x} ${wo.y}H252Q262 ${y_bo} 262 ${y_bo + 10}V${wv.y}${wv.x !== 262 ? `H${wv.x}` : ''}`, CK, wpO, tO);
      o += primaryPipe('wp-lower-return', `M${wu.x} ${wu.y}${returnTee && returnTee.y !== wu.y ? `V${returnTee.y}` : ''}H252Q262 ${returnTee ? returnTee.y : y_bu} 262 ${(returnTee ? returnTee.y : y_bu) - 10}V${wvu.y}${wvu.x !== 262 ? `H${wvu.x}` : ''}`, CK, wpU, tU);
      o += primaryPipe('wp-valve-return', `M${wvp.x} ${wvp.y}H${wr.x}${wr.y !== wvp.y ? `V${wr.y}` : ''}`, CK, wp_on);
      // Bridge the fresh-water return where it crosses the hot-water charging pipe.
      const simpleReturn = FM && SPLIT && y_bo - 14 > 108 && y_bo - 14 <= 147 && !c.wp.wmz;
      const wwLadung = FM && SPLIT && (y_bo - 14 > 108 || c.wp.wmz) && !simpleReturn
        ? 'H328A6 6 0 0 1 316 128H308'
        : 'H308';
      const fmY = FM && SPLIT ? point(model.connections['fm-return'].to).y : y_bo - 14;
      const bridgeY = simpleReturn ? 90 : fmY;
      const verticalBridge = FM && SPLIT && (simpleReturn || (!c.wp.wmz && fmY >= y_ro + 20 && fmY <= 108))
        ? `V${bridgeY + 6}A6 6 0 0 1 300 ${bridgeY - 6}` : '';
      const meter = model.connections['wp-upper-supply'].via.length ? model.junctions[model.connections['wp-upper-supply'].via[0]] : null;
      const meterDetour = meter && (meter.x !== 300 || meter.y > 120 || meter.y < y_ro + 8) ? `V${meter.y}H${meter.x}H300` : '';
      o += primaryPipe('wp-upper-supply', `M${ws.x} ${ws.y}V136Q350 128 342 128${wwLadung}Q300 128 300 120${verticalBridge}${meterDetour}V${y_ro + 8}Q300 ${y_ro} 292 ${y_ro}H${wst.x}${wst.y !== y_ro ? `V${wst.y}` : ''}`, CW, wpO, tO);
      const sj = HK ? model.junctions[model.connections['wp-lower-supply'].via[0]] : null;
      // The tees lie on these continuous paths; their explicit via references
      // record incidence without changing the legacy SVG paint order.
      const lowerBridge = FM && SPLIT ? 'H268A6 6 0 0 0 256' : 'H270A8 8 0 0 0 254';
      o += primaryPipe('wp-lower-supply', `M${wl.x} ${wl.y}${sj && sj.y !== wl.y ? `V${sj.y}` : ''}${lowerBridge} ${sj ? sj.y : y_ru}H${wlt.x}${wlt.y !== (sj ? sj.y : y_ru) ? `V${wlt.y}` : ''}`, CW, wpU, tU);
      if (QS) {
        const qon = wp_on || (W.quelle_pumpe ? ON(W.quelle_pumpe) : false);
        const ia = point(model.connections['source-in'].from), ib = point(model.connections['source-in'].to);
        const oa = point(model.connections['source-out'].from), ob = point(model.connections['source-out'].to);
        if (QT === 'sole') {
          const ground = model.connections['source-ground-loop'], gs = point(ground.from), ge = point(ground.to);
          const toGround = gs.x !== ib.x || gs.y !== ib.y ? `H${gs.x}V${gs.y}` : '';
          const fromGround = ge.x !== oa.x || ge.y !== oa.y ? `H${oa.x}V${oa.y}` : '';
          o += rohr(`M${ia.x} ${ia.y}V381A9 9 0 0 1 400 399V${ib.y}${ib.x !== 400 ? `H${ib.x}` : ''}${toGround}Q${gs.x} ${gs.y + 12} ${(gs.x + ge.x) / 2} ${gs.y + 12}Q${ge.x} ${ge.y + 12} ${ge.x} ${ge.y}${fromGround}V399A9 9 0 0 1 430 381V${ob.y}${ob.x !== 430 ? `H${ob.x}` : ''}`, F.quelle, qon);
        }
        else o += rohr(`M${ib.x} ${ib.y}V399A9 9 0 0 0 400 381V${ia.y}${ia.x !== 400 ? `H${ia.x}` : ''}`, F.quelle, qon) + rohr(`M${ob.x} ${ob.y}V381A9 9 0 0 1 430 399V${oa.y}${oa.x !== 430 ? `H${oa.x}` : ''}`, F.quelle, qon);
      }
    }
    // Preserve the compiler's bridge order for whole pipe groups and animation.
    if (routes) for (const id of Object.keys(primaryPipes).sort((a,b) => routes[a].paintOrder - routes[b].paintOrder)) o += primaryPipes[id];
    const TWc = c.trinkwasser;
    if (TW) {
      const domesticOffset = model.components['domestic-boundary'].origin.y - model.components['domestic-boundary'].baseOrigin.y;
      if (ZK) {
        const hot = model.connections['circulation-hot'], cold = model.connections['circulation-cold'];
        const middle = model.connections['circulation-pump-through'];
        const a = point(hot.from), pin = point(hot.to), m1 = point(middle.from), m2 = point(middle.to), pout = point(cold.from), b = point(cold.to);
        const through = pin.y !== a.y || pout.y !== a.y || pin.x <= pout.x || m1.x !== pin.x || m1.y !== pin.y || m2.x !== pout.x || m2.y !== pout.y ? `H${pin.x}V${pin.y}H${m1.x}V${m1.y}H${m2.x}V${m2.y}H${pout.x}V${pout.y}V${b.y}` : '';
        o += rohr(`M${a.x} ${a.y}${through}H${b.x}${!through && b.y !== a.y ? `V${b.y}` : ''}`, F.tw_warm, zirk_on);
      }
      const domesticPath = (a, b, edge) => {
        const points = edge.via.map((id) => model.junctions[id]);
        if (points.every((j) => j.x === a.x && j.y >= Math.min(a.y, b.y) && j.y <= Math.max(a.y, b.y))) return `M${a.x} ${a.y}V${b.y}${b.x !== a.x ? `H${b.x}` : ''}`;
        return `M${a.x} ${a.y}` + points.map((j) => `V${j.y}H${j.x}`).join('') + `V${b.y}H${b.x}`;
      };
      const coldPath = domesticPath(dc, de, model.connections['domestic-cold']), hotPath = domesticPath(dh, dw, model.connections['domestic-hot']);
      o += rohr(coldPath, F.tw_kalt) + rohr(hotPath, F.tw_warm);
      if (zapf) o += `<path d="${coldPath}${hotPath}" class="w3"/>`;
      else if (zirk_on) {
        const cj = point(model.connections['circulation-cold'].to), hj = point(model.connections['circulation-hot'].from);
        o += `<path d="M${cj.x} ${cj.y}V${de.y}${de.x !== cj.x ? `H${de.x}` : ''}M${dh.x} ${dh.y}V${hj.y}${hj.x !== dh.x ? `H${hj.x}` : ''}" class="w3"/>`;
      }
      o += TWc && TWc.zaehler ? `<g${more(TWc.zaehler)}>${zaehlerSym(model.components['domestic-meter'].origin.x + 6, model.components['domestic-meter'].origin.y + 6)}</g>` : `<path d="M${tk - 4}${-23 + domesticOffset}l4 4 4-4" class="wa"/>`;
      o += `<path d="M${tw - 4}${-19 + domesticOffset}l4-4 4 4" class="wa"/>`;
      if (ZK) {
        const b = model.components['circulation-pump'], px = b.origin.x + 10, py = b.origin.y + 10;
        o += `<g data-act="zirk" class="wx"><title>${L.zirkTitle}</title><circle cx="${px}" cy="${py}" r="14" fill="transparent"/>${pumpe(px, py, 'l', zirk_on)}</g>`;
        o += `<text x="${px}" y="${py - 14}" font-size="7" class="wc ws" font-weight="600">${L.zirk}</text>`;
      }
      o += `<text x="${tk - 8}" y="${-14 + domesticOffset}" font-size="7.5" class="we" font-weight="600" fill="${F.tw_kalt}">${esc(c.text_tw_kalt ?? L.kalt)}</text><text x="${tw + 8}" y="${-14 + domesticOffset}" font-size="7.5" font-weight="600" fill="${F.tw_warm}">${esc(c.text_tw_warm ?? L.warm)}</text>`;
      if (TT && FMx && (FMx.temp || FMx.durchfluss))
        o += `<text x="${tw + 8}" y="${-3 + domesticOffset}" font-size="8" class="wt"${more(FMx.temp || FMx.durchfluss)} fill="${zapf ? F.aktiv : '#9aa0a6'}">${[FMx.temp ? fmt(S(FMx.temp)) : '', FMx.durchfluss ? r1(NUM(FMx.durchfluss)) + ' l/min' : ''].filter(Boolean).join(' · ')}</text>`;
      if (TWc) {
        const z1 = [TWc.temp ? fmt(S(TWc.temp)) : '', TWc.zaehler ? `${r1(NUM(TWc.zaehler))} ${U(TWc.zaehler, 'm³')}` : ''].filter(Boolean).join(' · ');
        if (z1) o += `<text x="${tk - 8}" y="${-3 + domesticOffset}" font-size="8" class="we wv wx" data-more="${esc(TWc.temp || TWc.zaehler)}">${esc(z1)}</text>`;
        if (TWc.enthaertung) {
          const ev = S(TWc.enthaertung);
          o += `<text x="${tk - 8}" y="${8 + domesticOffset}" font-size="8" class="we ws wx" data-more="${esc(TWc.enthaertung)}">${L.enth} ${isNum(ev) ? r1(Number(ev)) + ' ' + esc(U(TWc.enthaertung, '%')) : ON(TWc.enthaertung) ? L.an : L.aus}</text>`;
        }
      }
    }
    if (K) {
      const returnFirst = model.connections[K.pumpe ? 'additional-return-tank' : 'additional-return'];
      const returnLast = model.connections[K.pumpe ? 'additional-return-device' : 'additional-return'];
      const supply = model.connections['additional-supply'];
      const a = point(returnFirst.from), d = point(returnLast.to), e = point(supply.from), b = point(supply.to);
      const middle = K.pumpe ? model.connections['additional-pump-through'] : null;
      const pin = K.pumpe ? point(returnFirst.to) : null, m1 = middle ? point(middle.from) : null, m2 = middle ? point(middle.to) : null, pout = K.pumpe ? point(returnLast.from) : null;
      const through = pin && (pin.y !== a.y || pout.y !== a.y || pin.x <= pout.x || m1.x !== pin.x || m1.y !== pin.y || m2.x !== pout.x || m2.y !== pout.y) ? `H${pin.x}V${pin.y}H${m1.x}V${m1.y}H${m2.x}V${m2.y}H${pout.x}V${pout.y}V${d.y}` : '';
      const meter = supply.via.length ? model.junctions[supply.via[0]] : null;
      const detour = meter && (meter.y !== e.y || meter.x < Math.min(e.x, b.x) || meter.x > Math.max(e.x, b.x)) ? `H${meter.x}V${meter.y}` : '';
      o += rohr(`M${a.x} ${a.y}${through}H${d.x}${!through && d.y !== a.y ? `V${d.y}` : ''}`, F.kalt, k_pumpe) + rohr(`M${e.x} ${e.y}${detour}H${b.x}${(detour ? meter.y : e.y) !== b.y ? `V${b.y}` : ''}`, F.warm, k_pumpe);
    }
    if (SO) {
      const supply = model.connections['solar-supply'], a = point(supply.to), cs = point(supply.from);
      const first = model.connections[SO.pumpe ? 'solar-return-tank' : 'solar-return'];
      const last = model.connections[SO.pumpe ? 'solar-return-collector' : 'solar-return'];
      const b = point(first.from), cr = point(last.to);
      o += rohr(`M${cs.x} ${cs.y}V387Q${cs.x} 395 ${cs.x + 8} 395H${a.x - 8}Q${a.x} 395 ${a.x} 387V${a.y}`, F.warm, so_on);
      const middle = SO.pumpe ? model.connections['solar-pump-through'] : null;
      const pin = SO.pumpe ? point(first.to) : null, m1 = middle ? point(middle.from) : null, m2 = middle ? point(middle.to) : null, pout = SO.pumpe ? point(last.from) : null;
      const through = pin && (pin.x !== cr.x || pout.x !== cr.x || pin.y <= pout.y || m1.x !== pin.x || m1.y !== pin.y || m2.x !== pout.x || m2.y !== pout.y) ? `V${pin.y}H${pin.x}V${m1.y}H${m1.x}V${m2.y}H${m2.x}V${pout.y}H${pout.x}H${cr.x}` : '';
      o += rohr(`M${b.x} ${b.y}V397Q${b.x} 405 ${b.x - 8} 405H${cr.x + 8}Q${cr.x} 405 ${cr.x} 397${through}V${cr.y}`, F.kalt, so_on);
    }

    /* ---------- Heizkreisverteiler ---------- */
    const y_vv = HK ? point(model.connections['manifold-supply'].from).y : 420 + dyw, y_rv = HK ? point(model.connections['manifold-return'].from).y : 448 + dyw;
    const y_hm = 482 + dyw, y_he = 548 + dyw;
    if (HK) {
      if (WP && akt.length && !wp_on) {
        const supply = model.connections['wp-lower-supply'], ret = model.connections['wp-lower-return'];
        const a = point(supply.to), b = point(ret.from), sj = model.junctions[supply.via[0]], rj = model.junctions[ret.via[0]];
        o += `<path d="M${a.x} ${a.y}H254A8 8 0 0 1 270 ${sj.y}H${sj.x}M${rj.x} ${rj.y}H${b.x}${b.y !== rj.y ? `V${b.y}` : ''}" class="w3" style="${td}"/>`;
      }
      const hs = model.connections['hk-supply'], hr = model.connections['hk-return'];
      const source = point(hs.from), sink = point(hs.to);
      const back = point(hr.from), backEnd = point(hr.to);
      const tf = 1 / Math.max(hk_fl, 0.04), fl1 = hk_fl > 0.04;
      const jmp = (x) => (FM ? `399A9 9 0 0 0 ${x} 381` : '381');
      const rl1 = W8 ? `M${back.x} ${back.y}H320Q312 462 312 454V${jmp(312)}` : `M${back.x} ${back.y}V${jmp(312)}`;
      o += rohr(WP ? `${rl1}V368Q312 360 304 360H${backEnd.x + 8}Q${backEnd.x} 360 ${backEnd.x} ${backEnd.y + 12}V${backEnd.y}` : `${rl1}V${y_bu + 8}Q312 ${y_bu} 304 ${y_bu}H${backEnd.x}${backEnd.y !== y_bu ? `V${backEnd.y}` : ''}`, CK, fl1, tf);
      o += rohr((WP ? `M${source.x} ${source.y}V${y_m - 9}A9 9 0 0 0 295 ${y_m + 9}V351A9 9 0 0 0 295 369`
        : `M${source.x} ${source.y}H287Q295 ${y_ru} 295 ${y_ru + 8}V${y_bu - 9}A9 9 0 0 0 295 ${y_bu + 9}`) +
        `V${FM ? '381A9 9 0 0 0 295 399' : '399'}` + (W8 ? `V402Q295 410 303 410H304A8 8 0 0 1 320 410H${sink.x}${sink.y !== 410 ? `V${sink.y}` : ''}` : `V${sink.y}${sink.x !== 295 ? `H${sink.x}` : ''}`), CW, fl1, tf);
      if (W8) {
        const ss = model.connections['separator-supply'], sr = model.connections['separator-return'];
        const a = point(ss.from), b = point(ss.to), d = point(sr.from), e = point(sr.to);
        o += rohr(`M${a.x} ${a.y}H348Q356 410 356 418V${b.y}${b.x !== 356 ? `H${b.x}` : ''}`, CW, fl1, tf);
        o += rohr(`M${d.x} ${d.y}V470Q372 462 364 462A8 8 0 0 0 348 462H${e.x}${e.y !== 462 ? `V${e.y}` : ''}`, CK, fl1, tf);
      }
      for (const [i, x] of hks.entries()) {
        const edge = model.connections[`heating-return-${i}`], a = point(edge.from), b = point(edge.to);
        const rx = a.x;
        if (x.MIX) {
          const j = model.junctions[edge.via[0]], bypassEdge = model.connections[`heating-bypass-${i}`];
          const bypassStart = point(bypassEdge.from), bypass = point(bypassEdge.to);
          o += rohr(`M${rx} ${a.y}V${j.y}${j.x !== rx ? `H${j.x}` : ''}`, CK, x.on);
          o += rohr(`M${j.x} ${j.y}V${b.y}${b.x !== j.x ? `H${b.x}` : ''}`, CK, x.on && x.a > 0.04, 1 / Math.max(x.a, 0.04));
          o += rohr(`M${bypassStart.x} ${bypassStart.y}H${bypass.x}${bypass.y !== bypassStart.y ? `V${bypass.y}` : ''}`, CK, x.on && x.a < 0.96, 1 / Math.max(1 - x.a, 0.04));
        } else o += rohr(`M${rx} ${a.y}V${b.y}${b.x !== rx ? `H${b.x}` : ''}`, CK, x.on);
      }
      const railAnimation = (from, to, edge, y) => {
        const nodes = [point(edge.from), ...edge.via.map((id) => model.junctions[id]), point(edge.to)];
        const vertices = [nodes[0]];
        for (const node of nodes.slice(1)) {
          const previous = vertices[vertices.length - 1];
          if (previous.x !== node.x) vertices.push({ x: node.x, y: previous.y });
          if (vertices[vertices.length - 1].y !== node.y) vertices.push(node);
        }
        const index = (p) => vertices.findIndex((v) => v.x === p.x && v.y === p.y);
        const first = index(from), last = index(to);
        if (first < 0 || last < 0) return `M${from.x} ${from.y}H${to.x}${to.y !== from.y ? `V${to.y}` : ''}`;
        const section = first <= last ? vertices.slice(first, last + 1) : vertices.slice(last, first + 1).reverse();
        if (section.every((v) => v.y === y)) return `M${from.x} ${from.y}H${to.x}`;
        return `M${from.x} ${from.y}` + section.slice(1).map((v, i) => v.x === section[i].x ? `V${v.y}` : `H${v.x}`).join('');
      };
      o += verteiler(model.connections['manifold-return'], CK);
      if (akt.length) {
        const i = akt[aktReturn.indexOf(Math.min(...aktReturn))], from = model.junctions[`manifold-return-${i}`], to = model.junctions['manifold-primary-return'];
        o += `<path d="${railAnimation(from, to, model.connections['manifold-return'], y_rv)}" class="w3" style="${td}"/>`;
      }
      for (const [i, x] of hks.entries()) {
        const edge = model.connections[`heating-supply-${i}`], a = point(edge.from);
        const b = point(!x.MIX && x.pumpe ? model.connections[`heating-pump-out-${i}`].to : edge.to);
        const sx = a.x, jump = `M${sx} ${a.y}V${y_rv - 11}A11 11 0 0 1 ${sx} ${y_rv + 11}`;
        const throughPump = (start, target, inlet) => {
          if (!x.pumpe) return `V${target.y}${target.x !== start.x ? `H${target.x}` : ''}`;
          const outlet = point(model.connections[`heating-pump-out-${i}`].from), pump = model.components[`heating-pump-${i}`];
          const middle = model.connections[`heating-pump-through-${i}`], m1 = point(middle.from), m2 = point(middle.to);
          const standard = inlet.x === start.x && outlet.x === start.x && inlet.y === pump.baseOrigin.y && outlet.y === pump.baseOrigin.y + 20 && m1.x === inlet.x && m1.y === inlet.y && m2.x === outlet.x && m2.y === outlet.y;
          return standard ? `V${target.y}${target.x !== start.x ? `H${target.x}` : ''}` : `V${inlet.y}H${inlet.x}V${m1.y}H${m1.x}V${m2.y}H${m2.x}V${outlet.y}H${outlet.x}V${target.y}${target.x !== outlet.x ? `H${target.x}` : ''}`;
        };
        if (x.MIX) {
          const mixed = model.connections[`heating-mixed-${i}`], d = point(mixed.from), e = point(x.pumpe ? model.connections[`heating-pump-out-${i}`].to : mixed.to);
          o += rohr(`${jump}V${b.y}${b.x !== sx ? `H${b.x}` : ''}`, CW, x.on && x.a > 0.04, 1 / Math.max(x.a, 0.04));
          o += rohr(`M${d.x} ${d.y}${throughPump(d, e, point(mixed.to))}`, x.c, x.on);
        } else o += rohr(`${jump}${throughPump(a, b, point(edge.to))}`, CW, x.on);
      }
      o += verteiler(model.connections['manifold-supply'], CW);
      if (akt.length) {
        const i = akt[aktSupply.indexOf(Math.min(...aktSupply))], from = model.junctions['manifold-primary-supply'], to = model.junctions[`manifold-supply-${i}`];
        o += `<path d="${railAnimation(from, to, model.connections['manifold-supply'], y_vv)}" class="w3" style="${td}"/>`;
      }
      o += `<text x="${bx1 - 8}" y="${y_vv + 3}" font-size="7.5" class="we ws" font-weight="600">VL</text><text x="${bx1 - 8}" y="${y_rv + 3}" font-size="7.5" class="we ws" font-weight="600">RL</text>`;
      if (W8) {
        const WX = c.weiche;
        const b = model.components.separator, { x, y } = b.origin, { width, height } = b.bounds;
        o += `<g${more(WX.temp)}><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="url(#wwW8)" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/>`;
        o += openComponent('separator');
        o += `<rect x="326" y="406" width="4" height="60" rx="2" fill="#fff" opacity=".25"/>`;
        if (WX.temp) o += `<text x="332" y="436" font-size="7.5" class="wc wt wo" fill="#fff" transform="rotate(-90 332 436)">${fmt(S(WX.temp))}</text>`;
        o += closeComponent('separator');
        o += '</g>';
      }
      for (const [i, x] of hks.entries()) {
        const branch = model.components[`heating-circuit-${i}`], drawX = branch.baseOrigin.x + 22, sx = drawX - 16;
        if (x.MIX) {
          const m = model.components[`heating-mixer-${i}`], j = model.junctions[`heating-return-tee-${i}`];
          o += mischer(m.origin.x + 34, m.origin.y + 14, CW, isNum(x.m) ? x.a : null) + tee(j.x, j.y);
          if (isNum(x.m)) o += openComponent(`heating-mixer-${i}`) + `<text x="${sx - 26}" y="${y_hm + 19}" font-size="7.5" class="wc wt wx" data-more="${esc(x.mischer)}" style="fill:${x.c}"><title>${L.mischerTitle(esc(x.m))}</title>${Math.round(x.a * 100)}%</text>` + closeComponent(`heating-mixer-${i}`);
        }
        if (x.pumpe) {
          const b = model.components[`heating-pump-${i}`];
          o += `<g${more(x.pumpe)}>${pumpe(b.origin.x + 10, b.origin.y + 10, 'd', x.on)}</g>`;
        }
        o += openComponent(`heating-circuit-${i}`);
        o += `<path d="M${sx - 4} ${y_he - 9}l4 4 4-4M${drawX + 12} ${y_he - 5}l4-4 4 4" class="wa"/>`;
        o += `<text x="${drawX}" y="${y_he + 16}" font-size="10" class="wc wt${x.on ? '' : ' wv'}"${x.on ? ` fill="${F.aktiv}"` : ''}>${esc(x.name)}</text>`;
        let y = y_he + 28;
        for (const z of x.zeilen) { o += `<text x="${drawX}" y="${y}" font-size="8.5" class="wc ws wx" data-more="${esc(z.e)}">${esc(z.t)}</text>`; y += 12; }
        const hc = x.on ? x.c : '#8a9099';
        if (x.typ === 'fussboden' || x.typ === 'fussbodenheizung' || x.typ === 'floor')
          o += `<path d="M${drawX - 22} ${y}h40a3 3 0 0 1 0 6h-40a3 3 0 0 0 0 6h40a3 3 0 0 1 0 6h-40" fill="none" stroke="${hc}" stroke-width="2" stroke-linecap="round"/>`;
        else if (x.typ === 'heizkoerper' || x.typ === 'radiator')
          o += `<rect x="${drawX - 20}" y="${y - 2}" width="40" height="20" rx="3" fill="#2b2f35" stroke="${hc}" stroke-width="1.5"/>` +
            [0, 1, 2, 3, 4].map((k) => `<path d="M${drawX - 14 + k * 7} ${y + 2}v12" stroke="${hc}" stroke-width="2" stroke-linecap="round"/>`).join('');
        o += closeComponent(`heating-circuit-${i}`);
      }
    }

    /* Umschaltventil WP + T-Stücke */
    if (WP) {
      const v = model.components.valve, vx = v.origin.x + 34, vy = v.origin.y + v.bounds.height / 2;
      o += W.ventil ? `<g${more(W.ventil)}>${mischer(vx, vy, CK, vb, CW, CK)}</g>` : mischer(vx, vy, CK);
    }
    if (HK && WP) {
      const a = model.junctions[model.connections['wp-lower-supply'].via[0]], b = model.junctions[model.connections['wp-lower-return'].via[0]];
      o += tee(a.x, a.y) + tee(b.x, b.y);
    }
    if (TW && ZK) {
      const a = point(model.connections['circulation-cold'].to), b = point(model.connections['circulation-hot'].from);
      o += tee(a.x, a.y) + tee(b.x, b.y);
    }

    /* Wärmemengenzähler */
    if (WP && W.wmz) {
      const meterLabelY = FM && SPLIT ? Math.min(103, point(model.connections['fm-return'].to).y - 15) : 103;
      o += openComponent('wp-meter') + `<g${more(W.wmz)}>${zaehlerSym(300, 100)}<text x="292" y="${meterLabelY}" font-size="8" class="we wt wv">${r1(NUM(W.wmz))} ${esc(U(W.wmz, 'kWh'))}</text></g>` + closeComponent('wp-meter');
    }
    if (K && K.wmz) o += openComponent('additional-meter') + `<g${more(K.wmz)}>${zaehlerSym(-30, y_ru)}<text x="-30" y="${y_ru - 11}" font-size="8" class="wc wt wv">${r1(NUM(K.wmz))} ${esc(U(K.wmz, 'kWh'))}</text></g>` + closeComponent('additional-meter');

    /* Legende */
    if (fl.length) {
      const lx = FM || WP ? 405 : 280, ly = FM || WP ? 122 : 30;
      o += `<text x="${lx}" y="${ly}" font-size="8" class="wc ws" font-weight="600" letter-spacing=".8">${L.speicher}</text><rect x="${lx - 19}" y="${ly + 6}" width="38" height="5" rx="2.5" fill="url(#wwLegend)"/><text x="${lx - 23}" y="${ly + 11}" font-size="8" class="we ws">${c.t_min}°</text><text x="${lx + 23}" y="${ly + 11}" font-size="8" class="ws">${c.t_max}°</text>`;
    }

    /* ---------- Solar ---------- */
    if (SO) {
      o += openComponent('solar-collector');
      o += `<g${more(SO.kollektor || SO.leistung || SO.pumpe)}>`;
      o += `<path d="M${x0} 36L${x0 + 14} -22H${x0 + 70}L${x0 + 56} 36Z" fill="url(#wwSol)" stroke="#9aa0a6" stroke-width="1.2" stroke-linejoin="round"/>`;
      o += [1, 2, 3].map((k) => `<path d="M${x0 + k * 14} 36L${x0 + 14 + k * 14} -22" stroke="#9aa0a6" stroke-opacity=".6" stroke-width=".8"/>`).join('');
      o += `<path d="M${x0 + 7} 7H${x0 + 63}" stroke="#9aa0a6" stroke-opacity=".6" stroke-width=".8"/>`;
      const sc = so_on ? '#ffd23f' : '#6b7280';
      o += `<circle cx="${x0 + 80}" cy="-16" r="5" fill="${sc}"${so_on ? ' class="wb" style="animation-duration:3s"' : ''}/>` +
        [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M${x0 + 80} -24v-3" stroke="${sc}" stroke-width="1.5" stroke-linecap="round" transform="rotate(${a} ${x0 + 80} -16)"/>`).join('');
      if (SO.kollektor) o += `<text x="${x0 + 30}" y="54" font-size="11" class="wc wt${so_on ? '' : ' wv'}"${so_on ? ` fill="${F.solar}"` : ''}>${fmt(S(SO.kollektor))}</text>`;
      o += `<text x="${x0 + 30}" y="${SO.kollektor ? 66 : 54}" font-size="7.5" class="wc ws" font-weight="600" letter-spacing="1">${esc(String(SO.name || L.solar).toUpperCase())}</text></g>`;
      o += closeComponent('solar-collector');
      if (SO.pumpe) {
        const b = model.components['solar-pump'];
        o += `<g${more(SO.pumpe)}>${pumpe(b.origin.x + 10, b.origin.y + 10, 'u', so_on)}</g>`;
      }
      o += openComponent('solar-collector');
      if (SO.leistung) o += `<text x="${x0 + 30}" y="250" font-size="8.5" class="wc wt wx${so_on ? '' : ' ws'}" data-more="${esc(SO.leistung)}"${so_on ? ` fill="${F.solar}"` : ''}>${watt(NUM(SO.leistung))}</text>`;
      if (SO.wmz) o += `<text x="${x0 + 30}" y="264" font-size="8" class="wc ws wx" data-more="${esc(SO.wmz)}">${r1(NUM(SO.wmz))} ${esc(U(SO.wmz, 'kWh'))}</text>`;
      o += closeComponent('solar-collector');
    }

    /* ---------- Zusatzwärme ---------- */
    if (K) {
      const txt = kHell ? '#1f2329' : '#fff';
      if (kTyp !== 'fernwaerme') o += openComponent('additional-heat') + `<rect x="-114" y="-30" width="18" height="180" fill="url(#wwFlue)"/><rect x="-118" y="2" width="26" height="8" rx="2" fill="#2b2f35"/><rect x="-117" y="128" width="24" height="5" rx="1.5" fill="#2b2f35"/>` + closeComponent('additional-heat');
      else {
        const a = point(model.connections['district-supply'].from), b = point(model.connections['district-supply'].to);
        const d = point(model.connections['district-return'].from), e = point(model.connections['district-return'].to);
        o += rohr(`M${a.x} ${a.y}V${b.y}${b.x !== a.x ? `H${b.x}` : ''}`, F.warm, k_feuer) + rohr(`M${d.x} ${d.y}V${e.y}${e.x !== d.x ? `H${e.x}` : ''}`, F.kalt, k_feuer) + `<text x="-105" y="-18" font-size="7.5" class="wc ws" font-weight="600">${esc(L.typ.fernwaerme.toUpperCase())}</text>`;
      }
      if (K.abgas && kTyp !== 'fernwaerme') o += openComponent('additional-heat') + `<text x="-90" y="60" font-size="8" class="wv wx" data-more="${esc(K.abgas)}">${L.abgas} ${fmt(S(K.abgas))}</text>` + closeComponent('additional-heat');
      o += `<rect x="-146" y="362" width="12" height="22" rx="2" fill="#3a3f46"/><rect x="-76" y="362" width="12" height="22" rx="2" fill="#3a3f46"/>`;
      o += openComponent('additional-heat');
      o += `<rect x="-150" y="150" width="90" height="214" rx="10" fill="url(#wwSteel)" filter="url(#wwShadow)"/><rect x="-150" y="150" width="90" height="214" rx="10" fill="url(#wwBox)"/>`;
      o += `<rect x="-154" y="146" width="98" height="10" rx="3" fill="#2b2f35" stroke="#555b63" stroke-width=".8"/><text x="-142" y="170" font-size="8" class="wt" letter-spacing="1.5" fill="${txt}" opacity=".85">${esc(String(kName).toUpperCase())}</text>`;
      if (K.temp) {
        o += `<g${more(K.temp)}><rect x="-142" y="176" width="74" height="28" rx="5" fill="#0f1114" fill-opacity=".9" stroke="#fff" stroke-opacity=".08"/>`;
        o += `<text x="${K.trend ? -112 : -105}" y="195" font-size="14" class="wc wt" fill="${k_warm || k_feuer ? F.aktiv : '#e0e3e7'}">${fmt(t_k)}</text>`;
        if (K.trend) o += `<text x="-80" y="195" font-size="13" class="wc wt" fill="${k_tr === 'up' ? F.warm : k_tr === 'down' ? F.kalt : '#8a9099'}">${k_tr === 'up' ? '↑' : k_tr === 'down' ? '↓' : '→'}</text>`;
        o += '</g>';
      }
      o += `<rect x="-142" y="212" width="74" height="88" rx="${kHell ? 30 : 6}" fill="#15171b" stroke="#555b63" stroke-width="1.2"/>`;
      o += `<g clip-path="url(#wwWin)"><rect x="-136" y="218" width="62" height="76" fill="#0c0d0f"/>`;
      if (kFeuerTyp) {
        if (k_feuer) {
          const fc = kTyp === 'gas' ? ['#1f6fff', '#5fa0ff', '#cfe3ff'] : ['#ff5a1f', '#ffa21c', '#ffe27a'];
          const sk = kTyp === 'gas' || kTyp === 'oel' ? 0.7 : 1;
          o += `<rect x="-136" y="218" width="62" height="76" fill="url(#wwFire)" class="wb" style="animation-duration:1.7s"/>`;
          for (const [fx, w, hh, d] of [[-118, 9, 32, 0.9], [-105, 12, 50, 1.1], [-92, 9, 38, 0.8]])
            o += `<g transform="translate(${fx} 284)"><g class="wl" style="animation-duration:${d}s" opacity=".95"><path d="${flamme(w, r1(hh * sk))}" fill="${fc[0]}"/><path d="${flamme(r1(w * 0.65), r1(hh * 0.7 * sk))}" fill="${fc[1]}"/><path d="${flamme(r1(w * 0.35), r1(hh * 0.42 * sk))}" fill="${fc[2]}"/></g></g>`;
        }
        if (k_warm && ['kamin', 'holzvergaser', 'pellet'].includes(kTyp))
          o += `<ellipse cx="-105" cy="287" rx="30" ry="9" fill="url(#wwGlut)" class="wb" style="animation-duration:${k_feuer ? '1.2s' : '3s'}"/>`;
        if (kTyp === 'kamin' || kTyp === 'holzvergaser') {
          const ls = k_warm ? '#ff7a1f' : '#2a1a10';
          o += `<rect x="-128" y="280" width="46" height="9" rx="4.5" fill="#4a2e1c" stroke="${ls}" transform="rotate(6 -105 284)"/><rect x="-126" y="279" width="44" height="9" rx="4.5" fill="#5b3a24" stroke="${ls}" transform="rotate(-7 -105 284)"/>`;
        } else if (kTyp === 'pellet') {
          o += Array.from({ length: 14 }, (_, k) => `<rect x="${-126 + (k % 7) * 6}" y="${282 + Math.floor(k / 7) * 4}" width="5" height="3" rx="1.5" fill="${k_warm ? '#c46a2a' : '#6b4a2b'}"/>`).join('');
        } else o += `<rect x="-122" y="286" width="34" height="5" rx="2" fill="#3a3f46"/>`;
      } else if (kTyp === 'fernwaerme') {
        for (let k = 0; k < 7; k++) o += `<path d="M-128 ${230 + k * 9}h46" stroke="${k % 2 ? F.kalt : F.warm}" stroke-width="4" stroke-linecap="round" opacity="${k_feuer ? 1 : 0.35}"/>`;
      } else {
        const gc = k_feuer ? F.aktiv : '#6b7280';
        o += `<g${k_feuer ? ' class="wg"' : ''}><circle cx="-105" cy="252" r="16" fill="none" stroke="${gc}" stroke-width="5" stroke-dasharray="5 4"/><circle cx="-105" cy="252" r="9" fill="${gc}"/></g>`;
        o += `<path d="M-100 272l-9 12h7l-4 10 10-13h-7z" fill="${k_feuer ? '#ffd23f' : '#6b7280'}"/>`;
      }
      o += `<path d="M-136 292H-74" stroke="#2b2f35" stroke-width="3"/><path d="M-132 222H-118L-134 262Z" fill="#fff" opacity=".06"/></g>`;
      o += `<rect x="-142" y="308" width="74" height="20" rx="3" fill="#2b2f35" stroke="#555b63"/>`;
      const lade = K.zuluft ? `${L.luft} ${isNum(S(K.zuluft)) ? Math.round(Number(S(K.zuluft))) + ' %' : S(K.zuluft)}`
        : kTyp === 'bhkw' && K.leistung_el ? `${watt(NUM(K.leistung_el))} el` : K.leistung ? watt(NUM(K.leistung)) : '';
      o += lade ? `<text x="-105" y="321" font-size="8" class="wc wt wx" data-more="${esc(K.zuluft || K.leistung_el || K.leistung)}" fill="#cfd4da">${esc(lade)}</text>` : `<path d="M-118 318H-92" stroke="#15171b" stroke-width="3" stroke-linecap="round"/>`;
      if (K.temp || K.brenner || K.pumpe) {
        const st = kTyp === 'kamin' ? (k_feuer ? L.brennt : k_glut ? L.glut : L.aus)
          : kFeuerTyp ? (k_feuer ? L.brennerAn : k_glut ? L.warmK : L.aus)
          : k_feuer ? (kTyp === 'bhkw' ? L.laeuft : L.aktiv) : L.aus;
        o += `<text x="-105" y="349" font-size="9" class="wc" font-weight="600" fill="${k_feuer ? (kHell ? '#c2410c' : F.aktiv) : k_glut ? '#ff8c2a' : kHell ? '#4b5058' : '#9aa0a6'}">${st}</text>`;
      }
      o += closeComponent('additional-heat');
      o += portStub(model.connections['additional-supply'].from) + portStub(c.kamin.pumpe ? model.connections['additional-return-device'].to : model.connections['additional-return'].to);
      if (K.pumpe) { const b = model.components['additional-pump']; o += `<g${more(K.pumpe)}>${pumpe(b.origin.x + 10, b.origin.y + 10, 'l', k_pumpe)}</g>`; }
      if (K.modus) {
        o += openComponent('additional-heat');
        o += `<g data-act="modus" class="wx"><title>${L.modusTitle}</title><rect x="-52" y="${y_bu + 12}" width="56" height="19" fill="transparent"/>`;
        o += `<rect x="-48" y="${y_bu + 15}" width="48" height="13" rx="6.5" fill="${k_mod[1]}" fill-opacity=".18" stroke="${k_mod[1]}"/>`;
        o += `<text x="-27" y="${y_bu + 24.5}" font-size="7.5" class="wc wt" letter-spacing=".6" fill="${k_mod[1]}">${esc(k_mod[0])}</text>`;
        o += `<path d="M-9 ${y_bu + 19.5}l3 2-3 2" fill="none" stroke="${k_mod[1]}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
        o += closeComponent('additional-heat');
      }
    }

    /* ---------- Speicher ---------- */
    o += openComponent('tank-feet') + `<rect x="93" y="362" width="11" height="22" rx="2" fill="#3a3f46"/><rect x="170" y="362" width="11" height="22" rx="2" fill="#3a3f46"/>` + closeComponent('tank-feet');
    const cap = (component) => {
      const { x, y: a } = component.origin, { width, height } = component.bounds, b = a + height;
      const gradient = component.origin.y === component.baseOrigin.y ? 'wwTemp' : `wwTemp-${component.id}`;
      return `<rect x="${x}" y="${a}" width="${width}" height="${b - a}" rx="65" ry="22" fill="url(#${gradient})" filter="url(#wwShadow)"/><rect x="${x}" y="${a}" width="${width}" height="${b - a}" rx="65" ry="22" fill="url(#wwCyl)"/>` +
      `<rect x="${x + 14}" y="${a + 30}" width="7" height="${b - a - 60}" rx="3.5" fill="#fff" opacity=".14"/><path d="M${x} ${a + 26}Q${x + 65} ${a + 46} ${x + 130} ${a + 26}" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.2"/><path d="M${x} ${b - 26}Q${x + 65} ${b - 6} ${x + 130} ${b - 26}" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1.2"/>` +
      `<rect x="${x}" y="${a}" width="${width}" height="${b - a}" rx="65" ry="22" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.5"/>`;
    };
    const etikett = (y, t) => `<text x="137" y="${y}" font-size="8.5" class="wc wt wo" letter-spacing="1" fill="#fff" opacity=".8">${esc(t)}</text>`;
    const liter = (v) => (v !== null && v !== undefined && v !== '' ? `${v} l` : '');
    if (SPLIT) {
      const a = model.components[tankId], b = model.components[bufferId];
      o += cap(a) + cap(b);
      o += openComponent(tankId) + etikett(38, [L.ww, liter(c.volumen_ww)].filter(Boolean).join(' · ')) + closeComponent(tankId);
      o += openComponent(bufferId) + etikett(338, [L.puffer, liter(c.volumen)].filter(Boolean).join(' · ')) + closeComponent(bufferId);
    } else {
      const a = model.components[tankId];
      o += cap(a);
      if (liter(c.volumen)) o += openComponent(tankId) + etikett(338, liter(c.volumen)) + closeComponent(tankId);
    }
    if (TYP === 'kombi') {
      o += openComponent('domestic-inner');
      const ib = y_t - 14, inner = model.components['domestic-inner'], edge = model.connections['domestic-exchanger'];
      const aa = point(edge.from), bb = point(edge.to), dx = inner.origin.x - inner.baseOrigin.x, dy = inner.origin.y - inner.baseOrigin.y;
      const ax = aa.x - dx, ay = aa.y - dy, bx = bb.x - dx, by = bb.y - dy;
      o += `<rect x="102" y="30" width="70" height="${ib - 30}" rx="35" ry="14" fill="${col(fl.length ? fl[0].wert : 'x')}" fill-opacity=".9" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>`;
      o += `<rect x="110" y="44" width="5" height="${Math.max(0, ib - 74)}" rx="2.5" fill="#fff" opacity=".2"/>`;
      o += `<path d="M${ax} ${ay}V${ib - 10}" stroke="#cfd4da" stroke-width="2" opacity=".8"/><path d="M${bx} ${by}V34" stroke="#cfd4da" stroke-width="2" opacity=".8"/>`;
      o += `<text x="146" y="${ib - 12}" font-size="8" class="wc wt wo" fill="#fff" opacity=".85">WW</text>`;
      if (zapf || zirk_on) o += `<path d="M${ax} ${ay}V${ib - 10}" class="w3" style="stroke-width:1.4px"/>`;
      o += closeComponent('domestic-inner');
    }
    if (TYP === 'hygiene') {
      o += openComponent('domestic-inner');
      const inner = model.components['domestic-inner'], edge = model.connections['domestic-exchanger'];
      const a = point(edge.from), b = point(edge.to), dx = inner.origin.x - inner.baseOrigin.x, dy = inner.origin.y - inner.baseOrigin.y;
      let hp = `M${a.x - dx} ${a.y - dy}V352H100`;
      for (let y = 352; y > 48; y -= 24) hp += `C100 ${y - 8} 176 ${y - 4} 176 ${y - 12}C176 ${y - 20} 100 ${y - 16} 100 ${y - 24}`;
      hp += `L164 32V${b.y - dy}${b.x - dx !== 164 ? `H${b.x - dx}` : ''}`;
      o += `<path d="${hp}" fill="none" stroke="#cfd4da" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`;
      if (zapf || zirk_on) o += `<path d="${hp}" class="w3" style="stroke-width:1.4px"/>`;
      o += closeComponent('domestic-inner');
    }
    if (TT) o += portStub(`${tankId}.cold-water`) + portStub(`${tankId}.hot-water`);
    if (TG) o += openComponent(tankId) + `<rect x="73" y="${y_t - 2}" width="128" height="4" fill="url(#wwGrid)"/><path d="M73 ${y_t - 2}H201M73 ${y_t + 2}H201" stroke="#fff" stroke-opacity=".6" stroke-width=".7"/>` + closeComponent(tankId);
    if (SO) {
      o += openComponent('solar-exchanger');
      const edge = model.connections['solar-coil'], a = point(edge.from), b = point(edge.to);
      const coil = model.components['solar-exchanger'], dx = coil.origin.x - coil.baseOrigin.x, dy = coil.origin.y - coil.baseOrigin.y;
      const ax = a.x - dx, ay = a.y - dy, bx = b.x - dx, by = b.y - dy;
      const sp = `M${ax} ${ay}V348H180Q186 348 186 354Q186 360 180 360H128Q122 360 122 366V${by}${bx !== 122 ? `H${bx}` : ''}`;
      o += `<path d="${sp}" fill="none" stroke="${F.solar}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`;
      if (so_on) o += `<path d="${sp}" class="w3" style="stroke-width:1.6px"/>`;
      o += closeComponent('solar-exchanger');
      o += portStub(`${bufferId}.solar-supply`) + portStub(`${bufferId}.solar-return`);
    }
    if (FM) o += portStub(model.connections['fm-supply'].from);
    if (WP) o += portStub(model.connections['wp-upper-supply'].to) + portStub(model.connections['wp-upper-return'].from);
    if (WP || HK) o += WP ? portStub(model.connections['wp-lower-supply'].to) + portStub(model.connections['wp-lower-return'].from) : portStub(model.connections['hk-supply'].from) + portStub(model.connections['hk-return'].to);
    if (K) o += portStub(`${bufferId}.additional-supply`) + portStub(`${bufferId}.additional-return`);
    if (FM) o += portStub(model.connections['fm-return'].to);
    if (hso) o += openComponent('upper-heater') + stab(geo.heaterY, hso) + closeComponent('upper-heater');
    if (hsu) o += openComponent('lower-heater') + stab((y_ru + y_bu) / 2, hsu) + closeComponent('lower-heater');
    o += fl.map((f) => { const id = `sensor-${f.index}`; return openComponent(id) + pille(f) + closeComponent(id); }).join('');

    /* Legionellenschutz */
    const LG = c.legionellen;
    if (LG) {
      const lAkt = LG.aktiv ? ON(LG.aktiv) : false;
      let t = '', lc = '#8a9099';
      if (lAkt) { t = L.legLaeuft; lc = F.aktiv; }
      else if (LG.letzte) {
        const s = S(LG.letzte);
        const tage = isNum(s) ? Number(s) : Number.isFinite(Date.parse(s)) ? Math.floor((Date.now() - Date.parse(s)) / 86400000) : null;
        if (tage !== null) {
          t = tage <= 0 ? L.legHeute : L.legVor(Math.round(tage));
          lc = tage <= LG.tage ? F.led : F.warm;
        }
      }
      const bx = TT ? 226 : 80;
      if (t) o += openComponent(tankId) + `<g data-more="${esc(LG.letzte || LG.aktiv)}" class="wx${lAkt ? ' wb' : ''}"><rect x="${bx}" y="-26" width="120" height="16" rx="8" fill="${lc}" fill-opacity=".16" stroke="${lc}"/><text x="${bx + 60}" y="-15" font-size="8" class="wc wt" fill="${lc}">${t}</text></g>` + closeComponent(tankId);
    }

    /* ---------- Frischwassermodul ---------- */
    if (FM) {
      const b = model.components.fm, { x, y } = b.origin, { width, height } = b.bounds;
      o += `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="url(#wwRed)" filter="url(#wwShadow)"/><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="url(#wwBox)"/>`;
      o += portStub(model.connections['fm-supply'].to) + portStub(model.connections['fm-return'].from) + portStub('fm.cold-water') + portStub('fm.hot-water');
      o += openComponent('fm');
      o += `<text x="352" y="32" font-size="8" class="wt" letter-spacing="2" fill="#fff" opacity=".85">${esc(c.hersteller)}</text><text x="352" y="92" font-size="22" font-weight="800" fill="#fff">${esc(c.name_fm)}</text>`;
      if (FMx && (FMx.temp || FMx.durchfluss)) {
        o += `<g${more(FMx.temp || FMx.durchfluss)}><rect x="392" y="62" width="52" height="34" rx="5" fill="#0f1114" fill-opacity=".85" stroke="#fff" stroke-opacity=".08"/>`;
        if (FMx.temp) o += `<text x="418" y="${FMx.durchfluss ? 77 : 84}" font-size="11" class="wc wt" fill="${zapf ? F.aktiv : '#e0e3e7'}">${fmTempText}</text>`;
        if (FMx.durchfluss) o += `<text x="418" y="${FMx.temp ? 90 : 84}" font-size="8.5" class="wc" fill="${zapf ? F.aktiv : '#9aa0a6'}">${fmFlowText}</text>`;
        o += '</g>';
        o += `<path d="M430 22C426 29 424 32 424 35A6 6 0 0 0 436 35C436 32 434 29 430 22Z" fill="#fff" opacity=".85"/>`;
      } else o += `<path d="M430 30C424 40 421 45 421 49A9 9 0 0 0 439 49C439 45 436 40 430 30Z" fill="#fff" opacity=".85"/>`;
      o += closeComponent('fm');
    }

    /* ---------- Wärmequelle Sole / Wasser ---------- */
    if (QS) {
      o += openComponent('heat-source');
      o += `<rect x="382" y="404" width="100" height="156" rx="4" fill="#6b4f3a" fill-opacity=".35"/><path d="M382 404H482" stroke="#4cb050" stroke-width="3"/>`;
      if (QT === 'wasser') {
        o += `<rect x="382" y="478" width="100" height="82" rx="4" fill="#3d8bff" fill-opacity=".25"/><path d="M382 478q6-4 12 0t12 0 12 0 12 0 12 0 12 0 12 0 12 0 4 0" fill="none" stroke="#3d8bff" stroke-opacity=".7" stroke-width="1.2"/>`;
        o += `<rect x="391" y="408" width="18" height="140" rx="3" fill="none" stroke="#9aa0a6" stroke-opacity=".7"/><rect x="421" y="408" width="18" height="140" rx="3" fill="none" stroke="#9aa0a6" stroke-opacity=".7"/>`;
      }
      o += closeComponent('heat-source');
      o += portStub(model.connections['source-in'].from) + portStub(model.connections['source-out'].to);
      o += openComponent('heat-source');
      if (W.quelle_ein) o += `<text x="444" y="426" font-size="8.5" class="wt wv wx" data-more="${esc(W.quelle_ein)}">↑ ${fmt(S(W.quelle_ein))}</text>`;
      if (W.quelle_aus) o += `<text x="444" y="440" font-size="8.5" class="wt wv wx" data-more="${esc(W.quelle_aus)}">↓ ${fmt(S(W.quelle_aus))}</text>`;
      o += closeComponent('heat-source');
    }

    /* ---------- Wärmepumpe ---------- */
    if (WP) {
      const b = model.components.wp, { x, y } = b.origin, { width, height } = b.bounds;
      o += `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="url(#wwRed)" filter="url(#wwShadow)"/><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="url(#wwBox)"/>`;
      o += portStub(model.connections['wp-upper-supply'].from) + portStub(model.connections['wp-lower-supply'].from) + portStub(model.connections['wp-valve-return'].to);
      o += openComponent('wp');
      o += `<text x="342" y="168" font-size="9" class="wt" letter-spacing="2" fill="#fff" opacity=".9">${esc(c.hersteller)}</text>`;
      if (W.cop) o += `<text x="438" y="168" font-size="9" class="we wt wx" data-more="${esc(W.cop)}" fill="#fff">${wpCopText}</text>`;
      o += `<circle cx="390" cy="226" r="42" fill="#15171b" stroke="#0c0d0f" stroke-width="3"/><circle cx="390" cy="226" r="36" fill="#1d2025"/>`;
      const fan = wp_abtau ? F.kalt : wp_on ? (kuehl ? F.kalt : F.aktiv) : '#6b7280';
      const dreht = wp_on || wp_abtau;
      if (QT === 'luft') {
        o += `<g fill="${fan}"${dreht ? ' class="wr"' : ''}${wp_abtau ? ' style="animation-duration:4s"' : ''}>` +
          [0, 72, 144, 216, 288].map((a) => `<path d="M390 226Q405 213 397 192Q383 203 390 226Z" transform="rotate(${a} 390 226)"/>`).join('') + '</g>';
        o += `<circle cx="390" cy="226" r="14" fill="none" stroke="#fff" stroke-opacity=".07"/><circle cx="390" cy="226" r="25" fill="none" stroke="#fff" stroke-opacity=".07"/>`;
      } else {
        o += `<g${dreht ? ' class="wr" style="animation-duration:3s"' : ''}><path d="M390 222a4 4 0 1 1-4 4a9 9 0 1 0 9-9a15 15 0 1 1-15 15a22 22 0 1 0 22-22" fill="none" stroke="${fan}" stroke-width="3.5" stroke-linecap="round"/></g>`;
      }
      o += `<circle cx="390" cy="226" r="7" fill="#2b2f35" stroke="#555b63" stroke-width="1.5"/>`;
      const st = wpStatus;
      o += `<g${more(W.leistung || W.betrieb || W.waerme)}><rect x="342" y="282" width="96" height="46" rx="8" fill="#0f1114" fill-opacity=".85" stroke="#fff" stroke-opacity=".08"/>`;
      if (W.leistung) o += `<text x="390" y="305" font-size="17" class="wc wt" fill="${wp_on ? (kuehl ? F.kalt : F.aktiv) : '#e0e3e7'}">${wpPowerText}</text>`;
      o += `<text x="390" y="${W.leistung ? 320 : 309}" font-size="${W.leistung ? 8.5 : 10}" class="wc" fill="${st[1]}">${esc(st[0])}</text></g>`;
      const vr = wpTemperatures;
      if (vr) o += `<text x="390" y="341" font-size="8.5" class="wc wx" data-more="${esc(W.vorlauf || W.ruecklauf)}" fill="#fff" opacity=".9">${vr}</text>`;
      o += `<text x="342" y="364" font-size="20" font-weight="800" fill="#fff">${esc(c.name_wp)}</text>`;
      if (W.sg_ready) o += `<text x="424" y="356" font-size="8" class="we wt wx" data-more="${esc(W.sg_ready)}" fill="#fff" opacity=".85">SG ${esc(S(W.sg_ready))}</text>`;
      o += `<circle cx="434" cy="353" r="5" fill="${wp_sperre ? F.warm : wp_on ? F.led : '#4b5058'}" stroke="#fff" stroke-opacity=".35"${wp_on ? ' class="wb"' : ''}/>`;
      if (QT === 'luft' && (W.quelle_ein || W.quelle_aus))
        o += `<text x="390" y="382" font-size="8" class="wc wv wx" data-more="${esc(W.quelle_ein || W.quelle_aus)}">${L.luft} ${[W.quelle_ein ? fmt(S(W.quelle_ein)) : '', W.quelle_aus ? fmt(S(W.quelle_aus)) : ''].filter(Boolean).join(' → ')}</text>`;
      o += closeComponent('wp');
    }
    o += '</svg>';

    /* ---------- Tagesenergie ---------- */
    if (c.energie.length) {
      const pal = [F.aktiv, F.warm, F.kalt, F.solar, F.led, '#a855f7'];
      const vals = c.energie.map((e) => NUM(e.entity));
      const max = Math.max(...vals, 0.001);
      o += '<div class="en">' + c.energie.map((e, i) =>
        `<div class="er" data-more="${esc(e.entity)}"><ha-icon icon="${esc(e.icon || 'mdi:lightning-bolt')}" style="--mdc-icon-size:16px"></ha-icon><span>${esc(e.name || e.entity)}</span>` +
        `<div class="b"><i style="width:${r1((vals[i] / max) * 100)}%;background:${e.farbe || pal[i % pal.length]}"></i></div><span class="v">${r1(vals[i])} ${esc(U(e.entity, 'kWh'))}</span></div>`).join('') + '</div>';
    }
    return o;
  }
}

/* ======================================================================== */
/* Grafischer Editor / Visual editor                                        */
/* ======================================================================== */
const LBL = {
  de: {
    titel: 'Titel', hersteller: 'Hersteller-Schriftzug', name_wp: 'Name WP', name_fm: 'Name FM', sprache: 'Sprache',
    t_min: 'Farbskala min (°C)', t_max: 'Farbskala max (°C)', hs_stufen: 'Heizstab-Stufen', aussen: 'Außentemperatur', pv: 'PV-Leistung',
    zirkulationspumpe: 'Zirkulationspumpe', speicher: 'Speicher', typ: 'Typ', volumen: 'Volumen (l)', volumen_ww: 'Volumen Warmwasser (l)',
    trennung: 'Trennung / Boilerhöhe (%)', wp: 'Wärmepumpe', leistung: 'Leistung', schwelle: 'Schwelle (W)', betrieb: 'Betrieb',
    vorlauf: 'Vorlauf', ruecklauf: 'Rücklauf', waerme: 'Wärmeleistung', cop: 'COP', sperre: 'EVU-Sperre', abtauen: 'Abtauen',
    kuehlen: 'Kühlbetrieb', sg_ready: 'SG-Ready', ventil: 'Umschaltventil', quelle_ein: 'Quelle ein', quelle_aus: 'Quelle aus',
    quelle_pumpe: 'Quellenpumpe', wmz: 'Wärmemengenzähler (kWh)', heizstab_oben: 'Heizstab oben', heizstab_unten: 'Heizstab unten',
    name: 'Name', stufe: 'Stufe', temp: 'Temperatur', kamin: 'Zusatzwärme', pumpe: 'Pumpe', modus: 'Pumpenmodus (input_select)',
    brenner: 'Brenner / Betrieb', warm: 'Glut ab (°C)', feuer: 'Feuer ab (°C)', trend: 'Trend', abgas: 'Abgastemperatur',
    zuluft: 'Zuluftklappe', leistung_el: 'Elektrische Leistung', solar: 'Solarthermie', kollektor: 'Kollektortemperatur',
    fm: 'Frischwassermodul', anzeigen: 'Anzeigen (auch ohne Sensoren)', durchfluss: 'Durchfluss (l/min)', weiche: 'Hydraulische Weiche',
    trinkwasser: 'Trinkwasser', zaehler: 'Wasserzähler', enthaertung: 'Enthärtung', legionellen: 'Legionellenschutz',
    letzte: 'Letzte Aufheizung', aktiv: 'Läuft gerade', tage: 'Warnung nach Tagen', fuehler: 'Speicherfühler', entity: 'Entität',
    hoehe: 'Höhe (%)', heizkreise: 'Heizkreise', mischer: 'Mischer (-100…100)', vorlauf_soll: 'Vorlauf Soll', raum: 'Raumtemperatur',
    energie: 'Tagesenergie', icon: 'Symbol', farbe: 'Farbe', add: 'Hinzufügen', remove: 'Entfernen',
  },
  en: {
    titel: 'Title', hersteller: 'Manufacturer label', name_wp: 'Heat pump name', name_fm: 'FWM name', sprache: 'Language',
    t_min: 'Colour scale min (°C)', t_max: 'Colour scale max (°C)', hs_stufen: 'Heater steps', aussen: 'Outdoor temperature', pv: 'PV power',
    zirkulationspumpe: 'Circulation pump', speicher: 'Storage tank', typ: 'Type', volumen: 'Volume (l)', volumen_ww: 'Hot water volume (l)',
    trennung: 'Separation / boiler height (%)', wp: 'Heat pump', leistung: 'Power', schwelle: 'Threshold (W)', betrieb: 'Running',
    vorlauf: 'Flow', ruecklauf: 'Return', waerme: 'Heat output', cop: 'COP', sperre: 'Grid lock', abtauen: 'Defrost',
    kuehlen: 'Cooling', sg_ready: 'SG Ready', ventil: 'Diverter valve', quelle_ein: 'Source in', quelle_aus: 'Source out',
    quelle_pumpe: 'Source pump', wmz: 'Heat meter (kWh)', heizstab_oben: 'Heater top', heizstab_unten: 'Heater bottom',
    name: 'Name', stufe: 'Step', temp: 'Temperature', kamin: 'Additional heat source', pumpe: 'Pump', modus: 'Pump mode (input_select)',
    brenner: 'Burner / running', warm: 'Embers from (°C)', feuer: 'Fire from (°C)', trend: 'Trend', abgas: 'Flue gas temperature',
    zuluft: 'Air damper', leistung_el: 'Electrical power', solar: 'Solar thermal', kollektor: 'Collector temperature',
    fm: 'Fresh water module', anzeigen: 'Show (even without sensors)', durchfluss: 'Flow rate (l/min)', weiche: 'Hydraulic separator',
    trinkwasser: 'Drinking water', zaehler: 'Water meter', enthaertung: 'Softener', legionellen: 'Legionella protection',
    letzte: 'Last heat-up', aktiv: 'Running now', tage: 'Warn after days', fuehler: 'Tank sensors', entity: 'Entity',
    hoehe: 'Height (%)', heizkreise: 'Heating circuits', mischer: 'Mixer (-100…100)', vorlauf_soll: 'Flow target', raum: 'Room temperature',
    energie: 'Daily energy', icon: 'Icon', farbe: 'Colour', add: 'Add', remove: 'Remove',
  },
};
const OPT = {
  de: {
    sprache: [['auto', 'Automatisch'], ['de', 'Deutsch'], ['en', 'English']],
    speicher: [['trennblech', 'Trennblech (2 Kammern)'], ['schicht', 'Schichtspeicher'], ['kombi', 'Kombispeicher (Tank-in-Tank)'], ['hygiene', 'Hygienespeicher (Wellrohr)'], ['getrennt', 'Warmwasser + Puffer getrennt']],
    wp: [['luft', 'Luft'], ['sole', 'Sole / Erdsonde'], ['wasser', 'Wasser / Brunnen']],
    kamin: [['kamin', 'Kaminofen'], ['holzvergaser', 'Holzvergaser'], ['pellet', 'Pellets'], ['gas', 'Gas'], ['oel', 'Öl'], ['fernwaerme', 'Fernwärme'], ['bhkw', 'BHKW']],
    hk: [['', '–'], ['fussboden', 'Fußbodenheizung'], ['heizkoerper', 'Heizkörper']],
  },
  en: {
    sprache: [['auto', 'Automatic'], ['de', 'Deutsch'], ['en', 'English']],
    speicher: [['trennblech', 'Baffle plate (2 zones)'], ['schicht', 'Stratified tank'], ['kombi', 'Combi tank (tank-in-tank)'], ['hygiene', 'Hygienic tank (coil)'], ['getrennt', 'Separate hot water + buffer']],
    wp: [['luft', 'Air'], ['sole', 'Brine / ground probe'], ['wasser', 'Water / well']],
    kamin: [['kamin', 'Stove'], ['holzvergaser', 'Wood boiler'], ['pellet', 'Pellets'], ['gas', 'Gas'], ['oel', 'Oil'], ['fernwaerme', 'District heating'], ['bhkw', 'CHP']],
    hk: [['', '–'], ['fussboden', 'Floor heating'], ['heizkoerper', 'Radiators']],
  },
};
const sel = {
  ent: { entity: {} }, txt: { text: {} }, bool: { boolean: {} }, icon: { icon: {} },
  num: (min, max) => ({ number: { min, max, mode: 'box' } }),
  opt: (list) => ({ select: { mode: 'dropdown', options: list.map(([value, label]) => ({ value, label })) } }),
};
const F_ = (name, selector) => ({ name, selector });
const E_ = (...names) => names.map((n) => F_(n, sel.ent));
const leer = (v) => v === '' || v === null || v === undefined || v === false || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
const aufraeumen = (o) => {
  if (Array.isArray(o)) return o.map(aufraeumen);
  if (o && typeof o === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(o)) { const x = aufraeumen(v); if (!leer(x)) r[k] = x; }
    return r;
  }
  return o;
};

class WarmwasserSchemaCardEditor extends HTMLElement {
  setConfig(config) {
    const c = { ...config };
    if (Array.isArray(c.fuehler)) c.fuehler = c.fuehler.map((f) => (Array.isArray(f) ? aufraeumen({ name: f[0], entity: f[1], hoehe: f[2] }) : { ...f }));
    if (c.weiche === true) c.weiche = { anzeigen: true };
    if (c.fm === true) c.fm = { anzeigen: true };
    if (!c.wp && c.wp_leistung) { c.wp = aufraeumen({ leistung: c.wp_leistung, schwelle: c.wp_schwelle }); delete c.wp_leistung; delete c.wp_schwelle; }
    if (!c.kamin && c.zusatzwaerme) { c.kamin = c.zusatzwaerme; delete c.zusatzwaerme; }
    if (c.trennung !== undefined && !(c.speicher && c.speicher.trennung !== undefined)) {
      c.speicher = { ...(c.speicher || {}), ...(c.trennung === false ? { typ: 'schicht' } : { trennung: c.trennung }) };
      delete c.trennung;
    }
    const struktur = ['fuehler', 'heizkreise', 'energie'].map((k) => (Array.isArray(c[k]) ? c[k].length : 0)).join(',');
    this._config = c;
    if (this._forms && struktur === this._struktur) this._sync();
    else { this._struktur = struktur; this._build(); }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._forms) this._forms.forEach((f) => { f.hass = hass; });
    if (first && this._config) this._build();
  }

  _L() { return LBL[sprache(this._config, this._hass)]; }
  _O() { return OPT[sprache(this._config, this._hass)]; }

  _mainSchema() {
    const L = this._L(), O = this._O();
    return [
      { type: 'grid', name: '', schema: [F_('titel', sel.txt), F_('hersteller', sel.txt), F_('name_wp', sel.txt), F_('name_fm', sel.txt), F_('sprache', sel.opt(O.sprache)), F_('hs_stufen', sel.num(1, 12)), F_('t_min', sel.num(0, 90)), F_('t_max', sel.num(0, 95))] },
      ...E_('aussen', 'pv', 'zirkulationspumpe'),
      { type: 'expandable', name: 'speicher', title: L.speicher, icon: 'mdi:water-boiler', schema: [F_('typ', sel.opt(O.speicher)), { type: 'grid', name: '', schema: [F_('volumen', sel.num(0, 100000)), F_('volumen_ww', sel.num(0, 100000)), F_('trennung', sel.num(35, 70))] }] },
      { type: 'expandable', name: 'wp', title: L.wp, icon: 'mdi:heat-pump', schema: [F_('typ', sel.opt(O.wp)), ...E_('leistung'), F_('schwelle', sel.num(0, 10000)), ...E_('betrieb', 'vorlauf', 'ruecklauf', 'waerme', 'wmz', 'cop', 'ventil', 'kuehlen', 'sperre', 'abtauen', 'sg_ready', 'quelle_ein', 'quelle_aus', 'quelle_pumpe')] },
      { type: 'expandable', name: 'heizstab_oben', title: L.heizstab_oben, icon: 'mdi:heating-coil', schema: [F_('name', sel.txt), ...E_('stufe', 'leistung', 'temp')] },
      { type: 'expandable', name: 'heizstab_unten', title: L.heizstab_unten, icon: 'mdi:heating-coil', schema: [F_('name', sel.txt), ...E_('stufe', 'leistung', 'temp')] },
      { type: 'expandable', name: 'kamin', title: L.kamin, icon: 'mdi:fireplace', schema: [F_('typ', sel.opt(O.kamin)), F_('name', sel.txt), ...E_('temp', 'trend', 'pumpe', 'modus', 'brenner', 'leistung', 'leistung_el', 'wmz', 'abgas', 'zuluft'), { type: 'grid', name: '', schema: [F_('warm', sel.num(0, 100)), F_('feuer', sel.num(0, 100))] }] },
      { type: 'expandable', name: 'solar', title: L.solar, icon: 'mdi:solar-panel', schema: [F_('name', sel.txt), ...E_('kollektor', 'pumpe', 'leistung', 'wmz')] },
      { type: 'expandable', name: 'fm', title: L.fm, icon: 'mdi:water-pump', schema: [F_('anzeigen', sel.bool), ...E_('temp', 'durchfluss', 'pumpe')] },
      { type: 'expandable', name: 'trinkwasser', title: L.trinkwasser, icon: 'mdi:water', schema: E_('temp', 'zaehler', 'enthaertung') },
      { type: 'expandable', name: 'weiche', title: L.weiche, icon: 'mdi:pipe', schema: [F_('anzeigen', sel.bool), ...E_('temp')] },
      { type: 'expandable', name: 'legionellen', title: L.legionellen, icon: 'mdi:bacteria-outline', schema: [...E_('letzte', 'aktiv'), F_('tage', sel.num(1, 60))] },
    ];
  }

  _listen() {
    const O = this._O();
    return [
      { key: 'fuehler', icon: 'mdi:thermometer', schema: [{ type: 'grid', name: '', schema: [F_('name', sel.txt), F_('hoehe', sel.num(0, 100))] }, F_('entity', sel.ent)] },
      { key: 'heizkreise', icon: 'mdi:radiator', schema: [{ type: 'grid', name: '', schema: [F_('name', sel.txt), F_('typ', sel.opt(O.hk))] }, ...E_('pumpe', 'mischer', 'vorlauf', 'vorlauf_soll', 'raum', 'wmz')] },
      { key: 'energie', icon: 'mdi:lightning-bolt', schema: [{ type: 'grid', name: '', schema: [F_('name', sel.txt), F_('icon', sel.icon)] }, F_('entity', sel.ent), F_('farbe', sel.txt)] },
    ];
  }

  _form(schema, getData, onChange) {
    const f = document.createElement('ha-form');
    f.hass = this._hass;
    f.schema = schema;
    f.data = getData();
    f._getData = getData;
    f.computeLabel = (s) => this._L()[s.name] || s.name;
    f.addEventListener('value-changed', (ev) => { ev.stopPropagation(); onChange(ev.detail.value); });
    this._forms.push(f);
    return f;
  }

  _sync() { this._forms.forEach((f) => { f.data = f._getData(); }); }

  _fire() {
    const cfg = aufraeumen({ ...this._config });
    if (cfg.weiche && cfg.weiche.anzeigen && Object.keys(cfg.weiche).length === 1) cfg.weiche = true;
    if (cfg.fm && cfg.fm.anzeigen && Object.keys(cfg.fm).length === 1) cfg.fm = true;
    for (const k of ['fuehler', 'heizkreise', 'energie']) if (Array.isArray(this._config[k])) cfg[k] = this._config[k].map((x) => aufraeumen(x));
    cfg.type = this._config.type || 'custom:warmwasser-schema-card';
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: cfg }, bubbles: true, composed: true }));
  }

  _setList(key, arr) {
    this._config = { ...this._config, [key]: arr };
    this._struktur = ['fuehler', 'heizkreise', 'energie'].map((k) => (Array.isArray(this._config[k]) ? this._config[k].length : 0)).join(',');
  }

  _build() {
    if (!this._config) return;
    const L = this._L();
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const root = this.shadowRoot;
    root.innerHTML = `<style>
      .sec{margin-top:18px}.kopf{display:flex;align-items:center;gap:8px;font-weight:500;margin-bottom:6px;color:var(--primary-text-color)}
      .item{border:1px solid var(--divider-color,#ddd);border-radius:10px;padding:8px 10px 4px;margin-bottom:8px}
      .row{display:flex;justify-content:flex-end}
      button{font:inherit;cursor:pointer;border:1px solid var(--divider-color,#ccc);background:var(--card-background-color,#fff);color:var(--primary-text-color);border-radius:8px;padding:6px 12px}
      button.rm{border:none;background:none;color:var(--error-color,#db4437);padding:2px 6px}
      button.add{color:var(--primary-color)}
    </style><div id="w"></div>`;
    const w = root.getElementById('w');
    this._forms = [];
    w.appendChild(this._form(this._mainSchema(), () => this._config, (v) => { this._config = { ...this._config, ...v }; this._fire(); }));
    for (const li of this._listen()) {
      const sec = document.createElement('div');
      sec.className = 'sec';
      sec.innerHTML = `<div class="kopf"><ha-icon icon="${li.icon}"></ha-icon>${L[li.key]}</div>`;
      const arr = Array.isArray(this._config[li.key]) ? this._config[li.key] : [];
      arr.forEach((_, i) => {
        const box = document.createElement('div');
        box.className = 'item';
        box.appendChild(this._form(li.schema, () => (this._config[li.key] || [])[i] || {}, (v) => {
          const n = [...(this._config[li.key] || [])]; n[i] = v; this._config = { ...this._config, [li.key]: n }; this._fire();
        }));
        const row = document.createElement('div');
        row.className = 'row';
        const rm = document.createElement('button');
        rm.className = 'rm'; rm.textContent = L.remove;
        rm.addEventListener('click', () => {
          const n = [...(this._config[li.key] || [])]; n.splice(i, 1); this._setList(li.key, n); this._build(); this._fire();
        });
        row.appendChild(rm); box.appendChild(row); sec.appendChild(box);
      });
      const add = document.createElement('button');
      add.className = 'add'; add.textContent = '+ ' + L.add;
      add.addEventListener('click', () => {
        this._setList(li.key, [...(this._config[li.key] || []), { name: '' }]); this._build(); this._fire();
      });
      sec.appendChild(add);
      w.appendChild(sec);
    }
  }
}

if (!customElements.get('warmwasser-schema-card')) customElements.define('warmwasser-schema-card', WarmwasserSchemaCard);
if (!customElements.get('warmwasser-schema-card-editor')) customElements.define('warmwasser-schema-card-editor', WarmwasserSchemaCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((x) => x.type === 'warmwasser-schema-card'))
  window.customCards.push({
    type: 'warmwasser-schema-card',
    name: 'Warmwasser Schema Card',
    description: 'Animated hydraulic diagram: tank, heat pump, fresh water module, solar, additional heat source, heating circuits',
    preview: true,
  });
console.info(`%c WARMWASSER-SCHEMA-CARD %c ${VERSION} `, 'background:#ff4b3e;color:#fff;font-weight:700', 'background:#333;color:#fff');
