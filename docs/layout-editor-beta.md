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
Die Leitungen zwischen Speicher und Frischwassermodul werden automatisch geführt.
Eine Position wird nur übernommen, wenn sich keine Bauteile überlappen und ein freier
Rohrweg existiert; beim Ziehen bleibt das Bauteil sonst an der letzten gültigen
Position stehen.

Gespeichert werden Verschiebungen in SVG-Einheiten:

```yaml
layout:
  version: 1
  fm: { x: 40, y: 60 }        # Frischwassermodul, inklusive Legende
  warmwasser: { x: 0, y: 0 }  # nur bei getrennten Speichern
  puffer: { x: 150, y: 0 }    # nur bei getrennten Speichern
  speicher: { x: -40, y: 0 }  # beide Speicher bzw. der einzelne Speicher
```

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
redo and reset are available. Pipes between the tanks and the fresh water module are
routed automatically. A position is only accepted when no components overlap and a
clear pipe route exists; while dragging, the component otherwise stays at its last
valid position.

Offsets are saved in SVG units:

```yaml
layout:
  version: 1
  fm: { x: 40, y: 60 }        # fresh water module, including the legend
  warmwasser: { x: 0, y: 0 }  # separate tanks only
  puffer: { x: 150, y: 0 }    # separate tanks only
  speicher: { x: -40, y: 0 }  # both tanks, or the single tank
```

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
