const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const registry = new Map();
const context = { HTMLElement: class {}, customElements: { get: (name) => registry.get(name), define: (name, ctor) => registry.set(name, ctor) }, window: {}, console: { info() {} } };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../warmwasser-schema-card.js'), 'utf8'), context);
const Card = registry.get('warmwasser-schema-card');
const render = (typ, trennung = 50, withModule = true) => {
  const card = new Card();
  card.setConfig({ speicher: { typ, trennung }, fm: withModule ? { pumpe: 'binary_sensor.fm' } : undefined, wp: { betrieb: 'binary_sensor.wp' } });
  card._hass = { states: { 'binary_sensor.fm': { state: 'on' } }, language: 'de' };
  return card._render();
};

test('separate tanks return the fresh-water module to the hot-water tank', () => {
  for (const split of [35, 50, 70]) {
    const svg = render('getrennt', split);
    const returnY = 40 + 310 * split / 100 - 32 - 14;
    const radius = Math.min(8, Math.max(0, (returnY - 90) / 2));
    const cornerX = returnY > 128 ? 322 : 315;
    assert.ok(svg.includes(`M336 90H${cornerX + radius}Q${cornerX} 90 ${cornerX} ${90 + radius}V${returnY - radius}Q${cornerX} ${returnY} ${cornerX - radius} ${returnY}H206`));
    assert.ok(svg.includes('<rect x="332" y="84" width="10" height="12"'));
    assert.ok(!svg.includes('H145Q137 390 137 382V376'));
  }
});

test('small separate tanks bridge the return and keep the heater clear on the right', () => {
  const card = new Card();
  card.setConfig({ speicher: { typ: 'getrennt', trennung: 35 }, fm: { pumpe: 'binary_sensor.fm' }, wp: { betrieb: 'binary_sensor.wp' }, heizstab_oben: { leistung: 'sensor.heater' } });
  card._hass = { language: 'de', states: { 'binary_sensor.fm': { state: 'on' }, 'sensor.heater': { state: '500' } } };
  const svg = card._render();
  assert.ok(svg.includes('V108.5A6 6 0 0 1 300 96.5'));
  assert.ok(svg.includes('<rect x="198" y="56.5" width="14" height="12"'));
  assert.ok(svg.includes('<rect x="198" y="71.5" width="16" height="22"'));
  assert.ok(!svg.includes('<g transform="translate(274 0) scale(-1 1)">'));
});

test('hot-water charging pipe jumps over the fresh-water return only at a crossing', () => {
  assert.ok(render('getrennt', 50).includes('H328A6 6 0 0 1 316 128'));
  for (const svg of [render('getrennt', 35), render('getrennt', 50, false), render('schicht')]) {
    assert.ok(!svg.includes('H328A6 6 0 0 1 316 128'));
    assert.ok(svg.includes('H308Q300 128 300 120'));
  }
});

test('a shared tank keeps its original bottom return', () => {
  for (const typ of ['schicht', 'trennblech']) {
    assert.ok(render(typ).includes('M452 90H458Q466 90 466 98V382Q466 390 458 390H145Q137 390 137 382V376'));
  }
});

test('split values 35–70 keep charging bridges on straight FM segments', () => {
  for (const split of [...Array.from({length:36}, (_,i)=>35+i), 36.77, 36.78, 49.35, 49.36]) for (const options of [{}, {wp:{betrieb:'binary_sensor.wp',wmz:'sensor.meter'}}, {heizstab_oben:{leistung:'sensor.heater'}}]) {
    const card=new Card();
    card.setConfig({speicher:{typ:'getrennt',trennung:split}, fm:{pumpe:'binary_sensor.fm'}, wp:{betrieb:'binary_sensor.wp'}, ...options});
    card._hass={language:'de',states:{'binary_sensor.fm':{state:'on'},'sensor.meter':{state:'10'},'sensor.heater':{state:'500'}}};
    const svg=card._render(), y=40+310*split/100-46;
    if (options.wp) assert.ok(svg.includes(`<text x="292" y="${Math.min(103,y-15)}" font-size="8"`), `${split}: meter label clearance`);
    const fmPaint=svg.indexOf('d="M336 90'), wpPaint=svg.indexOf('d="M350 146');
    assert.ok(fmPaint>=0 && wpPaint>fmPaint, `${split}: WP supply bridge paints over FM return`);
    const simple=y>108 && y<=147 && !options.wp;
    if (simple) {
      assert.ok(svg.includes('Q300 128 300 120V96A6 6 0 0 1 300 84V'),`${split}: vertical charging bridge`);
      const corner=Number(svg.match(/A6 6 0 0 1 300 84V([\d.]+)/)[1]);
      assert.ok(90-corner>=11, `${split}: clearance from charging corner`);
      assert.ok(svg.includes(`H288Q280 90 280 98V`),`${split}: return crosses on the straight section`);
      assert.ok(300-288>=11 && 90-78>=11);
    } else if (y>108 || options.wp) {
      assert.ok(svg.includes('H328A6 6 0 0 1 316 128H308Q300 128 300 120'),`${split}: charging bridge and straight before corner`);
      if (y<=147) {
        const detour=Math.max(155,y+32);
        assert.ok(svg.includes(`Q322 90 322 98V${detour-8}Q322 ${detour} 314 ${detour}H288Q280 ${detour} 280 ${detour-8}V${y+8}Q280 ${y} 272 ${y}H206`),`${split}: FM detour`);
        assert.ok(detour-8-128>=11,`${split}: clearance below crossing`);
      } else assert.ok(y-8-128>=11,`${split}: clearance below crossing`);
      assert.ok(128-98>=11,`${split}: clearance above crossing`);
    } else {
      assert.ok(svg.includes(`V${y+6}A6 6 0 0 1 300 ${y-6}`),`${split}: vertical bridge`);
      assert.ok(120-y>=12,`${split}: clearance from charging corner`);
    }
  }
});

test('split FM and WP use the same six-unit radius for both charging bridges', () => {
  for (const split of [35, 40, 50, 70]) {
    const svg=render('getrennt',split);
    assert.ok(svg.includes('H268A6 6 0 0 0 256'),`${split}: lower charging bridge`);
    assert.ok(!svg.includes('H270A8 8 0 0 0 254'),`${split}: old lower bridge`);
    assert.ok(svg.includes('A6 6 0 0 1 300 ') || svg.includes('H328A6 6 0 0 1 316 128H308'),`${split}: upper charging bridge`);
  }
  assert.ok(render('schicht').includes('H270A8 8 0 0 0 254'));
  assert.ok(render('getrennt',50,false).includes('H270A8 8 0 0 0 254'));
});
