# Layout-Editor (Beta)

[Deutsch](#deutsch) · [English](#english)

## Deutsch

### Freischalten

Der Layout-Editor ist eine versteckte, kartenbezogene Testfunktion. Er ist nur für
eine Karte aktiv, deren YAML folgende Option enthält:

```yaml
type: custom:warmwasser-schema-card
layout_editor_beta: true
```

Ohne diese Option wird ein gespeichertes `layout` ignoriert, und die Karte wird
unverändert gezeichnet.

### Bedienung

Im Karteneditor erscheint oben **Anlagenbild anordnen (Beta)**:

- Bauteile in der Vorschau mit der Maus ziehen oder auswählen und mit den Pfeilen
  verschieben, jeweils im 5er-Raster. Ungültige Zwischenpositionen werden beim Ziehen
  übersprungen; das Bauteil bleibt an der letzten gültigen Position.
- Rückgängig, Wiederholen und Zurücksetzen.
- **Anschlüsse:** Für das gewählte Bauteil Auto, Links oder Rechts; bei den Speichern
  getrennt für Frischwasser- und Wärmepumpen-Anschlüsse. Auto zeigt die berechnete
  Seite. Eine Seite ohne gültigen Rohrweg wird abgelehnt.
- **Zoom** mit − und + zwischen 50 % und 300 %. Er skaliert nur die Zeichnung in der
  Vorschau; der Rahmen bleibt gleich groß, vergrößert wird gescrollt. Die Karte selbst
  bleibt unverändert.
- Wird eine Position abgelehnt, nennt der Editor den Grund, bei Überlappungen die
  betroffenen Teile (z. B. „Fühlerplatte am Pufferspeicher überlappt
  Umschaltventil“).

### Format

Gespeichert wird das Format aus dem Konzept (`docs/layout-editor-router-concept.md`),
Koordinaten in SVG-Einheiten:

```yaml
layout:
  version: 2
  components:              # absolute Ursprünge; nur Abweichungen von der Standardposition
    fm: { x: 380, y: 74 }
    buffer-tank: { x: 222, y: 203 }
  ports:                   # optional; fehlende Einträge = auto
    fm.supply: { mode: manual, side: left }
```

- **Komponenten:** `fm`, `hot-tank` und `buffer-tank` (getrennte Speicher) bzw. `tank`,
  bei einer Wärmepumpe zusätzlich `wp` und `valve` (Umschaltventil), bei einer Sole-
  oder Wasser-Wärmepumpe auch `heat-source` (Wärmequelle: Erdsonde bzw. Brunnen). „Beide
  Speicher“ im Editor schreibt beide Speicher-Einträge. Fühlerplatten, Heizstäbe und
  Füße wandern mit ihrem Speicher. Ohne eigene Position folgt das Ventil der
  Wärmepumpe waagrecht auf die dem Speicher zugewandte Seite und bleibt auf Höhe der
  Speicher-Rückläufe; die Wärmequelle folgt der Wärmepumpe in beide Richtungen, sodass
  die beiden Quellenleitungen gerade bleiben. Wird die Quelle einzeln verschoben, werden
  die Leitungen um die Wärmepumpe herum geführt. Die Quellenleitungen werden wie die
  übrigen Leitungen geroutet (mit Brücken); der Sondenbogen bei Sole bleibt in der
  Quelle, und bei Wasser/Brunnen läuft die Fließanimation gegen die Leitungsrichtung.
- **Anschlüsse:** Erlaubte Seiten sind im Komponentenmodell deklariert. Links oder
  rechts dürfen liegen: `fm.supply`, `fm.return`; am Speicher `fm-supply`,
  `fm-return`, `wp-supply`, `wp-return`, `lower-supply`, `lower-return`;
  `wp.lower-supply`, `wp.return`; `valve.wp`. Dreht sich `valve.wp`, wird das ganze
  Ventilsymbol gespiegelt. Fest bleiben der obere WP-Anschluss und der untere
  FM-Rücklauf am Schichtspeicher.
- **Auto:** Anschlüsse von FM bzw. Wärmepumpe und Speicher zeigen zueinander, der
  Ventilanschluss zur Wärmepumpe. Nur wenn ein Gerät über oder unter dem Speicher
  liegt, wird auch die andere Seite probiert und die kürzere gültige Variante gewählt.
  Fühlerplatten wechseln auf die Speicherseite mit weniger Anschlüssen, an einem
  Speicher mit Heizstab bleiben sie links.
- Rohrpunkte werden nicht gespeichert, sondern bei jedem Zeichnen berechnet; Kreuzungen
  bekommen eine Brücke.
- Das frühere Format `version: 1` wird mit einem Hinweis abgelehnt („Zurücksetzen“ oder
  neu anordnen). Ungültige Einträge melden ihren Fehlercode (`unknown-id`,
  `invalid-position`, `unknown-port`, `invalid-side`, `invalid-mode`, `out-of-range`).

### Umfang

Unterstützt sind Anlagen mit Frischwassermodul, optional mit einer einfachen
Wärmepumpe und optional mit Heizstäben. Die Wärmepumpe darf Luft-, Sole- oder
Wasser-Wärmepumpe sein, jeweils ohne Wärmemengenzähler und SG Ready. Bei Luft sind
zusätzlich keine Quellentemperaturen (`quelle_ein`, `quelle_aus`) erlaubt; bei Sole
und Wasser sind Quellentemperaturen und Quellenpumpe möglich. Nicht unterstützt sind Heizkreise, Zusatzwärme, Solar,
Zirkulation, Trinkwasser- und Legionellenanzeige; dort bietet der Editor keine
verschiebbaren Bauteile an. Das Umschaltventil im Vorlauf (`wp.ventil_position:
vorlauf`) wird mit beiden Rücklauf-Anbindungen geroutet. Bei `kombiniert` liegt der
Abzweig der Rückläufe vor dem WP-Rücklauf, an der nächsten freien Stelle. Im Layout
speist der seitliche WP-Ausgang das Ventil gerade; das mitlaufende Ventil sitzt davor.
Liegt der Puffer höher als der Warmwasserspeicher, versorgt der obere Ventilausgang den
Puffer; die Stellungsanzeige des Ventils dreht mit.
Zwischen Ventil und Speicher braucht es Platz für die Rohre; Anordnungen mit Rohren um
andere Bauteile herum werden abgelehnt. Kann eine gespeicherte Anordnung nicht dargestellt werden,
zeigt die Karte die Standardansicht mit einem kurzen Hinweis; die gespeicherten Werte
bleiben erhalten.

### Lokal testen

Repository mit `python3 -m http.server 8000` ausliefern und
`http://localhost:8000/tests/helpers/layout-beta.html` öffnen. Die Seite simuliert
Home-Assistant-Daten; Knöpfe laden Varianten mit Luft-, Sole- oder Wasser-Wärmepumpe
oder Heizstäben. Parameter: `?selftest=1` (automatische Zeigerprüfungen), `?wp=1`
(Luft), `?wp=sole`, `?wp=wasser`, `?hs=1`,
`?demo=<Layout-JSON>`, `?select=<Bauteil>`, `?zoom=<Schritte>`.

## English

### Enabling

The layout editor is a hidden, per-card test feature. It is only active for a card
whose YAML contains:

```yaml
type: custom:warmwasser-schema-card
layout_editor_beta: true
```

Without this option a saved `layout` is ignored and the card is drawn unchanged.

### Usage

The card editor shows **Arrange diagram (beta)** at the top:

- Drag components in the preview with the mouse, or select them and use the arrows,
  on a 5-unit grid. Invalid intermediate positions are skipped while dragging; the
  component stays at its last valid position.
- Undo, redo and reset.
- **Ports:** Auto, Left or Right for the selected component; for the tanks separately
  for fresh water and heat pump ports. Auto shows the resolved side. A side without a
  valid pipe route is rejected.
- **Zoom** with − and + between 50 % and 300 %. It scales only the drawing in the
  preview; the frame keeps its size and scrolls when enlarged. The card itself is
  unchanged.
- When a position is rejected, the editor names the reason, for overlaps the parts
  involved (e.g. "Sensor plate of the buffer tank overlaps the diverter valve").

### Format

The format follows the concept (`docs/layout-editor-router-concept.md`), coordinates
in SVG units:

```yaml
layout:
  version: 2
  components:              # absolute origins; only deviations from the default position
    fm: { x: 380, y: 74 }
    buffer-tank: { x: 222, y: 203 }
  ports:                   # optional; missing entries = auto
    fm.supply: { mode: manual, side: left }
```

- **Components:** `fm`, `hot-tank` and `buffer-tank` (separate tanks) or `tank`, and
  with a heat pump also `wp` and `valve` (diverter valve), and with a brine or water
  heat pump also `heat-source` (ground probe or well). "Both tanks" in the editor
  writes both tank entries. Sensor plates, heaters and feet move with their tank.
  Without its own position the valve follows the heat pump horizontally to the side
  facing the tank and stays at the height of the tank returns; the heat source follows
  the heat pump in both directions, so the two source pipes stay straight. When the
  source is moved on its own, the pipes are routed around the heat pump. The source
  pipes are routed like the other pipes (with bridges); the probe loop of brine stays
  inside the source, and for water/well the flow animation runs against the direction
  of the connections.
- **Ports:** allowed sides are declared in the component model. Allowed on the left or
  right: `fm.supply`, `fm.return`; on the tanks `fm-supply`, `fm-return`, `wp-supply`,
  `wp-return`, `lower-supply`, `lower-return`; `wp.lower-supply`, `wp.return`;
  `valve.wp`. Turning `valve.wp` mirrors the whole valve symbol. The top heat pump port
  and the bottom module return of a single tank stay fixed.
- **Auto:** the ports of module or heat pump and tank face each other, and the valve
  port faces the heat pump. Only when a device is above or below the tank is the other
  side tried as well, keeping the shorter valid variant. Sensor plates move to the tank
  side with fewer ports; on a tank with a heater they stay on the left.
- Pipe points are not stored but computed on every render; crossings get a bridge.
- The former format `version: 1` is rejected with a notice (reset or rearrange).
  Invalid entries report their error code (`unknown-id`, `invalid-position`,
  `unknown-port`, `invalid-side`, `invalid-mode`, `out-of-range`).

### Scope

Supported are systems with a fresh water module, optionally with a simple heat pump
and optionally with heaters. The heat pump may be an air, brine or water heat pump,
each without heat meter and SG Ready. For air, source temperatures (`quelle_ein`,
`quelle_aus`) are not allowed; for brine and water, source temperatures and the source
pump are possible. Not
supported are heating circuits, additional heat, solar, circulation, domestic water and
legionella display; there the editor offers no movable components. The diverter
valve in the supply (`wp.ventil_position: vorlauf`) is routed with both return
connections. With `kombiniert` the returns join at a tee in front of the heat pump
return, at the nearest free place. In layouts the heat pump's side outlet feeds the
valve straight; a following valve sits in front of it. With the buffer above the
hot-water tank, the valve's upper outlet feeds the buffer; the valve indicator follows. Valve and tanks need room for
the pipes between them; arrangements with pipes around other components are rejected. If a saved
arrangement cannot be drawn, the card shows the standard diagram with a short notice
and keeps the saved values.

### Local test

Serve the repository with `python3 -m http.server 8000` and open
`http://localhost:8000/tests/helpers/layout-beta.html`. The page simulates Home
Assistant data; buttons load variants with an air, brine or water heat pump or heaters.
Parameters: `?selftest=1` (automated pointer checks), `?wp=1` (air), `?wp=sole`,
`?wp=wasser`, `?hs=1`, `?demo=<layout JSON>`,
`?select=<component>`, `?zoom=<steps>`.
