# SVG-Textmessung: lokaler Browsertest / local browser smoke test

**DE:** `text-measurement.html` aus diesem Verzeichnis in einem aktuellen Browser öffnen und **Run tests / Tests ausführen** wählen. Das Ergebnis muss mit **PASS** beginnen. Die Seite lädt die lokale Kartendatei und prüft echte SVG-Textmessung nach `document.fonts.ready`, Transformation und Stroke, Shadow DOM, Theme-Wechsel, Überlauf sowie ungültige und versteckte Zustände. Bei **FAIL** steht die erste fehlgeschlagene Prüfung in der Ausgabe. Die Seite aktiviert kein Routing und sendet keine Daten.

**EN:** Open `text-measurement.html` from this directory in a modern browser and select **Run tests / Tests ausführen**. The result should begin with **PASS**. The page loads the local card file and checks real SVG text measurement after `document.fonts.ready`, transforms and stroke, Shadow DOM, theme changes, overflow, and invalid or hidden states. On **FAIL**, the output identifies the first failed check. The page does not enable routing or send data.

This smoke test covers the internal measurement helper only; it does not establish complete text inventory, live staging, paint ordering, or safe editor routing.
