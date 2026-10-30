# Warmwasser Schema Card

[🇬🇧 English](README.md) · 🇩🇪 Deutsch

Animiertes Anlagenschema für Home Assistant: Speicher, Frischwassermodul mit Zirkulation, Wärmepumpe, Heizstäbe, Solarthermie, Zusatzwärme (Kaminofen, Holzvergaser, Pellets, Gas, Öl, Fernwärme, BHKW), hydraulische Weiche und bis zu sechs gemischte Heizkreise.

![Screenshot](images/screenshot.png)

- **Alles optional:** Jedes Gerät und jeder Einzelwert erscheint nur, wenn dafür eine Entität angegeben ist
- **Grafischer Editor:** Alles im Dashboard-Editor einstellbar, kein YAML nötig
- **Deutsch und Englisch:** Richtet sich nach der Sprache von Home Assistant, oder fest mit `sprache: de` / `sprache: en`
- **Im Browser gezeichnet:** Kein Template-Rendering auf dem Server, sofort sichtbar nach dem Laden
- Speichertemperatur als Farbverlauf aus beliebig vielen Fühlern
- Strömungsanimation in allen Rohren, abhängig von Pumpen, Mischerstellung, Umschaltventil und Zapfung
- Mischer-Simulation: Anteil Puffer- und Rücklaufwasser über Farbe und Fließgeschwindigkeit
- Klickbar: Pumpenmodus der Zusatzwärme, Zirkulationspumpe ein/aus, Detaildialog für alle Werte
- Funktioniert mit hellem und dunklem Theme

## Installation

### Über HACS

1. HACS → ⋮ → **Benutzerdefinierte Repositories**
2. URL dieses Repositories eintragen, Typ **Dashboard**
3. „Warmwasser Schema Card“ installieren und den Browser neu laden

### Manuell

1. `warmwasser-schema-card.js` nach `/config/www/` kopieren
2. Einstellungen → Dashboards → ⋮ → **Ressourcen** → Ressource hinzufügen
   - URL: `/local/warmwasser-schema-card.js`
   - Typ: **JavaScript-Modul**
3. Browser neu laden (Strg+F5)

## Konfiguration

Karte über **Karte hinzufügen → Warmwasser Schema Card** einfügen und im grafischen Editor einrichten, oder per YAML.

Minimal:

```yaml
type: custom:warmwasser-schema-card
fuehler:
  - { name: Oben, entity: sensor.speicher_oben }
  - { name: Unten, entity: sensor.speicher_unten }
```

Ein vollständiges, kommentiertes Beispiel liegt in [`examples/beispiel.yaml`](examples/beispiel.yaml).

### Allgemein

| Option | Standard | Beschreibung |
|---|---|---|
| `titel` | je nach Sprache | Überschrift |
| `sprache` | `auto` | `auto`, `de`, `en` |
| `hersteller` | `HOVAL` | Schriftzug auf FM und WP |
| `name_wp`, `name_fm` | `WP`, `FM` | Beschriftung der Geräte |
| `fuehler` | – | Speicherfühler von oben nach unten: `{ name, entity, hoehe }` (Höhe 0–100 %) oder `[Name, Entität, Höhe]` |
| `t_min`, `t_max` | `40`, `55` | Farbskala Speicher (°C) |
| `hs_stufen` | `7` | Leistungsstufen der Heizstäbe |
| `aussen` | – | Außentemperatur (Kopfzeile) |
| `pv` | – | PV-Leistung in W (Kopfzeile) |
| `zirkulationspumpe` | – | Zirkulationspumpe, Klick schaltet um |
| `farben` | – | `aktiv`, `warm`, `kalt`, `led`, `solar`, `quelle`, `tw_kalt`, `tw_warm`, `geraet_hell`, `geraet_dunkel` |

### `speicher`

| Option | Standard | Beschreibung |
|---|---|---|
| `typ` | `trennblech` | `trennblech` (2 Kammern mit Blech, hydraulisch offen), `schicht` (1 Kammer), `kombi` (Tank-in-Tank), `hygiene` (Wellrohr), `getrennt` (Warmwasser- und Pufferspeicher) |
| `volumen` | – | Volumen in Litern (bei `getrennt`: Puffer) |
| `volumen_ww` | – | Nur bei `getrennt`: Volumen Warmwasserspeicher |
| `trennung` | `50` | Höhe von Blech, Trennung bzw. innerem Boiler in % (35–70) |

### `wp` – Wärmepumpe

| Option | Beschreibung |
|---|---|
| `typ` | `luft`, `sole` (Erdsonde), `wasser` (Brunnen) |
| `leistung`, `schwelle` | Elektrische Leistung (W), ab Schwelle läuft sie (Standard 100) |
| `betrieb` | Alternativ: Entität, die bei Betrieb `on` ist |
| `vorlauf`, `ruecklauf` | Temperaturen |
| `waerme`, `wmz`, `cop` | Wärmeleistung, Wärmemengenzähler (kWh), COP |
| `ventil` | Umschaltventil: `on`/`off`, 0–100 oder Text mit z. B. „Warmwasser“ bzw. „Heizung“. Ohne Angabe werden beide Zonen als geladen gezeigt. |
| `kuehlen` | Kühlbetrieb – die Farben der Heizkreise werden getauscht |
| `sperre`, `abtauen`, `sg_ready` | EVU-Sperre, Abtauen, SG-Ready |
| `quelle_ein`, `quelle_aus`, `quelle_pumpe` | Quellentemperaturen und Quellenpumpe |

`wp_leistung` / `wp_schwelle` auf oberster Ebene funktionieren weiterhin.

### `heizstab_oben`, `heizstab_unten`

`name`, `stufe`, `temp`, `leistung`.

### `kamin` (oder `zusatzwaerme`)

| Option | Standard | Beschreibung |
|---|---|---|
| `typ` | `kamin` | `kamin`, `holzvergaser`, `pellet`, `gas`, `oel`, `fernwaerme`, `bhkw` |
| `temp`, `trend` | – | Kesseltemperatur, Trend (`steigend`/`fallend`) |
| `brenner` | – | Brenner/Betrieb (`on`) statt Temperatur-Schwellen |
| `pumpe`, `modus` | – | Pumpe zum Puffer, Pumpenmodus als `input_select` (Klick schaltet weiter) |
| `warm`, `feuer` | `30`, `35` | Ab hier Glut bzw. Flammen (°C) |
| `abgas`, `zuluft` | – | Abgastemperatur, Zuluftklappe |
| `leistung`, `leistung_el`, `wmz` | – | Wärmeleistung, elektrische Leistung (BHKW), Wärmemengenzähler |

### Weitere Geräte

| Block | Optionen |
|---|---|
| `solar` | `kollektor`, `pumpe`, `leistung`, `wmz`, `name` |
| `fm` | `temp`, `durchfluss` (l/min – Leitungen fließen beim Zapfen), `pumpe`; `fm: true` zeigt es ohne Sensoren |
| `trinkwasser` | `temp` (Kaltwasser), `zaehler` (Wasserzähler), `enthaertung` |
| `weiche` | `temp`; `weiche: true` zeigt sie ohne Sensor |
| `legionellen` | `letzte` (Zeitstempel, Datum oder Tage), `aktiv`, `tage` (Warnung ab, Standard 7) |
| `energie` | Liste aus `{ name, entity, icon, farbe }` – Balken unter dem Schema |

### `heizkreise` (1–6)

| Option | Beschreibung |
|---|---|
| `name` | Beschriftung |
| `pumpe` | `on` oder Wert > 0 = läuft |
| `mischer` | −100 = nur Rücklauf, 0 = halb/halb, 100 = nur Puffer |
| `vorlauf`, `vorlauf_soll`, `raum`, `wmz` | Vorlauf, Vorlauf-Soll, Raumtemperatur, Wärmemengenzähler |
| `typ` | `fussboden` oder `heizkoerper` |

## Entwicklung des Komponentenmodells

Das bestehende Diagramm wird auf ein gemeinsames internes Modell aus
Komponentengeometrie, benannten Anschlüssen, Verbindungen und expliziten Abzweigen
umgestellt, einschließlich Heizkreisen, Quellen und Trinkwasserkreis. Dieser Schritt ergänzt weder Konfigurationsfelder noch einen
Layout-Editor. Bestehende Karten behalten Darstellung und Verhalten einschließlich
der Korrektur des FM-Rücklaufs für getrennte Speicher aus
[PR #2](https://github.com/mariofritzer/warmwasser-schema-card/pull/2).
Dieser Rücklauf bildet die im Issue beschriebene Anlage ab und ist keine
allgemeingültige hydraulische Regel. Das Modell beschreibt das Diagramm und ist
keine Verrohrungsplanung.

Der [zweisprachige Plan mit Entscheidungen](docs/component-model-plan.md)
beschreibt Umfang, Alternativen, Branch-Abhängigkeiten und Folgeschritte. Für die
Installation bleibt es bei einer JavaScript-Datei ohne Laufzeitabhängigkeiten
und ohne Build-Schritt.

Der nächste Routing-Schritt ergänzt einen internen orthogonalen Router, zunächst
für FM-Vorlauf und -Rücklauf in begrenzten Konfigurationen mit intern verschobenen
Komponenten. Standardkarten behalten ihre bisherigen Rohrwege. Der
[Routing-Umfang und Geometrievertrag](docs/pipe-routing.md) beschreibt unterstützte
Fälle, ausdrückliche Fehler und Folgeschritte. Es entstehen keine neue
Layout-Konfiguration und kein Layout-Editor.

Der [Folgeschritt für WP/FM-Kombinationen](docs/complex-pipe-routing.md) berechnet
alle sieben äußeren Primärleitungen gemeinsam, einschließlich Kreuzungsbrücken.
Auch diese Erweiterung wird bisher ausschließlich durch interne Geometrieproben
aktiviert; normale Karten behalten ihre festen Pfade.

Entwicklungsprüfungen (Node.js ab Version 22; keine Pakete zu installieren):

```sh
node --check warmwasser-schema-card.js
node --test tests/*.test.cjs
```

## Lizenz

MIT – siehe [LICENSE](LICENSE).
