// Deutsch ist zugleich der Schlüssel. Das spart hundert erfundene Key-Namen,
// das Zurückschalten ist trivial, und eine fehlende Übersetzung lässt den
// deutschen Text stehen, statt einen Platzhalter zu zeigen.
export const EN: Record<string, string> = {
  // Tastatur
  'Tastatur':'Keyboard', 'Leertaste':'Space', 'Umschalt':'Shift',
  'halten zum Sprechen':'hold to talk', 'laufenden Turn abbrechen':'interrupt the running turn',
  'Freihändig an und aus':'toggle hands-free', 'Aktivitätsspur':'activity trail',
  'neue Session':'new session', 'Seitenleiste ein und aus':'toggle sidebar',
  'Werkzeug-Modus wechseln':'cycle tool mode', 'diese Übersicht':'this overview',
  'Irgendwo klicken schließt.':'Click anywhere to close.',
  // Seitenleiste
  'Einstellungen':'Settings', 'Sprachausgabe':'Speech output', 'Stimme':'Voice',
  'Modell':'Model', 'wie konfiguriert':'as configured', 'Denktiefe':'Thinking depth',
  'Sprache':'Language',
  '. Neue Session gestartet, weil die Antwortsprache am Systemprompt hängt.':
    '. Started a new session, because the reply language is part of the system prompt.',
  '. Neue Session gestartet, dieser Modus geht nur beim Start.':
    '. Started a new session, this mode can only be set at launch.',
  '. Gilt ab der nächsten Session.':'. Takes effect with the next session.',
  '. Neue Session gestartet, weil die Stufe beim Start gesetzt wird.':
    '. Started a new session, because the level is set at launch.', 'Deutsch':'German', 'English':'English',
  'automatisch erkennen':'detect automatically',
  'Werkzeugzeilen im Verlauf':'Tool lines in the transcript',
  'Befehle vollständig zeigen':'Show commands in full',
  'Werkzeuge':'Tools', 'fragt nach':'asks first', 'Edits ohne Rückfrage':'edits without asking',
  'nur planen':'plan only', 'Modell entscheidet':'model decides',
  'nur Vorgenehmigtes':'pre-approved only', 'ohne jede Rückfrage':'never ask',
  'Darstellung':'Appearance', 'Design':'Theme', 'wie das System':'match the system',
  'hell':'light', 'dunkel':'dark', 'Akzent':'Accent', 'Schriftgröße':'Text size',
  'Dichte':'Density', 'luftig':'airy', 'normal':'normal', 'kompakt':'compact',
  'Ecken':'Corners', 'weich':'soft', 'kantig':'sharp',
  'Bewegung reduzieren':'Reduce motion', 'Hintergrundschimmer aus':'No background glow',
  'Antworten stumm':'Mute replies', 'Sprechtempo':'Speaking rate',
  'MCP-Server':'MCP servers', 'Unteragenten':'Subagents', 'Verlauf':'History',
  'aktualisieren':'refresh', 'Neu laden':'Reload',
  // Kopfzeile und Statusleiste
  'Neue Session':'New session', 'Freihändig':'Hands-free', 'Aktivität':'Activity',
  'Abbrechen':'Interrupt', 'Beenden':'Quit', 'Züge':'turns',
  'Seitenleiste ein- und ausklappen (S)':'Collapse and expand the sidebar (S)',
  'Seitenleiste umschalten':'Toggle sidebar', 'Laufendes Modell':'Model in use',
  'Seitenleiste schließen':'Close sidebar', 'Seitenleiste schließen (Esc)':'Close the sidebar (Esc)',
  'Arbeitsverzeichnis der Session':'Working directory of the session',
  'Neue Session beginnen':'Start a new session',
  'Freihändig: hört durchgehend zu, du kannst dazwischenreden':
    'Hands-free: listens continuously, you can interrupt',
  'Zeigt, welche Werkzeuge die Session benutzt':'Shows which tools the session uses',
  'Laufenden Turn abbrechen (Esc)':'Interrupt the running turn (Esc)',
  'Server beenden und Session schließen':'Stop the server and close the session',
  'Aufnahme starten':'Start recording', 'Laufzeit dieser Session':'Runtime of this session',
  'Abgeschlossene Züge':'Completed turns',
  'Token: gesendet ↑ / empfangen ↓, in Klammern aus dem Cache gelesen':
    'Tokens: sent ↑ / received ↓, in brackets read from cache',
  'Füllstand des Kontextfensters · klicken für die Aufschlüsselung':
    'Context window usage · click for the breakdown',
  'Kosten laut SDK':'Cost as reported by the SDK',
  'Werkzeug-Modus · Umschalt+Tab wechselt':'Tool mode · Shift+Tab cycles',
  // Buehne
  'Bereit':'Ready', 'Klick zum Sprechen':'Click to talk', 'halten':'hold',
  'zeigt alle Tasten':'shows every key', 'Noch nichts gesprochen.':'Nothing spoken yet.',
  'Halte die Leertaste oder klicke auf den Kreis. Für ein durchgehendes Gespräch schalte oben Freihändig ein.':
    'Hold the space bar or click the circle. For a continuous conversation turn on Hands-free above.',
  // Zustaende
  'Hört zu…':'Listening…', 'Verstehe…':'Transcribing…', 'Denkt nach…':'Thinking…',
  'Spricht…':'Speaking…', 'Fehler':'Error',
  'Beendet. Das Fenster kann zu.':'Stopped. You can close this window.',
  'Wartet auf deine Freigabe':'Waiting for your approval',
  'Denkt weiter…':'Still thinking…',
  // Werkzeuge
  'Führt aus':'Runs', 'Liest':'Reads', 'Schreibt':'Writes', 'Ändert':'Edits',
  'Sucht Dateien':'Finds files', 'Durchsucht':'Searches', 'Lädt':'Fetches',
  'Sucht im Netz':'Searches the web', 'Startet Unteragent':'Starts subagent',
  'Plant':'Plans', 'Ändert Notebook':'Edits notebook', 'denkt':'thinking',
  // Meldungen
  'Session':'Session', 'Modus':'Tool mode', 'Kontext':'Context', 'Fortgesetzt':'Resumed', 'Du':'You',
  'Antwortstil':'Response style', 'wie üblich':'as usual', 'knapp':'concise',
  'ausführlich':'thorough', 'erklärend':'explanatory', 'sachlich':'matter-of-fact',
  'locker':'casual', 'sokratisch':'socratic', 'eigener Stil…':'custom style…',
  'eigener Stil':'custom style', 'Eigener Stil':'Custom style',
  'Antworte immer zuerst mit dem Ergebnis, dann mit dem Weg dorthin.':
    'Always give the result first, then how you got there.',
  '. Session neu gestartet, der Stil gilt ab jetzt.':
    '. Started a new session, the style applies from now on.',
  'Status':'Status', 'Arbeit':'Work',
  '5 h':'5 h', '7 d':'7 d',
  'Anteil des 5-Stunden-Fensters · Zurücksetzung in Klammern':
    'Share of the 5-hour window · reset time in brackets',
  'Anteil des 7-Tage-Fensters · Zurücksetzung in Klammern':
    'Share of the 7-day window · reset time in brackets',
  '…oder tippen, wenn das Mikro dich verhört hat':
    '…or type, when the mic misheard you',
  'senden':'send', 'getippt':'typed',
  'Freigabe erforderlich':'Approval needed',
  'Claude möchte X benutzen.':'Claude wants to use X.',
  'Erlauben':'Allow', 'Ablehnen':'Deny',
  'immer: X':'always: X', 'immer genau das':'always exactly this', 'immer X':'always X',
  'ab jetzt ohne Rückfrage':'no more asking from now on',
  'dieser Aufruf ab jetzt ohne Rückfrage':'this call no longer asks',
  'frei':'auto',
  'Fachwörter für die Erkennung':'Terms for recognition',
  'Begriffe, die Whisper sonst verhört — mit Komma getrennt':
    'Terms Whisper otherwise mishears, comma separated',
  'Fachwörter übernommen':'Terms applied',
  'Kosten je Modell':'Cost per model',
  'Git-Zweig · klicken für Wechseln, Holen, Ziehen, Schieben':
    'Git branch · click to switch, fetch, pull, push',
  'neuer Zweig':'new branch', 'anlegen':'create', 'holen':'fetch', 'ziehen':'pull',
  'schieben':'push', 'wirklich schieben?':'really push?', 'läuft…':'running…',
  'erledigt':'done', 'voraus':'ahead', 'zurück':'behind', 'geändert':'changed',
  'kein Gegenstück am Server':'no upstream',
  'Konto':'Account', 'E-Mail':'Email', 'Organisation':'Organisation', 'Abo':'Plan',
  'Schlüsselquelle':'Key source', 'Plangrenzen':'Plan limits',
  '5 Stunden':'5 hours', '7 Tage':'7 days', '7 Tage Opus':'7 days Opus',
  '7 Tage Sonnet':'7 days Sonnet',
  'für diesen Zugang nicht anwendbar':'not applicable for this access', 'Verzeichnis':'Directory', 'Zweig':'Branch',
  'Läuft':'Running', 'ja':'yes', 'nein':'no', 'Kennung':'Id', 'noch keine':'none yet',
  'Laufzeit':'Runtime', 'Verbrauch':'Usage', 'Token ein':'Tokens in',
  'Token aus':'Tokens out', 'Kosten':'Cost', 'Spracherkennung':'Speech recognition',
  'Backend':'Backend', 'Server':'Server',
  'eigener Prozess':'own process', 'fremder Prozess':'foreign process', 'aus':'off',
  'Laufzeitumgebung':'Runtime environment', 'Agent-SDK':'Agent SDK', 'Port':'Port',
  'unbekannt':'unknown', 'Node':'Node',
  'Aufgaben':'Tasks', 'Befehle':'Commands', 'Git-Zweig im Arbeitsverzeichnis':'Git branch of the working directory',
  'Keine Befehle in dieser Session.':'No commands in this session.',
  'nicht lesbar':'not readable', 'Stimme aus Konfig':'Voice from config',
  'Automatisch':'Automatic', 'bestes verfügbares':'best available',
  'Key über Umgebungsvariable':'key via environment variable',
  'Edge (Microsoft)':'Edge (Microsoft)', 'Microsoft Neural, ohne Key':'Microsoft Neural, no key',
  'Piper (lokal)':'Piper (local)', 'System (macOS)':'System (macOS)',
  'immer verfügbar':'always available',
  'keine Auswahl':'no choice', 'Backends nicht lesbar':'Backends not readable',
  'sehr grob':'very coarse', 'grob':'coarse', 'mittel':'medium', 'fein':'fine', 'Es läuft noch ein Zug.':'A turn is still running.',
  ' ms lokal transkribiert':' ms transcribed locally',
  'Nichts verstanden':'Nothing understood',
  'Nochmal klicken oder Leertaste loslassen zum Senden':'Click again or release space to send',
  'Freihändig aktiv. Sprich einfach los, du kannst dazwischenreden.':
    'Hands-free is on. Just start talking, you can interrupt.',
  'Kalibriere den Raumpegel…':'Measuring the room level…',
  'Freihändig ist vorgemerkt. Einmal irgendwo klicken zum Aktivieren.':
    'Hands-free is queued. Click anywhere once to activate.',
  'Freigabe':'Approval', 'Sprachausgabe umgestellt':'Speech output changed',
  'keine Aufschlüsselung':'no breakdown',
  'Keine Unteragenten in dieser Session.':'No subagents in this session.',
  'Keine MCP-Server in dieser Session.':'No MCP servers in this session.',
  'Die Session startet mit der ersten Frage. Danach steht die Liste hier.':
    'The session starts with your first question. The list appears here afterwards.',
  'Noch keine früheren Sessions in diesem Verzeichnis.':
    'No earlier sessions in this directory yet.',
  'verbunden':'connected', 'fehlgeschlagen':'failed', 'Anmeldung nötig':'needs sign-in',
  'verbindet':'connecting', 'abgeschaltet':'disabled', 'X Werkzeuge':'X tools',
  'fertig':'done', 'ok':'ok', 'erlaubt':'allowed', 'abgelehnt':'denied',
  'gerade eben':'just now', 'wie das Modell vorgibt':'as the model decides',
  'sehr klein':'very small', 'klein':'small', 'groß':'large', 'sehr groß':'very large',
  // Beim Umbau auf React entstanden
  'Standardmodell':'Default model', 'übernehmen':'apply', 'wirklich?':'really?',
  'von':'of', 'Werkzeugaufrufe':'tool calls',
  'Beiträge wiederhergestellt. Hier geht es weiter.':'contributions restored. Continue here.',
  'Kein Transkript gefunden. Das Gedächtnis der Session ist trotzdem da.':
    'No transcript found. The session still has its memory.',
  'Noch keine Werkzeuge benutzt.':'No tools used yet.',
  '. Session neu gestartet, dieser Modus geht nur beim Start.':
    '. Started a new session, this mode can only be set at launch.',
  '. Neue Session gestartet, weil das Modell beim Start gesetzt wird.':
    '. Started a new session, because the model is set at launch.',
  'Indigo':'Indigo', 'Smaragd':'Emerald', 'Bernstein':'Amber', 'Rose':'Rose',
  'Stahl':'Steel', 'Türkis':'Teal'
}
