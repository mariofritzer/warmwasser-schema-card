# Warmwasser Schema Card

🇬🇧 English · [🇩🇪 Deutsch](README.de.md)

An animated hydraulic diagram for Home Assistant: storage tank, fresh water module with circulation, heat pump, immersion heaters, solar thermal, an additional heat source (stove, wood boiler, pellets, gas, oil, district heating, CHP), hydraulic separator and up to six mixed heating circuits.

![Screenshot](images/screenshot.png)

- **Everything is optional:** every device and every single value only appears when you configure an entity for it
- **Visual editor:** set everything up in the dashboard editor – no YAML required
- **German and English:** follows your Home Assistant language, or set `sprache: de` / `sprache: en`
- **Rendered in the browser:** no server-side template rendering, visible immediately after loading
- Tank temperature as a colour gradient from any number of sensors
- Flow animation in every pipe, driven by pumps, mixer position, diverter valve and tapping
- Mixer simulation: share of buffer and return water shown through colour and flow speed
- Clickable: pump mode of the additional heat source, circulation pump on/off, more-info dialog for every value
- Works with light and dark themes

## Installation

### HACS

1. HACS → ⋮ → **Custom repositories**
2. Add this repository's URL, category **Dashboard**
3. Install “Warmwasser Schema Card” and reload the browser

### Manual

1. Copy `warmwasser-schema-card.js` to `/config/www/`
2. Settings → Dashboards → ⋮ → **Resources** → Add resource
   - URL: `/local/warmwasser-schema-card.js`
   - Type: **JavaScript module**
3. Reload the browser (Ctrl+F5)

## Configuration

Add the card via **Add card → Warmwasser Schema Card** and configure it in the visual editor, or use YAML.
The configuration keys are German; the table below gives the English meaning.

Minimal:

```yaml
type: custom:warmwasser-schema-card
fuehler:
  - { name: Top, entity: sensor.tank_top }
  - { name: Bottom, entity: sensor.tank_bottom }
```

A complete, commented example is in [`examples/beispiel.yaml`](examples/beispiel.yaml).

### General

| Key | Default | Meaning |
|---|---|---|
| `titel` | depends on language | Title |
| `sprache` | `auto` | `auto`, `de`, `en` |
| `hersteller` | `HOVAL` | Label on FWM and heat pump |
| `name_wp`, `name_fm` | `WP`, `FM` | Device names |
| `fuehler` | – | Tank sensors top → bottom: `{ name, entity, hoehe }` (height 0–100 %) or `[name, entity, height]` |
| `t_min`, `t_max` | `40`, `55` | Colour scale of the tank (°C) |
| `hs_stufen` | `7` | Steps of the immersion heaters |
| `aussen` | – | Outdoor temperature (header) |
| `pv` | – | PV power in W (header) |
| `zirkulationspumpe` | – | Circulation pump, click toggles it |
| `farben` | – | `aktiv`, `warm`, `kalt`, `led`, `solar`, `quelle`, `tw_kalt`, `tw_warm`, `geraet_hell`, `geraet_dunkel` |

### `speicher` – storage tank

| Key | Default | Meaning |
|---|---|---|
| `typ` | `trennblech` | `trennblech` (2 zones with baffle plate), `schicht` (stratified), `kombi` (tank-in-tank), `hygiene` (stainless coil), `getrennt` (separate hot water + buffer tank) |
| `volumen` | – | Volume in litres (buffer for `getrennt`) |
| `volumen_ww` | – | Hot water tank volume (`getrennt` only) |
| `trennung` | `50` | Height of baffle / split / inner boiler in % (35–70) |

### `wp` – heat pump

| Key | Meaning |
|---|---|
| `typ` | `luft` (air), `sole` (brine / ground probe), `wasser` (water / well) |
| `leistung`, `schwelle` | Electrical power (W); running above threshold (default 100) |
| `betrieb` | Alternative: entity that is `on` while running |
| `vorlauf`, `ruecklauf` | Flow / return temperature |
| `waerme`, `wmz`, `cop` | Heat output, heat meter (kWh), COP |
| `ventil` | Diverter valve: `on`/`off`, 0–100, or text containing e.g. “Warmwasser/DHW” or “Heizung/heating”. Without it, both zones are shown as charging. |
| `kuehlen` | Cooling mode – heating circuit colours are swapped |
| `sperre`, `abtauen`, `sg_ready` | Grid lock, defrost, SG Ready |
| `quelle_ein`, `quelle_aus`, `quelle_pumpe` | Source temperatures and source pump |

### `heizstab_oben`, `heizstab_unten` – immersion heaters

`name`, `stufe` (step), `temp`, `leistung` (power).

### `kamin` – additional heat source

| Key | Default | Meaning |
|---|---|---|
| `typ` | `kamin` | `kamin` (stove), `holzvergaser`, `pellet`, `gas`, `oel`, `fernwaerme` (district heating), `bhkw` (CHP) |
| `temp`, `trend` | – | Boiler temperature, trend (`rising`/`falling`, `steigend`/`fallend`) |
| `brenner` | – | Burner / running (`on`) instead of temperature thresholds |
| `pumpe`, `modus` | – | Pump to the buffer, pump mode `input_select` (click cycles it) |
| `warm`, `feuer` | `30`, `35` | Embers / fire from this temperature |
| `abgas`, `zuluft` | – | Flue gas temperature, air damper |
| `leistung`, `leistung_el`, `wmz` | – | Heat output, electrical output (CHP), heat meter |

### Other devices

| Block | Keys |
|---|---|
| `solar` | `kollektor`, `pumpe`, `leistung`, `wmz`, `name` |
| `fm` (fresh water module) | `temp`, `durchfluss` (l/min – pipes flow while tapping), `pumpe`; `fm: true` shows it without sensors |
| `trinkwasser` (drinking water) | `temp` (cold water), `zaehler` (water meter), `enthaertung` (softener) |
| `weiche` (hydraulic separator) | `temp`; `weiche: true` shows it without sensor |
| `legionellen` | `letzte` (timestamp, date or days), `aktiv`, `tage` (warning threshold, default 7) |
| `energie` | List of `{ name, entity, icon, farbe }` – bars below the diagram |

### `heizkreise` – heating circuits (1–6)

| Key | Meaning |
|---|---|
| `name` | Label |
| `pumpe` | `on` or value > 0 = running |
| `mischer` | −100 = return only, 0 = half/half, 100 = buffer only |
| `vorlauf`, `vorlauf_soll`, `raum`, `wmz` | Flow, flow target, room temperature, heat meter |
| `typ` | `fussboden` (floor heating) or `heizkoerper` (radiators) |

## License

MIT – see [LICENSE](LICENSE).
