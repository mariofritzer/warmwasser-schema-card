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

const VERSION = '3.0.0';

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
      return { name: f.name, entity: f.entity, wert: S(f.entity), y: 40 + (310 * clamp(pos, 0, 100)) / 100 };
    }).sort((a, b) => a.y - b.y);
    const TYP = c.typ, TG = TYP === 'trennblech', SPLIT = TYP === 'getrennt', TT = TYP === 'kombi' || TYP === 'hygiene';
    const y_t = 40 + (310 * clamp(c.trennung, 35, 70)) / 100, gap = SPLIT ? 32 : 18;
    const y_ro = 70, y_bo = y_t - gap, y_ru = y_t + gap, y_bu = 340, y_m = (y_ru + 338) / 2;
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
    const TW = FM || TT, tk = FM ? 362 : 110, tw = FM ? 428 : 164, tyb = FM ? 12 : 18, tm = (tk + tw) / 2;
    const zirk_on = ZK && ON(c.zirkulationspumpe);
    const zapf = FMx && FMx.durchfluss ? NUM(FMx.durchfluss) > 0.1 : false;
    const fm_on = FMx && FMx.pumpe ? ON(FMx.pumpe) : zapf || zirk_on;

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
    const hkPos = HK_X.slice(0, c.heizkreise.length).sort((a, b) => a - b);
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
    const akt = hks.filter((x) => x.on && x.a > 0.04).map((x) => x.x);
    const td = `animation-duration:${r2(1 / Math.max(hk_fl, 0.04))}s`;
    const hkExtra = HK ? Math.max(0, ...hks.map((x) => x.zeilen.length * 12 + (x.typ ? 26 : 0))) : 0;
    const bx1 = HK ? Math.min(...hks.map((x) => x.x)) - 40 : 130;

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
    const verteiler = (x1, x2, y, cl) =>
      `<path d="M${x1} ${y}H${x2}" stroke="#000" stroke-opacity=".35" stroke-width="18"/><path d="M${x1} ${y}H${x2}" stroke="${cl}" stroke-width="14"/>` +
      `<path d="M${x1} ${y - 3}H${x2}" stroke="#fff" stroke-opacity=".25" stroke-width="3"/>` +
      `<rect x="${x1 - 5}" y="${y - 10}" width="5" height="20" rx="1.5" class="wk"/><rect x="${x2}" y="${y - 10}" width="5" height="20" rx="1.5" class="wk"/>`;
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
    const minX = Math.min(0, K ? -160 : 0, SO ? x0 - 10 : 0, HK ? bx1 - 30 : 0);
    let unten = HK ? 574 + dyw + hkExtra : SO ? 412 : 400;
    if (QS) unten = Math.max(unten, 566);
    o += `<svg viewBox="${minX} -30 ${486 - minX} ${unten + 30}"><defs>`;
    o += `<linearGradient id="wwTemp" gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="0" y2="374"><stop offset="0" stop-color="${col(stops[0].wert)}"/>` +
      stops.map((st) => `<stop offset="${Math.round(((st.y - 14) / 360) * 1000) / 1000}" stop-color="${col(st.wert)}"/>`).join('') +
      `<stop offset="1" stop-color="${col(stops[stops.length - 1].wert)}"/></linearGradient>`;
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
    if (FM) {
      o += rohr('M206 46H336', F.warm, fm_on);
      o += rohr('M452 90H458Q466 90 466 98V382Q466 390 458 390H145Q137 390 137 382V376', F.kalt, fm_on);
    }
    if (WP) {
      o += rohr(`M206 ${y_bo}H252Q262 ${y_bo} 262 ${y_bo + 10}V${y_m - 14}`, CK, wpO, tO);
      o += rohr(`M206 ${y_bu}H252Q262 ${y_bu} 262 ${y_bu - 10}V${y_m + 14}`, CK, wpU, tU);
      o += rohr(`M277 ${y_m}H326`, CK, wp_on);
      o += rohr(`M350 146V136Q350 128 342 128H308Q300 128 300 120V${y_ro + 8}Q300 ${y_ro} 292 ${y_ro}H206`, CW, wpO, tO);
      o += rohr(`M326 ${y_ru}H270A8 8 0 0 0 254 ${y_ru}H206`, CW, wpU, tU);
      if (QS) {
        const qon = wp_on || (W.quelle_pumpe ? ON(W.quelle_pumpe) : false);
        if (QT === 'sole') o += rohr('M400 372V381A9 9 0 0 1 400 399V540Q400 552 415 552Q430 552 430 540V399A9 9 0 0 1 430 381V372', F.quelle, qon);
        else o += rohr('M400 535V399A9 9 0 0 0 400 381V372', F.quelle, qon) + rohr('M430 372V381A9 9 0 0 1 430 399V535', F.quelle, qon);
      }
    }
    const TWc = c.trinkwasser;
    if (TW) {
      if (ZK) o += rohr(`M${tw} -6H${tk}`, F.tw_warm, zirk_on);
      o += rohr(`M${tk} -26V${tyb}`, F.tw_kalt) + rohr(`M${tw} ${tyb}V-26`, F.tw_warm);
      if (zapf) o += `<path d="M${tk} -26V${tyb}M${tw} ${tyb}V-26" class="w3"/>`;
      else if (zirk_on) o += `<path d="M${tk} -6V${tyb}M${tw} ${tyb}V-6" class="w3"/>`;
      o += TWc && TWc.zaehler ? `<g${more(TWc.zaehler)}>${zaehlerSym(tk, -18)}</g>` : `<path d="M${tk - 4}-23l4 4 4-4" class="wa"/>`;
      o += `<path d="M${tw - 4}-19l4-4 4 4" class="wa"/>`;
      if (ZK) {
        o += `<g data-act="zirk" class="wx"><title>${L.zirkTitle}</title><circle cx="${tm}" cy="-6" r="14" fill="transparent"/>${pumpe(tm, -6, 'l', zirk_on)}</g>`;
        o += `<text x="${tm}" y="-20" font-size="7" class="wc ws" font-weight="600">${L.zirk}</text>`;
      }
      o += `<text x="${tk - 8}" y="-14" font-size="7.5" class="we" font-weight="600" fill="${F.tw_kalt}">${esc(c.text_tw_kalt ?? L.kalt)}</text><text x="${tw + 8}" y="-14" font-size="7.5" font-weight="600" fill="${F.tw_warm}">${esc(c.text_tw_warm ?? L.warm)}</text>`;
      if (TT && FMx && (FMx.temp || FMx.durchfluss))
        o += `<text x="${tw + 8}" y="-3" font-size="8" class="wt"${more(FMx.temp || FMx.durchfluss)} fill="${zapf ? F.aktiv : '#9aa0a6'}">${[FMx.temp ? fmt(S(FMx.temp)) : '', FMx.durchfluss ? r1(NUM(FMx.durchfluss)) + ' l/min' : ''].filter(Boolean).join(' · ')}</text>`;
      if (TWc) {
        const z1 = [TWc.temp ? fmt(S(TWc.temp)) : '', TWc.zaehler ? `${r1(NUM(TWc.zaehler))} ${U(TWc.zaehler, 'm³')}` : ''].filter(Boolean).join(' · ');
        if (z1) o += `<text x="${tk - 8}" y="-3" font-size="8" class="we wv wx" data-more="${esc(TWc.temp || TWc.zaehler)}">${esc(z1)}</text>`;
        if (TWc.enthaertung) {
          const ev = S(TWc.enthaertung);
          o += `<text x="${tk - 8}" y="8" font-size="8" class="we ws wx" data-more="${esc(TWc.enthaertung)}">${L.enth} ${isNum(ev) ? r1(Number(ev)) + ' ' + esc(U(TWc.enthaertung, '%')) : ON(TWc.enthaertung) ? L.an : L.aus}</text>`;
        }
      }
    }
    if (K) o += rohr(`M70 ${y_bu}H-58`, F.kalt, k_pumpe) + rohr(`M-58 ${y_ru}H70`, F.warm, k_pumpe);
    if (SO) {
      o += rohr(`M${x0 + 52} 36V387Q${x0 + 52} 395 ${x0 + 60} 395H102Q110 395 110 387V374`, F.warm, so_on);
      o += rohr(`M122 374V397Q122 405 114 405H${x0 + 16}Q${x0 + 8} 405 ${x0 + 8} 397V36`, F.kalt, so_on);
    }

    /* ---------- Heizkreisverteiler ---------- */
    const y_vv = 420 + dyw, y_rv = 448 + dyw, y_hm = 482 + dyw, y_he = 548 + dyw;
    const bxV = W8 ? 356 : 300, bxR = W8 ? 372 : 317, srcV = W8 ? 356 : 295, srcR = W8 ? 372 : 312;
    if (HK) {
      if (WP && akt.length && !wp_on) o += `<path d="M206 ${y_ru}H254A8 8 0 0 1 270 ${y_ru}H295M240 ${y_bu}H206" class="w3" style="${td}"/>`;
      const tf = 1 / Math.max(hk_fl, 0.04), fl1 = hk_fl > 0.04;
      const jmp = (x) => (FM ? `399A9 9 0 0 0 ${x} 381` : '381');
      const rl1 = W8 ? `M322 462H320Q312 462 312 454V${jmp(312)}` : `M312 ${y_rv}V${jmp(312)}`;
      o += rohr(WP ? `${rl1}V368Q312 360 304 360H248Q240 360 240 352V${y_bu}` : `${rl1}V${y_bu + 8}Q312 ${y_bu} 304 ${y_bu}H206`, CK, fl1, tf);
      o += rohr((WP ? `M295 ${y_ru}V${y_m - 9}A9 9 0 0 0 295 ${y_m + 9}V351A9 9 0 0 0 295 369`
        : `M206 ${y_ru}H287Q295 ${y_ru} 295 ${y_ru + 8}V${y_bu - 9}A9 9 0 0 0 295 ${y_bu + 9}`) +
        `V${FM ? '381A9 9 0 0 0 295 399' : '399'}` + (W8 ? 'V402Q295 410 303 410H304A8 8 0 0 1 320 410H322' : `V${y_vv}`), CW, fl1, tf);
      if (W8) {
        o += rohr(`M342 410H348Q356 410 356 418V${y_vv}`, CW, fl1, tf);
        o += rohr(`M372 ${y_rv}V470Q372 462 364 462A8 8 0 0 0 348 462H342`, CK, fl1, tf);
      }
      for (const x of hks) {
        const rx = x.x + 16;
        if (x.MIX) {
          o += rohr(`M${rx} ${y_he}V${y_hm}`, CK, x.on);
          o += rohr(`M${rx} ${y_hm}V${y_rv}`, CK, x.on && x.a > 0.04, 1 / Math.max(x.a, 0.04));
          o += rohr(`M${rx} ${y_hm}H${x.x - 1}`, CK, x.on && x.a < 0.96, 1 / Math.max(1 - x.a, 0.04));
        } else o += rohr(`M${rx} ${y_he}V${y_rv}`, CK, x.on);
      }
      o += verteiler(bx1, bxR, y_rv, CK);
      if (akt.length) o += `<path d="M${Math.min(...akt) + 16} ${y_rv}H${srcR}" class="w3" style="${td}"/>`;
      for (const x of hks) {
        const sx = x.x - 16, jump = `M${sx} ${y_vv}V${y_rv - 11}A11 11 0 0 1 ${sx} ${y_rv + 11}`;
        if (x.MIX) {
          o += rohr(`${jump}V${y_hm - 14}`, CW, x.on && x.a > 0.04, 1 / Math.max(x.a, 0.04));
          o += rohr(`M${sx} ${y_hm + 14}V${y_he}`, x.c, x.on);
        } else o += rohr(`${jump}V${y_he}`, CW, x.on);
      }
      o += verteiler(bx1, bxV, y_vv, CW);
      if (akt.length) o += `<path d="M${srcV} ${y_vv}H${Math.min(...akt) - 16}" class="w3" style="${td}"/>`;
      o += `<text x="${bx1 - 8}" y="${y_vv + 3}" font-size="7.5" class="we ws" font-weight="600">VL</text><text x="${bx1 - 8}" y="${y_rv + 3}" font-size="7.5" class="we ws" font-weight="600">RL</text>`;
      if (W8) {
        const WX = c.weiche;
        o += `<g${more(WX.temp)}><rect x="322" y="400" width="20" height="72" rx="10" fill="url(#wwW8)" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/>`;
        o += `<rect x="326" y="406" width="4" height="60" rx="2" fill="#fff" opacity=".25"/>`;
        if (WX.temp) o += `<text x="332" y="436" font-size="7.5" class="wc wt wo" fill="#fff" transform="rotate(-90 332 436)">${fmt(S(WX.temp))}</text>`;
        o += '</g>';
      }
      for (const x of hks) {
        const sx = x.x - 16;
        if (x.MIX) {
          o += mischer(sx, y_hm, CW, isNum(x.m) ? x.a : null) + tee(x.x + 16, y_hm);
          if (isNum(x.m)) o += `<text x="${sx - 26}" y="${y_hm + 19}" font-size="7.5" class="wc wt wx" data-more="${esc(x.mischer)}" style="fill:${x.c}"><title>${L.mischerTitle(esc(x.m))}</title>${Math.round(x.a * 100)}%</text>`;
        }
        if (x.pumpe) o += `<g${more(x.pumpe)}>${pumpe(sx, 514 + dyw, 'd', x.on)}</g>`;
        o += `<path d="M${sx - 4} ${y_he - 9}l4 4 4-4M${x.x + 12} ${y_he - 5}l4-4 4 4" class="wa"/>`;
        o += `<text x="${x.x}" y="${y_he + 16}" font-size="10" class="wc wt${x.on ? '' : ' wv'}"${x.on ? ` fill="${F.aktiv}"` : ''}>${esc(x.name)}</text>`;
        let y = y_he + 28;
        for (const z of x.zeilen) { o += `<text x="${x.x}" y="${y}" font-size="8.5" class="wc ws wx" data-more="${esc(z.e)}">${esc(z.t)}</text>`; y += 12; }
        const hc = x.on ? x.c : '#8a9099';
        if (x.typ === 'fussboden' || x.typ === 'fussbodenheizung' || x.typ === 'floor')
          o += `<path d="M${x.x - 22} ${y}h40a3 3 0 0 1 0 6h-40a3 3 0 0 0 0 6h40a3 3 0 0 1 0 6h-40" fill="none" stroke="${hc}" stroke-width="2" stroke-linecap="round"/>`;
        else if (x.typ === 'heizkoerper' || x.typ === 'radiator')
          o += `<rect x="${x.x - 20}" y="${y - 2}" width="40" height="20" rx="3" fill="#2b2f35" stroke="${hc}" stroke-width="1.5"/>` +
            [0, 1, 2, 3, 4].map((k) => `<path d="M${x.x - 14 + k * 7} ${y + 2}v12" stroke="${hc}" stroke-width="2" stroke-linecap="round"/>`).join('');
      }
    }

    /* Umschaltventil WP + T-Stücke */
    if (WP) o += W.ventil ? `<g${more(W.ventil)}>${mischer(262, y_m, CK, vb, CW, CK)}</g>` : mischer(262, y_m, CK);
    if (HK && WP) o += tee(295, y_ru) + tee(240, y_bu);
    if (TW && ZK) o += tee(tk, -6) + tee(tw, -6);

    /* Wärmemengenzähler */
    if (WP && W.wmz) o += `<g${more(W.wmz)}>${zaehlerSym(300, 100)}<text x="292" y="103" font-size="8" class="we wt wv">${r1(NUM(W.wmz))} ${esc(U(W.wmz, 'kWh'))}</text></g>`;
    if (K && K.wmz) o += `<g${more(K.wmz)}>${zaehlerSym(-30, y_ru)}<text x="-30" y="${y_ru - 11}" font-size="8" class="wc wt wv">${r1(NUM(K.wmz))} ${esc(U(K.wmz, 'kWh'))}</text></g>`;

    /* Legende */
    if (fl.length) {
      const lx = FM || WP ? 405 : 280, ly = FM || WP ? 122 : 30;
      o += `<text x="${lx}" y="${ly}" font-size="8" class="wc ws" font-weight="600" letter-spacing=".8">${L.speicher}</text><rect x="${lx - 19}" y="${ly + 6}" width="38" height="5" rx="2.5" fill="url(#wwLegend)"/><text x="${lx - 23}" y="${ly + 11}" font-size="8" class="we ws">${c.t_min}°</text><text x="${lx + 23}" y="${ly + 11}" font-size="8" class="ws">${c.t_max}°</text>`;
    }

    /* ---------- Solar ---------- */
    if (SO) {
      o += `<g${more(SO.kollektor || SO.leistung || SO.pumpe)}>`;
      o += `<path d="M${x0} 36L${x0 + 14} -22H${x0 + 70}L${x0 + 56} 36Z" fill="url(#wwSol)" stroke="#9aa0a6" stroke-width="1.2" stroke-linejoin="round"/>`;
      o += [1, 2, 3].map((k) => `<path d="M${x0 + k * 14} 36L${x0 + 14 + k * 14} -22" stroke="#9aa0a6" stroke-opacity=".6" stroke-width=".8"/>`).join('');
      o += `<path d="M${x0 + 7} 7H${x0 + 63}" stroke="#9aa0a6" stroke-opacity=".6" stroke-width=".8"/>`;
      const sc = so_on ? '#ffd23f' : '#6b7280';
      o += `<circle cx="${x0 + 80}" cy="-16" r="5" fill="${sc}"${so_on ? ' class="wb" style="animation-duration:3s"' : ''}/>` +
        [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M${x0 + 80} -24v-3" stroke="${sc}" stroke-width="1.5" stroke-linecap="round" transform="rotate(${a} ${x0 + 80} -16)"/>`).join('');
      if (SO.kollektor) o += `<text x="${x0 + 30}" y="54" font-size="11" class="wc wt${so_on ? '' : ' wv'}"${so_on ? ` fill="${F.solar}"` : ''}>${fmt(S(SO.kollektor))}</text>`;
      o += `<text x="${x0 + 30}" y="${SO.kollektor ? 66 : 54}" font-size="7.5" class="wc ws" font-weight="600" letter-spacing="1">${esc(String(SO.name || L.solar).toUpperCase())}</text></g>`;
      if (SO.pumpe) o += `<g${more(SO.pumpe)}>${pumpe(x0 + 8, 200, 'u', so_on)}</g>`;
      if (SO.leistung) o += `<text x="${x0 + 30}" y="250" font-size="8.5" class="wc wt wx${so_on ? '' : ' ws'}" data-more="${esc(SO.leistung)}"${so_on ? ` fill="${F.solar}"` : ''}>${watt(NUM(SO.leistung))}</text>`;
      if (SO.wmz) o += `<text x="${x0 + 30}" y="264" font-size="8" class="wc ws wx" data-more="${esc(SO.wmz)}">${r1(NUM(SO.wmz))} ${esc(U(SO.wmz, 'kWh'))}</text>`;
    }

    /* ---------- Zusatzwärme ---------- */
    if (K) {
      const txt = kHell ? '#1f2329' : '#fff';
      if (kTyp !== 'fernwaerme') o += `<rect x="-114" y="-30" width="18" height="180" fill="url(#wwFlue)"/><rect x="-118" y="2" width="26" height="8" rx="2" fill="#2b2f35"/><rect x="-117" y="128" width="24" height="5" rx="1.5" fill="#2b2f35"/>`;
      else o += rohr('M-120 -26V150', F.warm, k_feuer) + rohr('M-90 150V-26', F.kalt, k_feuer) + `<text x="-105" y="-18" font-size="7.5" class="wc ws" font-weight="600">${esc(L.typ.fernwaerme.toUpperCase())}</text>`;
      if (K.abgas && kTyp !== 'fernwaerme') o += `<text x="-90" y="60" font-size="8" class="wv wx" data-more="${esc(K.abgas)}">${L.abgas} ${fmt(S(K.abgas))}</text>`;
      o += `<rect x="-146" y="362" width="12" height="22" rx="2" fill="#3a3f46"/><rect x="-76" y="362" width="12" height="22" rx="2" fill="#3a3f46"/>`;
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
      o += stub(-64, y_ru - 6, 10, 12) + stub(-64, y_bu - 6, 10, 12);
      if (K.pumpe) o += `<g${more(K.pumpe)}>${pumpe(-24, y_bu, 'l', k_pumpe)}</g>`;
      if (K.modus) {
        o += `<g data-act="modus" class="wx"><title>${L.modusTitle}</title><rect x="-52" y="${y_bu + 12}" width="56" height="19" fill="transparent"/>`;
        o += `<rect x="-48" y="${y_bu + 15}" width="48" height="13" rx="6.5" fill="${k_mod[1]}" fill-opacity=".18" stroke="${k_mod[1]}"/>`;
        o += `<text x="-27" y="${y_bu + 24.5}" font-size="7.5" class="wc wt" letter-spacing=".6" fill="${k_mod[1]}">${esc(k_mod[0])}</text>`;
        o += `<path d="M-9 ${y_bu + 19.5}l3 2-3 2" fill="none" stroke="${k_mod[1]}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      }
    }

    /* ---------- Speicher ---------- */
    o += `<rect x="93" y="362" width="11" height="22" rx="2" fill="#3a3f46"/><rect x="170" y="362" width="11" height="22" rx="2" fill="#3a3f46"/>`;
    const cap = (a, b) =>
      `<rect x="72" y="${a}" width="130" height="${b - a}" rx="65" ry="22" fill="url(#wwTemp)" filter="url(#wwShadow)"/><rect x="72" y="${a}" width="130" height="${b - a}" rx="65" ry="22" fill="url(#wwCyl)"/>` +
      `<rect x="86" y="${a + 30}" width="7" height="${b - a - 60}" rx="3.5" fill="#fff" opacity=".14"/><path d="M72 ${a + 26}Q137 ${a + 46} 202 ${a + 26}" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.2"/><path d="M72 ${b - 26}Q137 ${b - 6} 202 ${b - 26}" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1.2"/>` +
      `<rect x="72" y="${a}" width="130" height="${b - a}" rx="65" ry="22" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.5"/>`;
    const etikett = (y, t) => `<text x="137" y="${y}" font-size="8.5" class="wc wt wo" letter-spacing="1" fill="#fff" opacity=".8">${esc(t)}</text>`;
    const liter = (v) => (v !== null && v !== undefined && v !== '' ? `${v} l` : '');
    if (SPLIT) {
      o += cap(14, y_t - 8) + cap(y_t + 8, 374);
      o += etikett(38, [L.ww, liter(c.volumen_ww)].filter(Boolean).join(' · '));
      o += etikett(338, [L.puffer, liter(c.volumen)].filter(Boolean).join(' · '));
    } else {
      o += cap(14, 374);
      if (liter(c.volumen)) o += etikett(338, liter(c.volumen));
    }
    if (TYP === 'kombi') {
      const ib = y_t - 14;
      o += `<rect x="102" y="30" width="70" height="${ib - 30}" rx="35" ry="14" fill="${col(fl.length ? fl[0].wert : 'x')}" fill-opacity=".9" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>`;
      o += `<rect x="110" y="44" width="5" height="${Math.max(0, ib - 74)}" rx="2.5" fill="#fff" opacity=".2"/>`;
      o += `<path d="M110 18V${ib - 10}" stroke="#cfd4da" stroke-width="2" opacity=".8"/><path d="M164 18V34" stroke="#cfd4da" stroke-width="2" opacity=".8"/>`;
      o += `<text x="146" y="${ib - 12}" font-size="8" class="wc wt wo" fill="#fff" opacity=".85">WW</text>`;
      if (zapf || zirk_on) o += `<path d="M110 18V${ib - 10}" class="w3" style="stroke-width:1.4px"/>`;
    }
    if (TYP === 'hygiene') {
      let hp = `M110 18V352H100`;
      for (let y = 352; y > 48; y -= 24) hp += `C100 ${y - 8} 176 ${y - 4} 176 ${y - 12}C176 ${y - 20} 100 ${y - 16} 100 ${y - 24}`;
      hp += `L164 32V18`;
      o += `<path d="${hp}" fill="none" stroke="#cfd4da" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`;
      if (zapf || zirk_on) o += `<path d="${hp}" class="w3" style="stroke-width:1.4px"/>`;
    }
    if (TT) o += stub(104, 12, 12, 8) + stub(158, 12, 12, 8);
    if (TG) o += `<rect x="73" y="${y_t - 2}" width="128" height="4" fill="url(#wwGrid)"/><path d="M73 ${y_t - 2}H201M73 ${y_t + 2}H201" stroke="#fff" stroke-opacity=".6" stroke-width=".7"/>`;
    if (SO) {
      const sp = `M110 374V348H180Q186 348 186 354Q186 360 180 360H128Q122 360 122 366V374`;
      o += `<path d="${sp}" fill="none" stroke="${F.solar}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`;
      if (so_on) o += `<path d="${sp}" class="w3" style="stroke-width:1.6px"/>`;
      o += stub(104, 368, 12, 8) + stub(116, 368, 12, 8);
    }
    for (const y of [...(FM ? [46] : []), ...(WP ? [y_ro, y_bo] : []), ...(WP || HK ? [y_ru, y_bu] : [])]) o += stub(198, y - 6, 14, 12);
    if (K) o += stub(62, y_ru - 6, 14, 12) + stub(62, y_bu - 6, 14, 12);
    if (FM) o += stub(131, 370, 12, 12);
    if (hso) o += stab((y_ro + y_bo) / 2, hso);
    if (hsu) o += stab((y_ru + y_bu) / 2, hsu);
    o += fl.map(pille).join('');

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
      if (t) o += `<g data-more="${esc(LG.letzte || LG.aktiv)}" class="wx${lAkt ? ' wb' : ''}"><rect x="${bx}" y="-26" width="120" height="16" rx="8" fill="${lc}" fill-opacity=".16" stroke="${lc}"/><text x="${bx + 60}" y="-15" font-size="8" class="wc wt" fill="${lc}">${t}</text></g>`;
    }

    /* ---------- Frischwassermodul ---------- */
    if (FM) {
      o += `<rect x="340" y="14" width="110" height="90" rx="12" fill="url(#wwRed)" filter="url(#wwShadow)"/><rect x="340" y="14" width="110" height="90" rx="12" fill="url(#wwBox)"/>`;
      o += stub(332, 40, 10, 12) + stub(448, 84, 10, 12) + stub(356, 8, 12, 10) + stub(422, 8, 12, 10);
      o += `<text x="352" y="32" font-size="8" class="wt" letter-spacing="2" fill="#fff" opacity=".85">${esc(c.hersteller)}</text><text x="352" y="92" font-size="22" font-weight="800" fill="#fff">${esc(c.name_fm)}</text>`;
      if (FMx && (FMx.temp || FMx.durchfluss)) {
        o += `<g${more(FMx.temp || FMx.durchfluss)}><rect x="392" y="62" width="52" height="34" rx="5" fill="#0f1114" fill-opacity=".85" stroke="#fff" stroke-opacity=".08"/>`;
        if (FMx.temp) o += `<text x="418" y="${FMx.durchfluss ? 77 : 84}" font-size="11" class="wc wt" fill="${zapf ? F.aktiv : '#e0e3e7'}">${fmt(S(FMx.temp))}</text>`;
        if (FMx.durchfluss) o += `<text x="418" y="${FMx.temp ? 90 : 84}" font-size="8.5" class="wc" fill="${zapf ? F.aktiv : '#9aa0a6'}">${r1(NUM(FMx.durchfluss))} l/min</text>`;
        o += '</g>';
        o += `<path d="M430 22C426 29 424 32 424 35A6 6 0 0 0 436 35C436 32 434 29 430 22Z" fill="#fff" opacity=".85"/>`;
      } else o += `<path d="M430 30C424 40 421 45 421 49A9 9 0 0 0 439 49C439 45 436 40 430 30Z" fill="#fff" opacity=".85"/>`;
    }

    /* ---------- Wärmequelle Sole / Wasser ---------- */
    if (QS) {
      o += `<rect x="382" y="404" width="100" height="156" rx="4" fill="#6b4f3a" fill-opacity=".35"/><path d="M382 404H482" stroke="#4cb050" stroke-width="3"/>`;
      if (QT === 'wasser') {
        o += `<rect x="382" y="478" width="100" height="82" rx="4" fill="#3d8bff" fill-opacity=".25"/><path d="M382 478q6-4 12 0t12 0 12 0 12 0 12 0 12 0 12 0 12 0 4 0" fill="none" stroke="#3d8bff" stroke-opacity=".7" stroke-width="1.2"/>`;
        o += `<rect x="391" y="408" width="18" height="140" rx="3" fill="none" stroke="#9aa0a6" stroke-opacity=".7"/><rect x="421" y="408" width="18" height="140" rx="3" fill="none" stroke="#9aa0a6" stroke-opacity=".7"/>`;
      }
      o += stub(394, 368, 12, 8) + stub(424, 368, 12, 8);
      if (W.quelle_ein) o += `<text x="444" y="426" font-size="8.5" class="wt wv wx" data-more="${esc(W.quelle_ein)}">↑ ${fmt(S(W.quelle_ein))}</text>`;
      if (W.quelle_aus) o += `<text x="444" y="440" font-size="8.5" class="wt wv wx" data-more="${esc(W.quelle_aus)}">↓ ${fmt(S(W.quelle_aus))}</text>`;
    }

    /* ---------- Wärmepumpe ---------- */
    if (WP) {
      o += `<rect x="330" y="150" width="120" height="222" rx="14" fill="url(#wwRed)" filter="url(#wwShadow)"/><rect x="330" y="150" width="120" height="222" rx="14" fill="url(#wwBox)"/>`;
      o += stub(344, 142, 12, 10) + stub(322, y_ru - 6, 10, 12) + stub(322, y_m - 6, 10, 12);
      o += `<text x="342" y="168" font-size="9" class="wt" letter-spacing="2" fill="#fff" opacity=".9">${esc(c.hersteller)}</text>`;
      if (W.cop) o += `<text x="438" y="168" font-size="9" class="we wt wx" data-more="${esc(W.cop)}" fill="#fff">COP ${isNum(S(W.cop)) ? Number(S(W.cop)).toFixed(1) : '–'}</text>`;
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
      const st = wp_sperre ? [L.sperre, F.warm] : wp_abtau ? [L.abtauen, F.kalt] : kuehl && wp_on ? [L.kuehlen, F.kalt]
        : wp_on ? [W.waerme ? L.waerme + ' ' + watt(NUM(W.waerme)) : c.text_wp_an ?? L.wpAn, '#9aa0a6'] : [c.text_wp_aus ?? L.wpAus, '#9aa0a6'];
      o += `<g${more(W.leistung || W.betrieb || W.waerme)}><rect x="342" y="282" width="96" height="46" rx="8" fill="#0f1114" fill-opacity=".85" stroke="#fff" stroke-opacity=".08"/>`;
      if (W.leistung) o += `<text x="390" y="305" font-size="17" class="wc wt" fill="${wp_on ? (kuehl ? F.kalt : F.aktiv) : '#e0e3e7'}">${watt(wp)}</text>`;
      o += `<text x="390" y="${W.leistung ? 320 : 309}" font-size="${W.leistung ? 8.5 : 10}" class="wc" fill="${st[1]}">${esc(st[0])}</text></g>`;
      const vr = [W.vorlauf ? 'VL ' + fmt(S(W.vorlauf)) : '', W.ruecklauf ? 'RL ' + fmt(S(W.ruecklauf)) : ''].filter(Boolean).join(' · ');
      if (vr) o += `<text x="390" y="341" font-size="8.5" class="wc wx" data-more="${esc(W.vorlauf || W.ruecklauf)}" fill="#fff" opacity=".9">${vr}</text>`;
      o += `<text x="342" y="364" font-size="20" font-weight="800" fill="#fff">${esc(c.name_wp)}</text>`;
      if (W.sg_ready) o += `<text x="424" y="356" font-size="8" class="we wt wx" data-more="${esc(W.sg_ready)}" fill="#fff" opacity=".85">SG ${esc(S(W.sg_ready))}</text>`;
      o += `<circle cx="434" cy="353" r="5" fill="${wp_sperre ? F.warm : wp_on ? F.led : '#4b5058'}" stroke="#fff" stroke-opacity=".35"${wp_on ? ' class="wb"' : ''}/>`;
      if (QT === 'luft' && (W.quelle_ein || W.quelle_aus))
        o += `<text x="390" y="382" font-size="8" class="wc wv wx" data-more="${esc(W.quelle_ein || W.quelle_aus)}">${L.luft} ${[W.quelle_ein ? fmt(S(W.quelle_ein)) : '', W.quelle_aus ? fmt(S(W.quelle_aus)) : ''].filter(Boolean).join(' → ')}</text>`;
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
