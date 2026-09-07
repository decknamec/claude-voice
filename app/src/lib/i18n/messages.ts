/**
 * Product copy the interface renders.
 *
 * German is the product language; the keys are structural so the same German
 * word can carry two different English renderings where the context differs
 * ("Werkzeuge" is a settings label and a unit of count).
 * The German catalogue defines the shape, so a missing English key is a type
 * error rather than a silently untranslated label.
 */
export const de = {
  keyboard: {
    title: 'Tastatur',
    space: 'Leertaste',
    shift: 'Umschalt',
    holdToTalk: 'halten zum Sprechen',
    interrupt: 'laufenden Turn abbrechen',
    toggleHandsFree: 'Freihändig an und aus',
    trail: 'Aktivitätsspur',
    newSession: 'neue Session',
    toggleSidebar: 'Seitenleiste ein und aus',
    cycleMode: 'Werkzeug-Modus wechseln',
    thisOverview: 'diese Übersicht',
    clickToClose: 'Irgendwo klicken schließt.'
  },

  state: {
    idle: 'Bereit',
    listening: 'Hört zu…',
    transcribing: 'Verstehe…',
    thinking: 'Denkt nach…',
    speaking: 'Spricht…',
    error: 'Fehler',
    off: 'Beendet. Das Fenster kann zu.',
    waiting: 'Wartet auf deine Freigabe',
    stillThinking: 'Denkt weiter…'
  },

  stage: {
    startRecording: 'Aufnahme starten',
    typePlaceholder: '…oder tippen, wenn das Mikro dich verhört hat',
    send: 'senden',
    typed: 'getippt',
    clickToTalk: 'Klick zum Sprechen',
    hold: 'halten',
    showsEveryKey: 'zeigt alle Tasten',
    nothingSpokenYet: 'Noch nichts gesprochen.',
    emptyHint:
      'Halte die Leertaste oder klicke auf den Kreis. Für ein durchgehendes Gespräch schalte oben Freihändig ein.',
    releaseToSend: 'Nochmal klicken oder Leertaste loslassen zum Senden',
    handsFreeActive: 'Freihändig aktiv. Sprich einfach los, du kannst dazwischenreden.',
    calibrating: 'Kalibriere den Raumpegel…',
    handsFreeQueued: 'Freihändig ist vorgemerkt. Einmal irgendwo klicken zum Aktivieren.',
    transcribedLocally: (ms: number) => `${ms} ms lokal transkribiert`,
    nothingUnderstood: 'Nichts verstanden'
  },

  header: {
    defaultModel: 'Standardmodell',
    modelInUse: 'Laufendes Modell',
    workingDirectory: 'Arbeitsverzeichnis der Session',
    toggleSidebar: 'Seitenleiste umschalten',
    toggleSidebarHint: 'Seitenleiste ein- und ausklappen (S)',
    closeSidebar: 'Seitenleiste schließen',
    closeSidebarHint: 'Seitenleiste schließen (Esc)',
    newSession: 'Neue Session',
    newSessionHint: 'Neue Session beginnen',
    handsFree: 'Freihändig',
    handsFreeHint: 'Freihändig: hört durchgehend zu, du kannst dazwischenreden',
    activity: 'Aktivität',
    activityHint: 'Zeigt, welche Werkzeuge die Session benutzt',
    interrupt: 'Abbrechen',
    interruptHint: 'Laufenden Turn abbrechen (Esc)',
    quit: 'Beenden',
    quitHint: 'Server beenden und Session schließen'
  },

  settings: {
    title: 'Einstellungen',
    speechOutput: 'Sprachausgabe',
    voice: 'Stimme',
    voiceFromConfig: 'Stimme aus Konfig',
    noChoice: 'keine Auswahl',
    backendsUnreadable: 'Backends nicht lesbar',
    model: 'Modell',
    asConfigured: 'wie konfiguriert',
    thinkingDepth: 'Denktiefe',
    language: 'Sprache',
    german: 'Deutsch',
    english: 'English',
    detectAutomatically: 'automatisch erkennen',
    vocabulary: 'Fachwörter für die Erkennung',
    vocabularyPlaceholder: 'Begriffe, die Whisper sonst verhört - mit Komma getrennt',
    apply: 'übernehmen',
    vocabularyApplied: 'Fachwörter übernommen',
    toolLinesInTranscript: 'Werkzeugzeilen im Verlauf',
    showFullCommands: 'Befehle vollständig zeigen',
    tools: 'Werkzeuge',
    responseStyle: 'Antwortstil',
    customStyle: 'Eigener Stil',
    customStylePick: 'eigener Stil…',
    customStylePlaceholder: 'Antworte immer zuerst mit dem Ergebnis, dann mit dem Weg dorthin.'
  },

  depth: {
    asConfigured: 'wie konfiguriert',
    veryShallow: 'sehr flach',
    medium: 'mittel',
    deep: 'tief',
    veryDeep: 'sehr tief',
    maximum: 'maximal'
  },

  mode: {
    default: 'fragt nach',
    acceptEdits: 'Edits ohne Rückfrage',
    plan: 'nur planen',
    auto: 'Modell entscheidet',
    dontAsk: 'nur Vorgenehmigtes',
    bypassPermissions: 'ohne jede Rückfrage'
  },

  spoken: {
    permission: (tool: string) => `Freigabe für ${tool}?`,
    unclear: 'Das war kein klares Ja oder Nein.'
  },
  backendLabel: {
    auto: 'Automatisch',
    piper: 'Piper (lokal)',
    say: 'System (macOS)'
  },
  backendDetail: {
    bestAvailable: 'bestes verfügbares',
    alwaysAvailable: 'immer verfügbar',
    keyNone: 'kein Key hinterlegt',
    keyEnv: 'Key aus der Umgebungsvariable',
    keyFile: 'Key aus ~/.claude/voice.env',
    keyOnePassword: 'Key aus 1Password',
    keyKeychain: 'Key aus dem Schlüsselbund',
    edgeMissing: 'edge-tts nicht installiert',
    edgeReady: 'Microsoft Neural, ohne Key',
    piperMissing: 'piper oder Stimmmodell fehlt'
  },
  style: {
    standard: 'wie üblich',
    concise: 'concise',
    thorough: 'ausführlich',
    explanatory: 'erklärend',
    factual: 'factual',
    casual: 'casual',
    socratic: 'socratic',
    custom: 'eigener Stil'
  },

  appearance: {
    title: 'Darstellung',
    theme: 'Design',
    themeSystem: 'wie das System',
    themeLight: 'hell',
    themeDark: 'dunkel',
    accent: 'Akzent',
    textSize: 'Schriftgröße',
    density: 'Dichte',
    densityAiry: 'luftig',
    densityNormal: 'normal',
    densityCompact: 'kompakt',
    corners: 'Ecken',
    cornersSoft: 'weich',
    cornersNormal: 'normal',
    cornersSharp: 'kantig',
    reduceMotion: 'Bewegung reduzieren',
    noGlow: 'Hintergrundschimmer aus',
    muteReplies: 'Antworten stumm',
    speakingRate: 'Sprechtempo'
  },

  size: {
    verySmall: 'sehr klein',
    small: 'klein',
    normal: 'normal',
    large: 'groß',
    veryLarge: 'sehr groß'
  },

  accent: {
    indigo: 'Indigo',
    emerald: 'Smaragd',
    amber: 'Bernstein',
    rose: 'Rose',
    steel: 'Stahl',
    teal: 'Türkis'
  },

  transcript: {
    you: 'Du',
    orSayYesNo: 'oder sag einfach ja oder nein',
    approvalNeeded: 'Freigabe erforderlich',
    wantsToUse: (tool: string) => `Claude möchte ${tool} benutzen.`,
    allow: 'Erlauben',
    deny: 'Ablehnen',
    allowed: 'erlaubt',
    denied: 'abgelehnt',
    alwaysThis: (arg: string) => `immer: ${arg}`,
    alwaysExactly: 'immer genau das',
    alwaysTool: (tool: string) => `immer ${tool}`,
    expandRow: 'Klick klappt die ganze Zeile auf',
    thinking: 'denkt',
    auto: 'frei',
    ok: 'ok',
    failed: 'fehlgeschlagen',
    noToolsYet: 'Noch keine Werkzeuge benutzt.'
  },

  tool: {
    Bash: 'Führt aus',
    Read: 'Liest',
    Write: 'Schreibt',
    Edit: 'Ändert',
    Glob: 'Sucht Dateien',
    Grep: 'Durchsucht',
    WebFetch: 'Lädt',
    WebSearch: 'Sucht im Netz',
    Task: 'Startet Unteragent',
    Agent: 'Startet Unteragent',
    TodoWrite: 'Plant',
    NotebookEdit: 'Ändert Notebook'
  },

  groups: {
    tasks: 'Aufgaben',
    commands: 'Befehle',
    status: 'Status',
    mcp: 'MCP-Server',
    subagents: 'Unteragenten',
    history: 'Verlauf',
    reload: 'Neu laden',
    noCommands: 'Keine Befehle in dieser Session.',
    noMcp: 'Keine MCP-Server in dieser Session.',
    noSubagents: 'Keine Unteragenten in dieser Session.',
    noSessions: 'Noch keine früheren Sessions in diesem Verzeichnis.',
    sessionStartsWithFirstQuestion:
      'Die Session startet mit der ersten Frage. Danach steht die Liste hier.',
    unreadable: 'nicht lesbar',
    toolCount: (n: number) => `${n} Werkzeuge`,
    done: 'fertig'
  },

  mcpState: {
    connected: 'verbunden',
    failed: 'fehlgeschlagen',
    'needs-auth': 'Anmeldung nötig',
    pending: 'verbindet',
    disabled: 'abgeschaltet'
  },

  status: {
    work: 'Arbeit',
    directory: 'Verzeichnis',
    branch: 'Zweig',
    session: 'Session',
    running: 'Läuft',
    yes: 'ja',
    no: 'nein',
    id: 'Kennung',
    noneYet: 'noch keine',
    model: 'Modell',
    depth: 'Denktiefe',
    style: 'Antwortstil',
    runtime: 'Laufzeit',
    usage: 'Verbrauch',
    turns: 'Züge',
    tokensIn: 'Token ein',
    tokensOut: 'Token aus',
    cost: 'Kosten',
    context: 'Kontext',
    costPerModel: 'Kosten je Modell',
    account: 'Konto',
    email: 'E-Mail',
    organisation: 'Organisation',
    plan: 'Abo',
    planLimits: 'Plangrenzen',
    fiveHours: '5 Stunden',
    sevenDays: '7 Tage',
    sevenDaysOpus: '7 Tage Opus',
    sevenDaysSonnet: '7 Tage Sonnet',
    speechRecognition: 'Spracherkennung',
    server: 'Server',
    ownProcess: 'eigener Prozess',
    foreignProcess: 'fremder Prozess',
    serverOff: 'aus',
    speechOutput: 'Sprachausgabe',
    backend: 'Backend',
    voice: 'Stimme',
    environment: 'Laufzeitumgebung',
    node: 'Node',
    sdk: 'Agent-SDK',
    port: 'Port',
    unknown: 'unbekannt'
  },

  bar: {
    sessionRuntime: 'Laufzeit dieser Session',
    completedTurns: 'Abgeschlossene Züge',
    tokens: 'Token: gesendet ↑ / empfangen ↓, in Klammern aus dem Cache gelesen',
    contextFill: 'Füllstand des Kontextfensters · klicken für die Aufschlüsselung',
    costBySdk: 'Kosten laut SDK',
    fiveHourWindow: 'Anteil des 5-Stunden-Fensters · Zurücksetzung in Klammern',
    sevenDayWindow: 'Anteil des 7-Tage-Fensters · Zurücksetzung in Klammern',
    toolMode: 'Werkzeug-Modus · Umschalt+Tab wechselt',
    turnsShort: 'Züge',
    of: 'von',
    noBreakdown: 'keine Aufschlüsselung'
  },

  git: {
    branchHint: 'Git-Zweig · klicken für Wechseln, Holen, Ziehen, Schieben',
    newBranch: 'neuer Zweig',
    create: 'anlegen',
    fetch: 'holen',
    pull: 'ziehen',
    push: 'schieben',
    reallyPush: 'wirklich?',
    running: 'läuft…',
    done: 'erledigt',
    failed: 'fehlgeschlagen',
    ahead: 'voraus',
    behind: 'zurück',
    changed: 'geändert',
    noUpstream: 'kein Gegenstück am Server'
  },

  toast: {
    session: 'Session',
    mode: 'Modus',
    context: 'Kontext',
    model: 'Modell',
    language: 'Sprache',
    responseStyle: 'Antwortstil',
    speechRecognition: 'Spracherkennung',
    error: 'Fehler',
    resumed: (title: string) => `Fortgesetzt: ${title}`,
    turnStillRunning: 'Es läuft noch ein Zug.',
    restartedForStyle: '. Session neu gestartet, der Stil gilt ab jetzt.',
    restartedForMode: '. Session neu gestartet, dieser Modus geht nur beim Start.',
    restartedForModel: '. Neue Session gestartet, weil das Modell beim Start gesetzt wird.',
    restartedForLanguage:
      '. Neue Session gestartet, weil die Antwortsprache am Systemprompt hängt.',
    appliesNextSession: '. Gilt ab der nächsten Session.'
  },

  restore: {
    toolCalls: (n: number, names: string) => `↳ ${n} Werkzeugaufrufe · ${names}`,
    restored: (n: number) => `${n} Beiträge wiederhergestellt. Hier geht es weiter.`,
    noTranscript: 'Kein Transkript gefunden. Das Gedächtnis der Session ist trotzdem da.'
  },

  error: {
    micDenied: 'Kein Mikrofonzugriff',
    micDeniedHint:
      'Systemeinstellungen → Datenschutz → Mikrofon, dort den Browser erlauben. Danach neu laden.',
    micMissing: 'Kein Mikrofon gefunden',
    micMissingHint: 'Ist ein Eingabegerät angeschlossen und ausgewählt?',
    modelMissing: 'Whisper-Modell fehlt',
    modelMissingHint: 'Einmalig laden: siehe README, Abschnitt Installation.',
    recognitionFailed: 'Spracherkennung fehlgeschlagen',
    serverUnreachable: 'Server nicht erreichbar',
    serverUnreachableHint: 'Läuft claude-voice-ui noch? Das Terminal-Fenster prüfen.',
    tokenInvalid: 'Token ungültig',
    tokenInvalidHint:
      'Diese Seite ohne das ?token= in der URL geöffnet? Starte claude-voice-ui neu.',
    rateLimited: 'Limit erreicht',
    rateLimitedHint: 'Die Anthropic-API bremst gerade. Kurz warten und erneut versuchen.',
    unknownCause: 'Unbekannte Ursache'
  }
}

export type Messages = typeof de
