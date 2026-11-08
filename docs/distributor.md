# Flexibler Heizkreisverteiler

Alternativ zu `heizkreise` kann die Karte einen Verteiler mit einer geordneten
Liste von Anschlüssen darstellen. Jeder Eintrag besitzt ein Vorlauf-/Rücklaufpaar.
Die Reihenfolge von links nach rechts entspricht exakt der YAML-Liste und bleibt
bei Sensorupdates unverändert. Ein vollständiges Beispiel mit ausschließlich
synthetischen Entity-IDs steht in [verteiler-beispiel.yaml](../verteiler-beispiel.yaml).

```yaml
type: custom:warmwasser-schema-card
verteiler:
  anschluesse:
    - { name: HK, typ: heizkoerper, richtung: oben }
    - { name: FBH, typ: fussboden, richtung: unten }
    - { name: Reserve, status: blind, richtung: oben }
```

| Feld pro Anschluss | Standard | Bedeutung |
| --- | --- | --- |
| `name` / `label` | Anschluss N / Blind | Name; `label` ist ein Alias, wenn `name` fehlt. |
| `typ` | `frei` | `heizkoerper`, `fussboden`, `warmwasser`, `frei`. |
| `status` | `aktiv` | `aktiv` oder `blind` (verschlossen). |
| `richtung` | `unten` | `oben` oder `unten`, unabhängig je Anschluss. |
| `pumpe` | keine | Entity-ID; `on` oder ein numerischer Wert > 0 aktiviert die Animation. |
| `vorlauf`, `ruecklauf` | keine | Entity-IDs für Temperaturen. |
| `wmz` | keine | Wärmemengenzähler; HA-Einheit, sonst kWh. |
| `symboltyp` | wie `typ` | Alternativ eines der vier Typsymbole oder `kein`. |
| `icon` | keines | HA-Icon wie `mdi:radiator`; hat Vorrang vor `symboltyp`. |

Mindestens ein Anschluss ist erforderlich. Die YAML-Liste hat keine feste
Sechsergrenze; 1–6, 8 und 12 Plätze werden getestet. Große Verteiler werden breiter
und in schmalen Karten entsprechend kleiner dargestellt. Lange Beschriftungen
werden in die Platzbreite eingepasst; der vollständige Name steht im SVG-Titel.

`aktiv` bezeichnet einen belegten Platz, nicht eine laufende Pumpe. Solche Plätze
bleiben auch ohne Entitäten sichtbar. Ohne laufende konfigurierte Pumpe gibt es
keine Fließanimation. Blindplätze zeigen zwei Verschlusskappen und ignorieren
gespeicherte Pumpen, Sensoren und Symbole bei der Darstellung. Zwischen ihren
geschlossenen Ports entsteht keine interne Verbindung.

`warmwasser` ist ein Warmwasser-Ladekreis auf der **Heizwasserseite**. Das Symbol
erzeugt weder einen Trinkwasseranschluss noch einen zusätzlichen Wärmetauscher.
Der Wärmemengenzähler zeigt einen Sensorwert; es wird keine Wärmebilanz berechnet.

## Kompatibilität und Umfang

Ohne `verteiler` bleiben Darstellung, Konfiguration und Mischer der bisherigen
`heizkreise` unverändert. `verteiler` und eine nicht leere `heizkreise`-Liste
werden mit einer ausdrücklichen Fehlermeldung abgelehnt. Zur Umstellung muss die
alte Liste entfernt werden; es gibt keine automatische Konvertierung.

Diese Erweiterung wird ausschließlich in YAML konfiguriert. Der bestehende
Editor zeigt einen Hinweis, bewahrt die Verteilerdaten beim Speichern anderer
Optionen und blendet die alte Heizkreisliste bei vorhandenem Verteiler aus.
Es gibt in diesem Schritt keine grafischen HKV-Bedienelemente und keine neuen
optionalen Mischer. Ein `mischer`-Feld am neuen Anschluss wird ausdrücklich
abgelehnt; die bestehenden Mischer unter `heizkreise` bleiben unterstützt.

Die vorhandenen Rohrlagen, Balken, Pumpensymbole und Animationen werden verwendet.
Kreuzungen erhalten Brücken und bilden keine zusätzlichen hydraulischen Abzweige.
Die optionale hydraulische Weiche bleibt verwendbar. Modellgeometrie hängt von
der Konfiguration ab, nicht von Sensorwerten. Die Freigabe des experimentellen
automatischen Routers wird nicht erweitert.

Geplante, getrennte Erweiterungen: grafischer HKV-Editor (PR 2), danach bei Bedarf
optionale Mischer (PR 3). Mehrere oder frei positionierbare Verteiler,
Speicheranschlussplanung und ein neues Routingmodell sind nicht Teil dieses Schritts.

## Prüfung

```sh
node --check warmwasser-schema-card.js
node --test tests/*.test.cjs
node tests/helpers/visual-compare.cjs
```

Die Browser-Vorschau liegt anschließend unter
`http://127.0.0.1:8765/distributor`. Sie verwendet ausschließlich synthetische
Daten und lokale HA-Stubs. Sie prüft SVG-Grenzen, Blindanschlüsse und
Sensorupdates; sie ersetzt keinen Test in einer echten Home-Assistant-Installation.
Die bisherigen Render-Fixtures werden unverändert geprüft.

## English

`verteiler.anschluesse` is a YAML-only alternative to `heizkreise`. List order is
the physical left-to-right order. Each slot has a supply/return pair pointing
`oben` (up) or `unten` (down); `status: blind` closes both ports. Active slots stay
visible without sensors. Flow is animated only with a configured running pump.
Types are radiators (`heizkoerper`), floor heating (`fussboden`), a hot-water
charging circuit on the heating-water side (`warmwasser`), and generic (`frei`).
| Field per slot | Default | Meaning |
| --- | --- | --- |
| `name` / `label` | Port N / Capped | Display name. `label` is an alias used when `name` is absent; `name` takes priority. The full name remains in the SVG title when fitted to the slot width. |
| `typ` | `frei` | Consumer type: `heizkoerper` (radiators), `fussboden` (floor heating), `warmwasser` (hot-water charging circuit), or `frei` (generic). All remain on the heating-water side. |
| `status` | `aktiv` | `aktiv` means an occupied slot, not a running pump. `blind` closes both ports and suppresses pump, sensor and consumer-symbol rendering without deleting the stored configuration. |
| `richtung` | `unten` | Branch direction: `oben` (up) or `unten` (down), independently for each slot. Does not change list order. |
| `pumpe` | none | Optional entity ID. State `on` or a numeric value greater than zero enables flow animation. Missing, unavailable or stopped pumps do not animate. |
| `vorlauf` | none | Optional supply-temperature entity ID; displayed in °C. Missing/unavailable readings display a dash. |
| `ruecklauf` | none | Optional return-temperature entity ID; displayed in °C. Missing/unavailable readings display a dash. |
| `wmz` | none | Optional heat-meter entity ID. Uses the HA unit, falling back to kWh; missing/unavailable readings display a dash. Displays a sensor value only, without calculating an energy balance. |
| `symboltyp` | same as `typ` | Visual override: `heizkoerper`, `fussboden`, `warmwasser`, `frei`, or `kein` (no symbol). Does not change hydraulic connections. |
| `icon` | none | Optional HA icon ID such as `mdi:radiator`. Overrides `symboltyp`; ignored for capped slots. |

Optional entity and icon fields may be omitted or left empty. Invalid types,
directions, statuses and entity/icon IDs produce an error naming the affected field.
At least one slot is required; there is no fixed six-slot YAML limit.
Legacy heating circuits and mixers are unchanged. A nonempty legacy list cannot
coexist with the new distributor; remove it explicitly when switching models.
The graphical HKV editor and optional new mixers are separate future changes.
A `mischer` field in the new distributor is currently rejected. The existing
editor preserves YAML distributor settings when saving other options.

Wide distributors scale down with the whole diagram in narrow cards. At 320 px,
especially with many slots, labels and readings can become too small to read
comfortably even when they do not overlap. This change does not add zoom, scrolling
or a responsive layout; those require a separate layout decision.
