# Gemeinsame WP/FM-Rohrführung / Shared heat-pump/FWM routing

## Deutsch

### Nächster abgegrenzter Schritt

Die Vorgänger [PR #3](https://github.com/mariofritzer/warmwasser-schema-card/pull/3) und [PR #4](https://github.com/mariofritzer/warmwasser-schema-card/pull/4) sind gemergt.

Ziel ist ein gemeinsamer Routing-Durchlauf für die sieben bereits modellierten
äußeren Leitungen einer Anlage mit Wärmepumpe und Frischwassermodul:

| Verbindungs-ID | Dargestellter Abschnitt |
| --- | --- |
| `fm-supply` | Speicher zum FM |
| `fm-return` | FM zum Speicher |
| `wp-upper-supply` | WP zum oberen Speicherbereich |
| `wp-upper-return` | Oberer Speicherbereich zum Umschaltventil |
| `wp-lower-supply` | WP zum unteren Speicherbereich |
| `wp-lower-return` | Unterer Speicherbereich zum Umschaltventil |
| `wp-valve-return` | Umschaltventil zur WP |

### Entscheidungen und Alternativen

Alle sieben Leitungen werden gemeinsam geprüft und kompiliert. Nur die obere
WP-Ladeleitung zusätzlich zum FM zu routen würde die übrigen festen WP-Leitungen
und deren Brücken als Sonderfälle zurücklassen. Ein vollständiger Primärbatch
hat einen klareren Geometrievertrag und erlaubt konsistente Kreuzungsbrücken.

Die Suche muss getrennte Leitungen voneinander freihalten. Eine geometrische
Ausweichregel darf deshalb keine zusätzliche semantische `via`-Referenz oder
hydraulische Verbindung erfinden. Tatsächliche gemeinsame Abzweige behalten
ihre ausdrückliche Modellidentität. WP/FM allein fügt keine äußeren T-Abzweige
hinzu; die bestehenden HK-Abzweige werden erst in einer späteren Stufe angebunden.

Die Installation bleibt eine einzelne JavaScript-Datei ohne Laufzeitabhängigkeiten
und ohne Build. Die Aktivierung bleibt auf interne Geometrieproben beschränkt;
dieser PR führt weder ein öffentliches `layout` noch einen visuellen Editor ein.
Kanonische Primärpfade für `getrennt` mit FM und WP ändern sich gezielt, um Kreuzungen von Ecken zu trennen.

Die Freigabe umfasst zunächst Luft-WP mit FM für `trennblech`, `schicht` und
`getrennt`. Heizkreise, WP-Quellenkreise, Zähler und weitere Zusatzoptionen bleiben
außerhalb dieser Stufe. Die folgenden Grenzen gelten ausschließlich für aktives
internes Routing und schränken normale Kartenkonfigurationen nicht ein.

### Aktivierung, Schutzflächen und Grenzen

Sobald FM, WP, Umschaltventil oder einer der zugehörigen Speicher intern von
`baseOrigin` abweicht, werden alle sieben Leitungen zusammen berechnet. Bei
getrennten Speichern gehören sowohl WW- als auch Pufferspeicher dazu. Eine
Teilanfrage an den Modelladapter wird mit `unsupported` / `incomplete-batch`
abgewiesen; sie könnte Kreuzungen mit einer ausgelassenen Leitung übersehen.

WP-Körper, WP-Stutzen und Umschaltventil erhalten eigene lokale `routingAreas`.
Die vorhandenen Speicher-, FM-, Sensor- und festen Trinkwasser-Schutzflächen
bleiben erhalten. Eigene Port-Escapes sind weiterhin nur auf dem ersten bzw.
letzten geraden Segment erlaubt. Alle sieben Verbindungen durchlaufen gemeinsam
den bestehenden Compiler; dessen endgültiger SVG-Pfad speist sämtliche Rohrlagen
und Strömungsanimationen. Bei aktiver Automatik werden auch die bisherigen festen
WP-Brücken vollständig durch die berechneten Pfade ersetzt.

Brückenzuordnung und SVG-Zeichenreihenfolge verwenden dieselbe Regel: Vorläufe
erhalten Vorrang vor Rückläufen und neutralen Verbindungen. Nur wenn beide
aufgelösten Anschlussrollen `supply` sind, gilt eine Verbindung hier als Vorlauf.
Fehlende oder widersprüchliche Rollen erhalten keinen Vorlaufvorrang; Farbe,
Temperatur, Verbindungsname und aktueller Betriebszustand spielen keine Rolle.
Bei gleicher Priorität erhält weiterhin die lexikografisch höhere ID die Brücke.

Der Compiler gibt die daraus folgende Zeichenreihenfolge vor. Das Rohr mit der
Brücke wird als vollständige Gruppe später gezeichnet, einschließlich Schatten,
Farbe, Glanz und Animation. Bei der gezeigten WP/FM-Anlage tragen dadurch beide
WP-Vorläufe die Brücken über die jeweils gekreuzten Rückläufe. Das ist eine
einheitliche Diagrammkonvention und keine Berechnung der räumlichen Rohrlage
einer realen Anlage. Andere feste Zeichenrezepte bleiben erhalten und können andere Brückenradien verwenden.

Die bestehende FM-Freigabe und deren Textgrenzen bleiben bestehen. Zusätzlich
gilt für die WP: Typ `luft`, kein `wmz`, `sg_ready`, `quelle_ein` oder
`quelle_aus`; `name_wp` höchstens 5 Zeichen und benutzerdefinierte Texte
`text_wp_an` / `text_wp_aus` höchstens 12 Zeichen. Damit bleiben Zählergeometrie,
unbegrenzte SG-Texte und die außerhalb des Geräts dargestellte Lufttemperatur
außerhalb dieses Schritts. Statusfarben und Animationen dürfen sich mit
Sensorwerten ändern, die berechnete Geometrie bleibt gleich.

Der Renderer prüft bei aktiver Automatik zusätzlich die tatsächlich formatierten
Displaytexte: FM-Temperatur bis 7 Zeichen, FM-Durchfluss einschließlich Einheit
bis 10, WP-Leistung bis 10, COP-Zeile bis 12, gemeinsame VL/RL-Zeile bis 20 und
dynamischer WP-Status bis 14 Zeichen. Die festen übersetzten Standardstatus
bleiben zulässig. Überlange Ausgaben liefern `label-overflow`, ohne Werte zu
kürzen oder neue Wege abhängig vom Messwert zu suchen. Diese Prüfung liegt im
Renderer, da der Geometrieadapter keine Sensorzustände kennt.

Die Suche plant jede Mittellinie weiterhin einzeln; der Compiler prüft sie danach
gemeinsam. Es gibt in diesem PR weder eine Konflikt-Neusuche noch eine Garantie,
jeden geometrisch möglichen Weg zu finden. Nachgewiesene Beispiele im
Entwickler-Harness sind FM-Versätze von `(+30,+15)` für `schicht` / `trennblech`
und `(+60,+15)` für `getrennt`, jeweils bei sonst kanonischen Ursprüngen und
Standardtrennung. `getrennt` mit `(+30,+15)` wird bewusst als `failed` /
`unnamed-contact` zurückgewiesen: zwei unabhängig gefundene Wege berühren oder
überlagern sich ohne gemeinsame Referenz. Es wird weder ein Abzweig erfunden
noch eine Leitung still auf ihren alten Pfad zurückgesetzt.

### Diagramm und reale Anlage

Eine Rohrbrücke kennzeichnet eine geometrische Kreuzung zweier getrennter
Diagrammverbindungen. Sie begründet weder einen hydraulischen Abzweig noch eine
räumliche Montagevorgabe. Die bestehende Zuordnung des FM-Rücklaufs bei getrennten
Speichern aus #2 bleibt erhalten und beschreibt die im Issue besprochene Anlage,
keine allgemeingültige Hydraulikregel. Ventilanschlüsse erhalten keine erfundene
innere Verbindung.

### Spätere Schritte

Echte HK-Abzweige benötigen eine Richtung je inzidenter Verbindung. Anschließend
folgen weitere äußere Kreise und deren Schutzflächen, Zähler mit gesichertem
geradem Einbauabschnitt sowie eigene Regeln für Verteilerrails und Innenpfade.
Eine versionierte Layout-Konfiguration, Speichern/Laden und Editorbedienung
bleiben eigene PRs. Die ViewBox folgt noch der Komponentengeometrie statt der
vollständigen Rohrhülle; bei anderen internen Versätzen ist ein kleiner Beschnitt
am Rand möglich. Auch das ist vor einer öffentlichen Layout-Freigabe zu lösen.
Eine Prüfung in einer echten Home-Assistant-Installation
bleibt zusätzlich zur lokalen Browserprüfung erforderlich.

### Prüfung und verbleibender Umfang

Tests prüfen die Speichertrennung 35–70 mit und ohne WP-Zähler und Heizstab sowie mitbewegte Trinkwasserenden. Ausgewählte Golden-Ausgaben ändern sich durch den kanonischen Fix. Der vollständige Lauf `node --test tests/*.test.cjs` besteht mit 535 Tests.

Trinkwasserenden, Pfeile und Beschriftungen sowie modellierte Zirkulationspumpe und Abzweige folgen dem FM. Aktives Routing einer verschobenen Anlage mit Zirkulation bleibt `unsupported`. Quellen- und Heizkreisenden sind nicht für Geräteverschiebung freigegeben. Der Compiler und die betroffenen festen Primärbrücken bei `getrennt` + FM + WP verwenden Radius 6. Andere feste Brücken, etwa bei Quelle und Heizkreisen, behalten andere Radien. Die Abstands- und Kollisionsregeln sind nicht global für alle festen Pfade umgesetzt.

## English

### Next bounded step

The predecessors [PR #3](https://github.com/mariofritzer/warmwasser-schema-card/pull/3) and [PR #4](https://github.com/mariofritzer/warmwasser-schema-card/pull/4) have merged.

The target is one shared routing pass for the seven existing external connections
of a heat-pump/FWM installation:

| Connection ID | Diagram section |
| --- | --- |
| `fm-supply` | Tank to FWM |
| `fm-return` | FWM to tank |
| `wp-upper-supply` | Heat pump to upper tank section |
| `wp-upper-return` | Upper tank section to diverter valve |
| `wp-lower-supply` | Heat pump to lower tank section |
| `wp-lower-return` | Lower tank section to diverter valve |
| `wp-valve-return` | Diverter valve to heat pump |

### Decisions and alternatives

All seven connections are checked and compiled together. Routing only the upper
charging pipe alongside the FWM would leave other fixed heat-pump pipes and
bridges as special cases. A complete primary batch provides a clearer geometry
contract and consistent crossing bridges.

The search must keep independent pipes separate. Geometric avoidance rules must
not invent semantic `via` references or hydraulic connections. Real shared
junctions retain their explicit model identity. The heat-pump/FWM combination
adds no external tees; existing heating-circuit junctions follow separately.

Installation remains one JavaScript file without runtime dependencies or a build.
Activation remains restricted to internal geometry probes; this PR adds neither
a public `layout` option nor a visual editor. Fixed primary paths for `getrennt` with an FWM and heat pump change to separate crossings from bends.

Initial scope covers air-source heat pumps with an FWM and `trennblech`, `schicht`
or `getrennt` tanks. Heating circuits, heat-pump source loops, meters and further
options remain outside this step. The following limits apply only to active
internal routing and do not restrict ordinary card configurations.

### Activation, protection areas and limits

Moving the FWM, heat pump, diverter valve or either associated tank away from its
internal `baseOrigin` triggers routing of all seven connections together. Both
the hot-water and buffer tank count for separate-tank systems. Partial model
adapter requests return `unsupported` / `incomplete-batch`, since they could miss
crossings with an omitted connection.

The heat-pump body, connectors and diverter valve gain explicit local
`routingAreas`. Existing tank, FWM, sensor and fixed domestic-water protection
areas remain in use. Owner escapes remain limited to the first and last straight
segments. All seven connections enter the existing compiler together; its final
SVG path feeds every pipe layer and flow animation. Active routing fully replaces
the existing fixed heat-pump bridges with computed paths.

Bridge ownership and SVG paint order use the same rule: supply connections take
precedence over return and neutral connections. A connection is considered supply
only when both resolved port roles are `supply`. Missing or conflicting roles gain
no supply priority. Colour, temperature, connection names and operating state do
not determine priority. The lexicographically higher ID owns the bridge when
priorities are equal.

The compiler provides the resulting paint order. The bridged pipe is painted
later as a complete group, including its shadow, colour, highlights and animation.
Both heat-pump supply pipes therefore own their bridges over the crossing returns
in the shown heat-pump/FWM example. This is a consistent diagram convention, not
a calculation of actual three-dimensional pipe placement. Fixed canonical drawing
recipes remain in place and may use other bridge radii.

Existing FWM eligibility and text limits remain. Additional heat-pump requirements:
type `luft`, no `wmz`, `sg_ready`, `quelle_ein` or `quelle_aus`; `name_wp` up to
5 characters and custom `text_wp_an` / `text_wp_aus` up to 12 characters. This
keeps meter geometry, unbounded SG text and the external air-temperature label
outside this step. Sensor values may change colours and animation, but not routed
geometry.

During active routing the renderer also checks the actual formatted display
strings: FWM temperature up to 7 characters, FWM flow including its unit up to 10,
heat-pump power up to 10, COP line up to 12, combined flow/return temperatures
up to 20, and dynamic heat-pump status up to 14 characters. Fixed translated
standard statuses remain allowed. Longer output produces `label-overflow`,
without truncating values or making paths depend on sensor values. This check
belongs to the renderer because the geometry adapter has no sensor state.

The search still plans centerlines individually, then validates them together in
the compiler. This PR adds no conflict rerouting and does not guarantee finding
every geometrically possible route. Proven developer-harness examples move the
FWM by `(+30,+15)` for `schicht` / `trennblech` and `(+60,+15)` for `getrennt`,
with other origins canonical and default tank separation. The `getrennt`
`(+30,+15)` example deliberately returns `failed` / `unnamed-contact`: independent
searches produce touching or overlapping paths without a shared reference. No
junction is invented and no pipe silently reverts to its fixed legacy path.

### Diagram versus actual installation

A bridge marks a geometric crossing of separate diagram connections. It implies
neither a hydraulic junction nor a physical mounting requirement. The separate-tank
FWM return from #2 retains the installation-specific topology discussed in the
issue; it is not a universal hydraulic rule. No internal valve plumbing is invented.

### Later work

Real heating-circuit junctions need a direction for each incident connection.
Further external loops and protection areas, meters with guaranteed straight
mounting sections, and dedicated rules for manifold rails and internal paths
follow separately. Versioned layout configuration, persistence and editor
interaction remain separate PRs. Testing in a real Home Assistant installation
is still required in addition to local browser checks. The ViewBox still follows
component geometry rather than the full pipe envelope; other internal offsets may
slightly clip pipes at the edge. This must also be addressed before public layout
support.

### Verification and remaining scope

Tests cover tank separations 35–70 with and without a heat meter and immersion heater, and moving domestic-water ends. Selected golden outputs change with the canonical fix. The complete run `node --test tests/*.test.cjs` passes with 535 tests.

Domestic-water ends, arrows and labels, and modeled circulation tees and pump follow the FWM. Active routing of a moved installation with circulation remains `unsupported`. Source and heating-circuit endpoints are not approved for equipment movement. The compiler and affected fixed primary bridges in `getrennt` + FWM + heat-pump configurations use radius 6. Other fixed bridges, including source and heating circuits, retain other radii. Clearance and collision rules are not globally implemented for every fixed path.
