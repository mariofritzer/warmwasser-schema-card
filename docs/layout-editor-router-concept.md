# Layout-Editor und vollständiges Routing / Layout editor and complete routing

## Deutsch

### Ziel und Ausgangslage

Dieses Dokument ist ein technischer Vorschlag, keine Zusage, dass beliebige
Anordnungen routbar sind. Es baut auf dem vorhandenen Diagrammmodell und den
Dokumenten [Rohrführung](pipe-routing.md) und
[WP/FM-Routing](complex-pipe-routing.md) auf. Heute sind nur begrenzte FM- und
Luft-WP-Konfigurationen bei interner Verschiebung für automatisches Routing
freigegeben. Der aktuelle Router sucht einzelne Wege und prüft sie gemeinsam;
Schutzflächen und ViewBox decken noch nicht alle Varianten ab.

Ziel ist ein visueller Editor für Komponentenpositionen und Anschlussseiten mit
zuverlässiger Darstellung aller bereits unterstützten Anlagenvarianten. Die Karte
bleibt eine JavaScript-Datei ohne Build und Laufzeitabhängigkeiten. Ohne `layout`
bleiben Konfiguration, vorhandene Zeichenrezepte und Ausgabe unverändert. Eine
Layout-Konfiguration aktiviert einen getrennten, ausdrücklich validierten Pfad;
kein stiller Rückfall auf alte Rohrwege bei Fehlern.

### Modell und unveränderte Semantik

Das normalisierte Anlagenmodell bleibt maßgeblich für Komponenten, benannte Ports,
Medien, `from`/`to`, geordnete echte `via`-Junctions und Verbindungsidentitäten.
Das Layout enthält ausschließlich Darstellungsentscheidungen. Es darf weder
Verbindungen hinzufügen oder entfernen noch Medien, Richtung des Stoffflusses,
Ventilinneres oder reale Hydraulik ableiten. Gleiche Koordinaten erzeugen keinen
Abzweig; nur dieselbe explizite Junction-Referenz verbindet Abschnitte. Eine
Kreuzungsbrücke bezeichnet getrennte Diagrammlinien. Pumpendurchgänge, Wendel,
Wärmetauscher und interne Symbole bleiben an ihre Besitzer gebunden. `via` kann `meter`, `endpoint` oder `tee` referenzieren; das sichtbare Symbol
folgt explizitem Typ und tatsächlichem Inzidenzgrad, nicht allein der Verwendung
als Zwischenpunkt. Abzweige benötigen pro inzidentem Abschnitt eine geometrische
Austrittsrichtung. Junction-Geometrie wird derzeit aus dem Modell abgeleitet;
Junction-Drag gehört nicht zur ersten Editorversion. Eine
Bewegung des Besitzers verschiebt abhängige Elemente mit; ein Kind darf nicht
zusätzlich unabhängig verschoben werden, solange seine Ankerbindung gilt.

**Vorschlag:** Ein aufgelöstes Layout ist ein temporärer Ableger des Modells:
Positionen, Portgeometrie, Schutzflächen und geroutete Pfade werden daraus
berechnet, ohne das semantische Modell zu verändern. Bei Layoutänderung wird ein neues Geometriemodell mit seinen Parent-Gettern
aufgebaut; Sensorupdates dürfen es wiederverwenden. Der Routing-Key umfasst alle
Geometrieeingaben einschließlich statischer Beschriftungen. Das Layout-Intent wird von der Entity-Ermittlung in
`collect()` ausgenommen; Routing wird nur bei Topologie- oder Layoutänderung
neu bestimmt, nicht bei Sensorzuständen. Absolute SVG-Koordinaten gelten für frei bewegliche
Wurzelkomponenten; gebundene Kinder behalten elternlokale Koordinaten. Ein
Seitenwechsel ändert diese Beziehung nicht. Portseite, Medium und
supply/return-Rolle sind getrennte Eigenschaften. Bounds sind keine vollständigen
Kollisionsflächen; Texte, Stutzen, Dekorationen, Leitungsbreite, Ecken, Brücken
und Animationen brauchen explizite Hüllen. Sensorwerte dürfen keine Wege ändern;
dynamische Texte brauchen eine stabile, ausreichend große Hülle oder einen klaren
Fehler bei Überlauf. Die ViewBox umfasst die gesamte sichtbare Hülle.

### Anschlussseiten und Bedienung

Jeder Port erhält eine explizite Menge geometrisch zulässiger Seiten und seine
kanonische Seite; sie wird aus Symbol und gezeichnetem Anschluss abgeleitet, nicht
aus einer hydraulischen Vermutung. Zunächst sind nur nachweislich umsetzbare
Seiten freizugeben; fest gezeichnete Geräteanschlüsse, interne Ports und
Wendeln können genau eine Seite haben. Seitenwechsel muss Anker, Stutzen,
Schutzfläche und Austrittsrichtung gemeinsam aktualisieren. Ein Port ohne belegte
alternative Geometrie bleibt fest. Zulässige und unzulässige Seiten werden pro Komponententyp
und Port dokumentiert und für jede Variante getestet, einschließlich Varianten,
die den Port nicht besitzen. Keine pauschale Freigabe aller vier Seiten. Gleichzeitig gewählte Portseiten
einer Komponente sind zusammen auf Konflikte und erforderliche Abstände zu prüfen.

Bei aktivem gültigem Layout ist `auto` die Standardwahl; ohne `layout` bleiben
die kanonischen Anschlussseiten unverändert. **Vorschlag:** Auto wählt deterministisch aus der zulässigen Menge anhand einer
festen Bewertungsregel und stabiler Tie-Breaks; `manual` speichert eine konkrete
zulässige Seite. Auto darf nie eine unzulässige Seite erfinden. Wenn keine Seite
bzw. kein sicherer Weg funktioniert, wird ein Fehler angezeigt. Der Editor zeigt
für jeden Port nur erlaubte Seiten, die aktuelle Wahl und bei Auto das berechnete
Ergebnis. Bewertungsregel und Tie-Breaks bleiben vor der Freigabe festzulegen.

Beweglich sind zunächst explizit freigegebene Wurzelkomponenten mit vollständigen
Schutzflächen und nachgewiesener Routbarkeit; gebundene Kinder, Innengeometrie,
Junctions und externe Grenzen bleiben besitzergebunden oder fest. Die konkrete
Freigabeliste ist pro Variante im jeweiligen Implementierungs-PR festzulegen.
Jede Variante benötigt mindestens einen positiven, über den Editor ausgeführten
Bewegungs- und Reload-Nachweis; reine Fehlerabdeckung genügt nicht.

Drag mit Maus/Touch und eine Tastaturbedienung ändern dieselben Modellkoordinaten;
Auswahl, Fokus, Beschriftung, Abbrechen, Rückgängig/Wiederholen und Zurücksetzen
müssen zugänglich sein. Die Vorschau arbeitet mit einem Entwurf; erst eine gültige
Übernahme löst das übliche Home-Assistant-`config-changed` aus. Ungültige Entwürfe
bleiben sichtbar und korrigierbar, ohne eine scheinbar vollständige Karte zu
speichern. Formularänderungen werden gegen den bestehenden Layout-Entwurf erneut validiert;
kein Entwurfseintrag geht still verloren. Drag-Berechnungen werden gedrosselt und
mit begrenztem Budget ausgeführt; veraltete Ergebnisse früherer Positionen werden
verworfen. Bestehende Konfigurationsfelder und Sprachwahl bleiben erhalten.

### Router für alle dargestellten Varianten

1. Vollständigen Graphen und alle Hindernisse aus der aktiven Konfiguration
   auflösen, einschließlich externer Grenzen, Anhänge, Textbereiche und fester
   Leitungen. Ein vollständiger Batch muss alle möglicherweise interagierenden
   Leitungen berücksichtigen; Teilbatches dürfen Kreuzungen nicht übersehen.
2. Externe Abschnitte orthogonal mit Port-Escapes, zulässigen Seiten und echten
   Junction-Inzidenzen suchen. Feste Innenpfade, Pumpendurchgänge, Wendel und
   Verteilerrails brauchen eigene eigentümergebundene Regeln statt generischer
   freier Neuverlegung. Messstellen benötigen einen ausreichend langen geraden
   Einbauabschnitt. Wege dürfen fremde Schutzflächen nicht schneiden.
3. Konflikte zwischen Wegen prüfen und bei Bedarf deterministisch erneut suchen;
   Suchbudget und Reihenfolge müssen begrenzt und reproduzierbar sein. Kann kein
   sicherer Weg gefunden werden, ist ein explizites Scheitern zulässig, auch wenn
   theoretisch ein anderer Weg existiert. Suchbudget-Erschöpfung erhält einen
   eigenen Fehlercode und wird nicht als geometrisch unmöglich ausgegeben.
4. Wege batchweise kompilieren: identitätsbewusste Junctions, zulässige Kreuzungen,
   Brücken, Ecken und Zeichenreihenfolge prüfen. Rohrlagen und Animation verwenden dieselben endgültigen kompilierten Segmente;
   Animationen zeigen jeweils nur ihre aktivierten Teilstrecken. Keine Überlagerung oder Berührung ohne
   gemeinsame semantische Referenz als Abzweig interpretieren.

Die Abdeckung umfasst alle fünf Speichertypen einschließlich `getrennt`, FM,
WP einschließlich dargestellter Quellenkreise und Ventil, Heizkreise mit
Verteiler, Mischer, Pumpe und Weiche, Solar, alle Zusatzwärmetypen, Trinkwasser,
Zirkulation, Sensoren, Heizstäbe, Zähler und ihre bestehenden Kombinationen.
Die Variantenmatrix folgt dem aktuellen Upstream-Kartenmodell; experimentelle
Topologieoptionen des Prototyps gehören nur bei ausdrücklicher Aufnahme dazu.
Nicht gezeichnete Leitungen werden nicht ergänzt. Vorrang haben korrekte
Topologie und sichere Darstellung vor optimal kurzer Leitung oder freier
Platzierbarkeit. Akzeptierte Grenze: Manche Anordnungen werden auch nach
vollständiger Variantenabdeckung mit einem erklärten Fehler abgelehnt.

### Persistenz, IDs und Kompatibilität

**Vorschlag für ein versioniertes Format** (Koordinaten in SVG-Einheiten):

```yaml
layout:
  version: 2
  components:
    fm: { x: 500, y: 80 }
  ports:
    fm.supply: { mode: manual, side: left }
    fm.return: { mode: auto }
```

Das Beispiel illustriert ein mögliches V2-Format, keine bereits freigegebenen
Portnamen oder Seiten. Der alte Prototyp verwendete ein inkompatibles Layout V1.
V1 wird mit einer verständlichen Meldung abgelehnt; es gibt keine Migration und
keine stille Umdeutung oder Verwerfung. Nur Abweichungen speichern; fehlende
Einträge verwenden die kanonische Position bzw. für Anschlussseiten `auto`. Keine generierten Rohrpunkte persistieren:
Reload berechnet deterministisch neu. Falls manuelle Wegpunkte später benötigt
werden, brauchen sie einen eigenen versionierten Vertrag und dürfen keine
semantischen Junctions vortäuschen. YAML und visueller Editor müssen dasselbe
Format roundtrippen. Unbekannte Versionen, ungültige Zahlen/Seiten und ungültige
Einträge melden einen verständlichen Fehler; keine stillschweigende Verwerfung.

Stabile öffentliche IDs müssen vor Freigabe als eigener Vertrag festgelegt werden.
Derzeitige interne IDs, insbesondere indexbasierte Heizkreis- und Sensor-IDs,
sind nicht automatisch stabil beim Einfügen oder Umordnen. Heizkreise und Fühler
erhalten stabile eindeutige IDs: Der Editor vergibt eine fehlende ID erst bei
der ersten gültig übernommenen Bewegung eines dafür freigegebenen Elements.
Manuell in YAML gesetzte IDs bleiben erhalten. Namen, Entities und Listenindizes
dienen nicht als dauerhafte Identität. Die genaue ID-Syntax, das Verhalten bei
fehlender, doppelter oder entfernter ID und der Umgang mit bestehenden Listen
außerhalb dieses Vorgangs bleiben festzulegen. Verwaiste Layout-Einträge sichtbar melden und gezielt entfernen
lassen; sie dürfen nicht unbemerkt auf ein anderes Element zeigen. Änderungen
am semantischen Anlagenmodell invalidieren den Entwurf und lösen erneute
Validierung aus. Speicherung erfolgt ausschließlich in der Kartenkonfiguration,
nicht in Browser-LocalStorage; die vorhandene Home-Assistant-Speicherung bleibt
maßgeblich.

### Fehler und gestufte Lieferung

Fehler sind strukturiert und lokalisierbar: unbekannte Version/ID, doppelte ID,
ungültige Position oder Seite, fehlender Anschluss, Medienkonflikt, nicht
unterstützte Geometrie, blockierter Port, kein Weg, Kollision/ungewollter
Kontakt, unsichere Brücke und Textüberlauf. Die UI nennt betroffene Komponenten
und Verbindungen, markiert sie in der Vorschau und bietet Korrektur oder
Zurücksetzen an. Bei einem Fehler darf weder ein teilweise gerendertes Diagramm noch ein alter
Weg als gültig dargestellt werden. Bei bereits gespeichertem ungültigem Layout zeigt die Karte das vollständige
kanonische Standardbild aus derselben Anlagenkonfiguration und den aktuellen
Sensordaten, vollständig ohne Layout-Overrides, und zeigt einen deutlichen
Fehlerhinweis. Die Rohkonfiguration und ihre IDs bleiben unverändert; der
Fehlerzustand löst kein `config-changed` aus und ermöglicht die Korrektur. Das Verhalten bei dynamischem Textüberlauf bleibt festzulegen. Ein
Mischbild aus altem und neuem Layout ist unzulässig. Modell, Pfade und Anzeige
werden atomar übernommen; `_key` wird erst nach erfolgreichem Commit aktualisiert,
damit ein Fehlversuch eine spätere erneute Darstellung nicht verhindert.

Vorgeschlagene, unabhängig prüfbare PRs:

1. Schutzflächen, vollständige sichtbare Hülle, explizite Portseitenverträge und
   stabile Identitätsstrategie; noch kein öffentliches Layout.
2. Router und Compiler schrittweise für alle obigen Kreise und Kombinationen,
   inklusive Konfliktsuche und eindeutiger Fehler; weiterhin interne Aktivierung.
3. Versionierte Konfiguration, Validierung, V1-Ablehnung und ID-Regeln und deterministische
   Wiederherstellung; keine Änderung ohne `layout`.
4. Editor mit Vorschau, Auto/manuell, zugänglicher Bedienung und Home-Assistant-
   Integration; abschließende Dokumentation und echte HA-Prüfung.

Jede Stufe erhält Syntaxprüfung und `node --test tests/*.test.cjs`. Zusätzlich:
Referenzausgaben ohne Layout; Graph-/Medien-/Inzidenz-Invarianten vor und nach
Verschiebung und Seitenwechsel; jeden zulässigen und unzulässigen Port pro Typ;
Varianten- und Kombinationsmatrix, Hindernisse, Kreuzungen, Junction-Identität,
Meter, Textüberlauf und ViewBox; deterministische Wiederholung und begrenzte
Fehlerfälle; Auto-Standard, V1-Ablehnung und kanonisches Fehlerbild; ID-Vergabe
bei der ersten gültig übernommenen Bewegung, Erhalt manueller IDs, Speichern/Laden,
Reordering und verwaiste IDs; ungültiges Layout mit teilweise gültigem Override
zeigt ausschließlich das kanonische Gesamtbild und löst kein `config-changed` aus; Editor-Interaktion
mit Maus, Touch und Tastatur, Undo/Cancel, DE/EN sowie Home Assistant. Browser-
Harnesses ersetzen keine echte HA-Prüfung. Bestehende Golden-Fixtures ohne Layout
dürfen nicht pauschal aktualisiert werden, um Regressionen zu verdecken.

## English

### Goal and current boundary

This is a technical proposal, not a guarantee that every arrangement can be
routed. It builds on the existing diagram model and the [routing](pipe-routing.md)
and [heat-pump/FWM](complex-pipe-routing.md) documents. Active routing currently
covers only limited internally moved FWM and air-source heat-pump configurations;
individual searches are checked together, and obstacle areas and the viewBox do
not yet cover every variant.

The goal is a visual editor for component positions and port sides with reliable
rendering of all existing installation variants. Distribution remains one JavaScript
file, without a build or runtime dependencies. Without `layout`, configuration,
existing drawing recipes and output remain unchanged. A layout activates a separate
validated path; errors must never silently fall back to old pipe routes.

### Model, ports and editor

The normalized installation model remains authoritative for components, named
ports, media, `from`/`to`, ordered real `via` junctions and connection identities.
Layout controls presentation only: it cannot add or remove connections or infer
fluid flow, internal valve plumbing or real hydraulics. Coincident coordinates do
not connect paths; only the same explicit junction reference does. Bridges denote
separate diagram lines. Internal coils, pump passages, exchangers and symbols stay
bound to their owners. `via` can reference `meter`, `endpoint` or `tee`; its visible symbol follows
the explicit type and actual incidence degree, not merely its presence as an
intermediate point. Each incident section at a junction needs its own geometric
direction. Junction geometry is currently derived from the model; junction dragging
is outside the first editor version. Attached children follow their owner unless an explicit independent
placement contract is introduced.

**Proposal:** resolve a temporary layout view of the semantic model. Position,
port geometry, exclusion areas and routes are derived without mutating graph
semantics. Build a new geometry model with its parent getters when layout changes; sensor
updates may reuse it. The routing key covers every geometry input, including static
labels. Exclude layout intent from `collect()` entity
discovery; recompute routes only when topology or layout changes, not on sensor
state updates. Free root components use absolute SVG coordinates;
attached children retain parent-local coordinates. A side change does not alter
that relationship. Port side, medium and supply/return role are separate. Body bounds are
not collision envelopes: include stubs, text, decorations, pipe width, corners,
bridges and animation explicitly. Sensor values must not change routes; reserve a
stable text envelope or report overflow. The viewBox includes all visible extents.

Each port has an explicit allowed-side set and canonical side derived from its
actual symbol and drawn connector, never assumed hydraulics. Initially expose only
proven sides; a fixed or internal port may have exactly one. Changing sides updates
anchor, stub, exclusion area and escape direction together. Document and test allowed and forbidden sides per component type and port, including variants where a port is absent; do not
blanket-enable all four sides. Validate simultaneously selected sides on a
component together for conflicts and required spacing.

With an active valid layout, `auto` is the default; without `layout`, canonical
port sides remain unchanged. **Proposal:** Auto deterministically selects from allowed sides using a fixed
score and stable tie-breaks; `manual` stores one allowed side. Failure to find a
valid side or route is explicit. Show only valid choices and the resolved auto
result. The scoring and tie-break rules remain to be determined before release. Initially only explicitly approved root components with complete protection areas
and proven routes are movable; attached children, internal geometry, junctions and
external boundaries remain owner-bound or fixed. Each implementation PR defines
the precise approved set per variant. Every variant needs at least one successful
editor move and reload demonstration; failure tests alone are insufficient.
Mouse/touch drag and keyboard controls edit the same coordinates; provide
selection, focus, labels, cancel, undo/redo and reset. Preview a draft and emit the
normal Home Assistant `config-changed` only on valid apply. Invalid drafts remain
visible and correctable. Revalidate ordinary form changes against the existing
layout draft without silently losing entries. Throttle drag calculations, bound
their work and discard stale results for earlier positions. Preserve existing
fields and language selection.

### Complete routing and accepted limits

Resolve the complete active graph and obstacles, including boundaries, attachments,
text and fixed paths. A batch must contain every interacting line. Route external
sections orthogonally with valid escapes, port sides and real junction incidence;
use owner-bound rules for internal paths, pump passages, coils and manifold rails.
Meters require a sufficiently long straight segment. Check conflicts and retry
deterministically within a bounded search budget. Report budget exhaustion with
a distinct code rather than claiming the geometry is impossible. Compile the batch together,
validating junction identity, crossings, bridges, corners and paint order. All pipe layers and animations use the same final compiled segments; each animation
shows only its activated subsections. Unnamed contact or overlap
must not become a junction. A safe explicit failure is acceptable even where some
other theoretical route exists.

Cover all five tank types including `getrennt` (separate tanks); FWM; heat pump including displayed
source loops and valve; heating circuits, manifolds, mixers, pumps and separator;
solar; all additional heat types; domestic water; circulation; sensors, immersion
heaters and meters, including existing combinations. The variant matrix follows the current upstream card model; experimental
prototype topology options enter scope only when explicitly included. Do not invent
undrawn pipes.
Correct topology and safe rendering take priority over shortest routes and
arbitrary placement. Some arrangements may remain explicitly unroutable even
when all variants are covered.

### Persistence, identity and errors

The YAML example above illustrates a possible V2 configuration in SVG units; it
does not assert that the example port names or sides are already public. The old
prototype used an incompatible layout V1. Reject V1 with a clear message; do not
migrate, silently reinterpret or discard it. Store only overrides, using canonical
positions and `auto` for port sides when absent.
Recompute paths deterministically on reload rather than storing generated points.
Future manual waypoints need a separately versioned contract and cannot masquerade
as semantic junctions. YAML and the visual editor round-trip the same format.
Reject unknown versions and invalid numbers, sides or entries with clear errors.

Public stable IDs need an explicit contract before release. Existing internal IDs,
especially index-based heating-circuit and sensor IDs, are not stable across list
insertion or reordering. Heating circuits and sensors get stable unique IDs: the
editor assigns a missing ID only when the first valid move of an approved element
is applied. Manually supplied YAML IDs are preserved.
Never use name, entity or list index as persistent identity. Exact ID syntax,
handling missing, duplicate or removed IDs, and treatment of existing lists outside
that operation remain open decisions. Surface orphaned
layout entries for deliberate removal; never silently attach them to another item.
Changes to the installation invalidate and revalidate the draft. Store only in the
card configuration, using Home Assistant's existing persistence, not localStorage.

Use structured, localized errors for unknown version/ID, duplicate ID, invalid
position or side, missing port, media mismatch, unsupported geometry, blocked
escape, no route, collision/unnamed contact, unsafe bridge and text overflow. Name
and highlight affected items and offer correction or reset. Never present a partially rendered diagram or an old route as valid. For an invalid saved layout, show the complete canonical default diagram with a
prominent error notice and allow correction. Build the entire diagram from the
same installation configuration and current sensor data, without any layout
overrides. Preserve the raw configuration and IDs and emit no `config-changed`
for this error state. Handling dynamic text overflow remains
to be decided. Never mix old and new layout output. Commit model, paths and display atomically;
update `_key` only after successful commit so failure cannot suppress a retry.

### Delivery and verification

Proposed independently reviewable PRs: (1) complete obstacle/visible envelopes,
explicit per-port side contracts and stable identity strategy, without public
layout; (2) router/compiler support for all circuits and combinations, bounded
conflict retries and explicit errors, still internally activated; (3) versioned
configuration, validation, V1 rejection and ID rules and deterministic reload, preserving
output without `layout`; (4) accessible editor with preview, auto/manual control,
Home Assistant integration and documentation.

Each stage runs syntax validation and `node --test tests/*.test.cjs`. Add unchanged
no-layout golden output, graph/media/incidence invariants after moves and side
changes, allowed and forbidden sides for every port, variant/combination matrices,
obstacles, crossings, junction identity, meters, text overflow and viewBox tests;
determinism and bounded failure tests; default auto, V1 rejection and canonical
error fallback; ID assignment on the first valid applied move, preservation of
manual IDs, save/reload, reorder and orphan-ID tests; an invalid layout with some
valid overrides must show only the complete canonical diagram without emitting
`config-changed`;
and mouse, touch, keyboard, undo/cancel, DE/EN and Home Assistant interaction.
Browser harnesses do not replace testing in a real HA installation. Do not bulk
update no-layout golden fixtures to conceal regressions.
