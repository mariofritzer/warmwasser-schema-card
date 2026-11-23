# Layout-Editor (Beta)

[Deutsch](#deutsch) · [English](#english)

## Deutsch

Der Layout-Editor ist eine versteckte, kartenbezogene Testfunktion. Er wird nur
für eine Karte aktiv, wenn deren YAML folgende Option enthält:

```yaml
type: custom:warmwasser-schema-card
layout_editor_beta: true
```

Im Karteneditor erscheint dann der Bereich **Anlagenbild anordnen (Beta)**. Bauteile
werden in der Vorschau mit der Maus gezogen oder ausgewählt und mit den Pfeilen im
5er-Raster verschoben. Rückgängig, Wiederholen und Zurücksetzen stehen zur Verfügung.
Mit − und + lässt sich die Vorschau zwischen 50 % und 300 % zoomen; die Karte selbst
bleibt unverändert. Für das gewählte Bauteil lassen sich die Anschlussseiten auf Auto,
Links oder Rechts stellen (bei den Speichern getrennt für Frischwasser- und
Wärmepumpen-Anschlüsse); Auto zeigt die berechnete Seite. Eine Seite ohne gültigen
Rohrweg wird abgelehnt und die bisherige Wahl bleibt.
Die Leitungen zwischen Speicher und Frischwassermodul werden automatisch geführt.
Eine Position wird nur übernommen, wenn sich keine Bauteile überlappen und ein freier
Rohrweg existiert; beim Ziehen bleibt das Bauteil sonst an der letzten gültigen
Position stehen.

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

Verschiebbar sind `fm` sowie `hot-tank` und `buffer-tank` (getrennte Speicher) bzw.
`tank`, bei einer Luft-Wärmepumpe zusätzlich `wp` und `valve` (Umschaltventil). Im
Editor bewegt „Beide Speicher“ beide Einträge gemeinsam. Anschlussseiten sind im
Komponentenmodell deklariert. Links oder rechts liegen dürfen derzeit:
`fm.supply`, `fm.return`; am Speicher `fm-supply`, `fm-return`, `wp-supply`,
`wp-return`, `lower-supply`, `lower-return`; `wp.lower-supply`, `wp.return`; und
`valve.wp`. Dreht sich der Ventilanschluss, wird das ganze Ventilsymbol gespiegelt.
Der obere WP-Anschluss und der untere FM-Rücklauf am Schichtspeicher bleiben fest.
Bei `auto` zeigen die Anschlüsse von FM bzw. Wärmepumpe und Speicher zueinander und
der Ventilanschluss zur Wärmepumpe; nur wenn ein Gerät über oder unter dem Speicher
liegt, wird auch die andere Seite probiert und die kürzere gültige Variante gewählt.
Kreuzen sich Leitungen, wird eine Brücke gezeichnet. Fühlerplatten
wechseln auf die Speicherseite mit weniger Anschlüssen. Rohrpunkte werden nicht
gespeichert. Das frühere Format `version: 1` wird mit einem Hinweis abgelehnt
(im Editor „Zurücksetzen“ oder neu anordnen); ungültige Einträge werden mit ihrem
Fehlercode gemeldet.

Unterstützt sind zunächst Anlagen mit Frischwassermodul, optional mit einer einfachen
Luft-Wärmepumpe (ohne Wärmemengenzähler, SG Ready und Quellentemperaturen) und
optional mit Heizstäben, ohne Heizkreise, Zusatzwärme, Solar, Zirkulation,
Trinkwasser- und Legionellenanzeige – also die Konfigurationen, die der vorhandene
Router abdeckt. Heizstäbe wandern mit ihrem Speicher; Leitungen halten Abstand zu
ihrem Anschlusskasten, und Fühlerplatten bleiben an einem Speicher mit Heizstab links. Für andere
Anlagen zeigt der Editor keine verschiebbaren Bauteile. Kann eine gespeicherte
Anordnung nicht dargestellt werden, zeigt die Karte die Standardansicht mit einem
kurzen Hinweis; die gespeicherten Werte bleiben erhalten.

Ohne `layout_editor_beta: true` wird ein gespeichertes `layout` ignoriert. Karten
ohne diese Option werden unverändert gezeichnet.

Lokaler Test ohne Home Assistant: Repository mit `python3 -m http.server 8000`
ausliefern und `http://localhost:8000/tests/helpers/layout-beta.html` öffnen.
`?selftest=1` führt automatische Zeigerprüfungen aus.

## English

The layout editor is a hidden, per-card test feature. It is only active for a card
whose YAML contains:

```yaml
type: custom:warmwasser-schema-card
layout_editor_beta: true
```

The card editor then shows **Arrange diagram (beta)**. Drag components in the
preview with the mouse, or select them and use the arrows on a 5-unit grid. Undo,
redo and reset are available.
Use − and + to zoom the preview between 50 % and 300 %; the card itself is unchanged.
For the selected component the port sides can be set to Auto, Left or Right (for the
tanks separately for fresh water and heat pump ports); Auto shows the resolved side. A
side without a valid pipe route is rejected and the previous choice is kept. Pipes between the tanks and the fresh water module are
routed automatically. A position is only accepted when no components overlap and a
clear pipe route exists; while dragging, the component otherwise stays at its last
valid position.

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

Movable are `fm` and `hot-tank` and `buffer-tank` (separate tanks) or `tank`, and with
an air heat pump also `wp` and `valve` (diverter valve). In the editor, “Both tanks”
moves both entries together. Port sides are declared in the component model. Currently
allowed on the left or right: `fm.supply`, `fm.return`; on the tanks `fm-supply`,
`fm-return`, `wp-supply`, `wp-return`, `lower-supply`, `lower-return`;
`wp.lower-supply`, `wp.return`; and `valve.wp`. Turning the valve port mirrors the
whole valve symbol. The top heat-pump port and the bottom module return of a single
tank stay fixed. With `auto`, the ports of module or heat pump and tank face each other
and the valve port faces the heat pump; only when a device is above or below the tank
is the other side tried as well, keeping the shorter valid variant. Crossing pipes are
drawn with a bridge. Sensor plates move to the tank
side with fewer ports. Pipe points are not stored. The former format `version: 1`
is rejected with a notice (reset or rearrange in the editor); invalid entries are
reported with their error code.

The first scope covers systems with a fresh water module, optionally with a simple
air heat pump (no heat meter, SG Ready or source temperatures) and optionally with
heaters, without heating circuits, additional heat, solar, circulation, domestic water
and legionella display, i.e. the configurations the existing router covers. Heaters
move with their tank; pipes keep clear of their terminal box, and sensor plates stay
on the left of a tank with a heater. For
other systems the editor offers no movable components. If a saved arrangement cannot
be drawn, the card shows the standard diagram with a short notice and keeps the saved
values.

Without `layout_editor_beta: true` a saved `layout` is ignored. Cards without the
option are drawn unchanged.

Local test without Home Assistant: serve the repository with
`python3 -m http.server 8000` and open
`http://localhost:8000/tests/helpers/layout-beta.html`. `?selftest=1` runs automated
pointer checks.
