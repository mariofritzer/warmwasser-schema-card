# Rohrführung / Pipe routing

## Deutsch

### Ziel und Basis

Dieser Schritt baut auf dem Komponentenmodell aus [PR #3](https://github.com/mariofritzer/warmwasser-schema-card/pull/3)
auf, konkret Commit `d993115e35798809e6643186ce4e3fa356500527`.
PR #3 und PR #4 sind inzwischen gemergt. Die WP/FM-Erweiterung ändert gezielt kanonische Primärpfade und deren Referenzausgaben.

Der PR ergänzt einen zentralen Routing-Kern und verwendet ihn tatsächlich für
Vorlauf und Rücklauf des Frischwassermoduls. Es gibt keine neue Nutzerkonfiguration,
keine öffentliche Layout-API und keinen visuellen Editor.

### Erste unterstützte Darstellung

Automatisches Routing wird aktiv, sobald der Ursprung des FM oder seines
zugehörigen Speichers intern von `baseOrigin` abweicht. Bei kanonischen Positionen gelten feste SVG-Zeichenrezepte; die WP/FM-Erweiterung ändert diese gezielt für getrennte Speicher mit FM und WP.

Die erste Freigabe gilt für `trennblech`, `schicht` und `getrennt` mit FM, ohne
WP, Heizkreise, Solar, Zusatzwärme, Zirkulation, Trinkwasseroptionen, Heizstäbe oder
Legionellenanzeige. Bei getrennten Speichern ist der zugehörige Speicher der
Warmwasserspeicher. Die bereits vorhandenen äußeren Kalt-/Warmwasserleitungen
bleiben feste Leitungen und werden als geschützte Flächen berücksichtigt.

Die statischen Schutzflächen erfordern begrenzte Texte: Hersteller höchstens
8 Zeichen, FM-Name höchstens 3 Zeichen, Sensorname und benutzerdefinierte
Trinkwasserbeschriftungen höchstens 20 Zeichen. Diese Grenzen betreffen nur das
interne automatische Routing; Standardkarten erhalten keine neue Einschränkung.

Eine aktive Routing-Anordnung außerhalb dieser Freigabe endet ausdrücklich mit
`unsupported`. Eine blockierte oder nicht sicher darstellbare Route endet mit
`failed`. Der Renderer wirft einen Fehler mit dem betreffenden Code, statt eine
Leitung still wegzulassen oder auf eine scheinbar passende Standardroute
zurückzufallen. Das ist keine allgemeine Validierung beliebiger Geometrieänderungen.

### Datenfluss und Geometrievertrag

1. `routeDiagramConnections(model, ids)` löst `from`, geordnete `via` und `to`
   einschließlich Medium, Richtung, Besitzer und semantischer Referenz auf.
2. Lokale `routingAreas` werden in SVG-Koordinaten aufgelöst. Sie sind eigene
   Schutzflächen und ersetzen nicht die Körper-/Referenzbox `bounds`.
   Im ersten Umfang werden Körper, Stutzen, Sensorflächen und feste Beschriftungen
   beziehungsweise Trinkwasserleitungen geschützt.
3. `routeOrthogonalConnection(request)` berechnet orthogonale Mittellinien.
   Der erste Vektor folgt der Austrittsrichtung, der letzte zeigt entgegen der
   Austrittsrichtung des Zielports. Nur die geraden Escape-Segmente dürfen den
   eigenen Körper und Stutzen verlassen; die übrige Suche berücksichtigt auch
   diese Hindernisse. Fremde Schutzflächen bleiben immer gesperrt.
4. `compilePipeRoutes(routes, options)` verarbeitet alle beteiligten Mittellinien
   gemeinsam. Es entstehen gerundete Ecken und deterministisch zugeordnete
   Kreuzungsbrücken. Der fertige SVG-Pfad wird unverändert für sämtliche Rohrlagen
   und die Animation verwendet.

Der Inflationsradius der Modellanbindung beträgt 13 SVG-Einheiten und enthält die
halbe maximale Rohrbreite (5) sowie Reserve für Rundungen (8). Die Suche hält
geordnete Pflichtpunkte fest; der Compiler erhält ihre Referenzidentität. Gleiche
Koordinaten erzeugen keine Verbindung. Ein tatsächlich gemeinsam referenzierter
Punkt erhält keine Kreuzungsbrücke.

Mehrlagige Rohrdarstellung und Animationen sind Darstellungen derselben Leitung.
Die Brücke ist ein Diagrammsymbol für getrennte Verbindungen, keine hydraulische
oder räumliche Berechnung einer realen Installation.

### Policies und Fehler

Jede Verbindung hat eine ausdrückliche Routing-Policy. Nur `external` wird an die
freie Suche übergeben. `internal-coil`, `pump-through`, `manifold-rail` und `fixed`
bleiben außerhalb dieses automatischen Render-Schnitts. Insbesondere werden
Wendeln und Pumpendurchgänge nicht nach außen umgeroutet.

Ergebnisse sind pro Connection-ID als `routed`, `unsupported` oder `failed`
unterscheidbar. Beispiele sind unbekannte Referenzen, widersprüchliche Medien,
fehlende Port-Richtung, blockierter Port, kein Weg, unbenannter Kontakt,
Rohrüberlappung oder eine nicht sicher darstellbare Rundung/Kreuzung. Es gibt keine
Garantie, jeden geometrisch möglichen Weg zu finden: die Prüfung ist konservativ
und kann eine Anordnung ablehnen, für die eine andere Suchstrategie einen Weg fände.

Die internen Funktionen sind keine öffentliche Erweiterungsschnittstelle.
`routeDiagramConnections` reserviert sein Optionsargument; nichtleere Optionen
werden derzeit abgewiesen. Der Suchkern und Compiler haben eigene explizite
Geometrieoptionen für isolierte Entwicklungstests.

### Prüfung und Folgeschritte

```sh
node --check warmwasser-schema-card.js
node --test tests/*.test.cjs
```

Golden-Szenarien werden weitergeprüft; betroffene Ausgaben wurden gezielt aktualisiert. Neue Tests
untersuchen unter anderem Tangenten, Owner-Escapes, Pflichtpunkt-Reihenfolge,
Abzweigidentität, Hüllenkollisionen, deterministische Kreuzungen, Statusmeldungen
und die tatsächliche Verwendung desselben Pfads in Rohrlagen und Animation.

Der lokale Browser-Harness unter `tests/helpers/routing-harness.html` zeigt
kanonische und intern verschobene FM-Anlagen sowie einen blockierten Port.
Ein HTTP-Server muss das Repository-Verzeichnis ausliefern; dann kann die Datei
über `/tests/helpers/routing-harness.html` geöffnet werden. Geometrieproben in
diesem Harness sind Entwicklerwerkzeuge und kein Produkt-Layouteditor.

Der vollständige Testlauf `node --test tests/*.test.cjs` besteht mit 535 Tests. Grenzen zu Brücken und offenen Enden beschreibt die WP/FM-Erweiterung.

Die [folgende WP/FM-Erweiterung](complex-pipe-routing.md) nimmt alle sieben
äußeren Primärleitungen gemeinsam auf. Die nachstehende Abgrenzung beschreibt
den ursprünglichen Umfang von PR #4.

Für WP/FM-Kombinationen muss mindestens die obere WP-Ladeleitung mit in denselben
Kreuzungsdurchlauf aufgenommen werden; ihre heutigen festen Brücken dürfen nicht
unabhängig stehen bleiben. Danach folgen weitere äußere Kreise, eigene Compiler
für Rails/Innenpfade, vollständigere Schutzflächen und erst anschließend eine
versionierte Layout-Konfiguration mit Editor. Eine Home-Assistant-Integration
und freie Anordnung aller Anlagenvarianten sind hier nicht zugesichert.

## English

### Goal and base

This step builds on the component model in [PR #3](https://github.com/mariofritzer/warmwasser-schema-card/pull/3),
specifically `d993115e35798809e6643186ce4e3fa356500527`. PRs #3 and #4 have merged. The heat-pump/FWM extension changes selected canonical primary paths and their reference output.

The PR adds a shared routing core and actually consumes it for the FWM supply and
return. It adds no user configuration, public layout API or visual editor.

### Initial supported rendering

Automatic routing activates when the FWM or its associated tank origin differs
internally from `baseOrigin`. Canonical positions use fixed SVG recipes; the heat-pump/FWM extension changes these for separate tanks with an FWM and heat pump.

Initial support covers `trennblech`, `schicht` and `getrennt` with an FWM, without
a heat pump, heating circuits, solar, additional heat, circulation, domestic-water
options, immersion heaters or legionella display. For separate tanks, the
associated tank is the hot-water tank. The existing external cold/hot-water pipes
remain fixed and are included as protected areas.

Static protection areas require bounded text: manufacturer up to 8 characters,
FWM name up to 3, sensor names and custom domestic-water labels up to 20. These
limits apply only to internal automatic routing; standard cards gain no new
configuration restriction.

Active routing outside this scope returns `unsupported`. Blocked or unsafe routes
return `failed`. The renderer throws an error carrying that code rather than
silently dropping a pipe or falling back to a plausible legacy route. This does
not generally validate arbitrary geometry changes.

### Data flow and geometry contract

1. `routeDiagramConnections(model, ids)` resolves `from`, ordered `via` and `to`,
   including medium, direction, owner and semantic reference identity.
2. Local `routingAreas` become SVG coordinates. They are explicit protection
   areas, not a reinterpretation of the reference/body `bounds`. The initial
   scope protects bodies, connectors, sensor areas, labels and fixed domestic
   pipes.
3. `routeOrthogonalConnection(request)` computes orthogonal centerlines. The
   initial vector follows the source's outward direction; the final vector
   opposes the target's outward direction. Only straight escape segments may
   leave the owner's body/connectors; the remaining search includes those
   obstacles as well. Other protection areas remain blocked throughout.
4. `compilePipeRoutes(routes, options)` processes the whole batch of centerlines,
   generating rounded corners and deterministically assigned crossing bridges.
   Exactly the same final SVG path feeds all pipe layers and flow animation.

The model adapter inflates obstacles by 13 SVG units, including the maximum
half pipe width (5) and corner allowance (8). Ordered mandatory points remain
represented, and the compiler receives their reference identity. Matching
coordinates do not establish a connection; a truly shared reference receives no
crossing bridge.

Pipe layers and animation represent the same connection. A bridge is a diagram
symbol separating connections, not a hydraulic or spatial calculation of real
plumbing.

### Policies and failures

Connections have explicit routing policies. Only `external` enters free routing;
`internal-coil`, `pump-through`, `manifold-rail` and `fixed` remain outside this
automatic rendering slice. Coils and pump passages are not rerouted outside their
equipment.

Each connection result is discriminated as `routed`, `unsupported` or `failed`.
Examples include unknown references, medium mismatch, missing port direction,
blocked escape, no route, unnamed contact, overlapping pipes or unsafe
corner/crossing geometry. The conservative implementation may reject an
arrangement for which another search strategy could find a route.

These internal functions are not a public extension API. The model adapter
reserves its options argument and currently rejects nonempty options. The search
and compiler have their own explicit geometry options for isolated tests.

### Verification and follow-up

```sh
node --check warmwasser-schema-card.js
node --test tests/*.test.cjs
```

Golden scenarios remain checked; affected outputs have targeted updates. New tests cover tangents,
owner escapes, mandatory-point order, junction identity, envelope collisions,
deterministic crossings, result statuses and actual reuse of compiled paths
across pipe layers and animation.

The local `tests/helpers/routing-harness.html` shows canonical and internally
moved FWM configurations, plus a blocked port. Serve the repository through an
HTTP server and open `/tests/helpers/routing-harness.html`. Geometry probes are
development tools, not a product layout editor.

The complete run `node --test tests/*.test.cjs` passes with 535 tests. The heat-pump/FWM extension documents bridge and endpoint limitations.

The [heat-pump/FWM follow-up](complex-pipe-routing.md) includes all seven external
primary connections together. The following boundary describes the original
scope of PR #4.

Heat-pump/FWM configurations must include at least the upper heat-pump charging
pipe in the same crossing pass; its existing fixed bridges cannot remain
independent. Later steps cover other external circuits, dedicated rail/internal
path compilers, more complete protection areas and then versioned layouts and an
editor. This PR does not promise Home Assistant integration validation or free
placement for all system variants.
