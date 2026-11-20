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
bleibt unverändert.
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
`tank`. Im Editor bewegt „Beide Speicher“ beide Einträge gemeinsam. Anschlussseiten
sind im Komponentenmodell deklariert; derzeit dürfen `fm.supply`, `fm.return`,
`hot-tank.fm-supply`, `hot-tank.fm-return` und `tank.fm-supply` links oder rechts
liegen. Bei `auto` zeigen die Anschlüsse von FM und Warmwasserspeicher zueinander;
liegen beide übereinander, wird die kürzere gültige Variante gewählt. Fühlerplatten
wechseln auf die Speicherseite mit weniger Anschlüssen. Rohrpunkte werden nicht
gespeichert. Das frühere Format `version: 1` wird mit einem Hinweis abgelehnt
(im Editor „Zurücksetzen“ oder neu anordnen); ungültige Einträge werden mit ihrem
Fehlercode gemeldet.

Unterstützt sind zunächst Anlagen mit Frischwassermodul ohne Wärmepumpe, Heizkreise,
Zusatzwärme, Solar, Heizstäbe, Zirkulation, Trinkwasser- und Legionellenanzeige – also die
Konfigurationen, die der vorhandene Router bereits vollständig abdeckt. Für andere
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
Use − and + to zoom the preview between 50 % and 300 %; the card itself is unchanged. Pipes between the tanks and the fresh water module are
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

Movable are `fm` and `hot-tank` and `buffer-tank` (separate tanks) or `tank`. In the
editor, “Both tanks” moves both entries together. Port sides are declared in the
component model; currently `fm.supply`, `fm.return`, `hot-tank.fm-supply`,
`hot-tank.fm-return` and `tank.fm-supply` may be on the left or right. With `auto`,
the ports of the fresh water module and the hot-water tank face each other; when
both are stacked, the shorter valid variant is used. Sensor plates move to the tank
side with fewer ports. Pipe points are not stored. The former format `version: 1`
is rejected with a notice (reset or rearrange in the editor); invalid entries are
reported with their error code.

The first scope covers systems with a fresh water module and without heat pump,
heating circuits, additional heat, solar, heaters, circulation, domestic water and
legionella display, i.e. the configurations the existing router already covers completely. For
other systems the editor offers no movable components. If a saved arrangement cannot
be drawn, the card shows the standard diagram with a short notice and keeps the saved
values.

Without `layout_editor_beta: true` a saved `layout` is ignored. Cards without the
option are drawn unchanged.

Local test without Home Assistant: serve the repository with
`python3 -m http.server 8000` and open
`http://localhost:8000/tests/helpers/layout-beta.html`. `?selftest=1` runs automated
pointer checks.
