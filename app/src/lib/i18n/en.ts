import type { Messages } from './messages.ts'

export const en: Messages = {
  keyboard: {
    title: 'Keyboard',
    space: 'Space',
    shift: 'Shift',
    holdToTalk: 'hold to talk',
    interrupt: 'interrupt the running turn',
    toggleHandsFree: 'toggle hands-free',
    trail: 'activity trail',
    newSession: 'new session',
    toggleSidebar: 'toggle sidebar',
    cycleMode: 'cycle tool mode',
    thisOverview: 'this overview',
    clickToClose: 'Click anywhere to close.'
  },

  state: {
    idle: 'Ready',
    listening: 'Listening…',
    transcribing: 'Transcribing…',
    thinking: 'Thinking…',
    speaking: 'Speaking…',
    error: 'Error',
    off: 'Stopped. You can close this window.',
    waiting: 'Waiting for your approval',
    stillThinking: 'Still thinking…'
  },

  stage: {
    startRecording: 'Start recording',
    typePlaceholder: '…or type, when the mic misheard you',
    send: 'send',
    typed: 'typed',
    clickToTalk: 'Click to talk',
    hold: 'hold',
    showsEveryKey: 'shows every key',
    nothingSpokenYet: 'Nothing spoken yet.',
    emptyHint:
      'Hold the space bar or click the circle. For a continuous conversation turn on Hands-free above.',
    releaseToSend: 'Click again or release space to send',
    handsFreeActive: 'Hands-free is on. Just start talking, you can interrupt.',
    calibrating: 'Measuring the room level…',
    handsFreeQueued: 'Hands-free is queued. Click anywhere once to activate.',
    transcribedLocally: (ms: number) => `${ms} ms transcribed locally`,
    nothingUnderstood: 'Nothing understood'
  },

  header: {
    defaultModel: 'Default model',
    modelInUse: 'Model in use',
    workingDirectory: 'Working directory of the session',
    toggleSidebar: 'Toggle sidebar',
    toggleSidebarHint: 'Collapse and expand the sidebar (S)',
    closeSidebar: 'Close sidebar',
    closeSidebarHint: 'Close sidebar (Esc)',
    newSession: 'New session',
    newSessionHint: 'Start a new session',
    handsFree: 'Hands-free',
    handsFreeHint: 'Hands-free: listens continuously, you can interrupt',
    activity: 'Activity',
    activityHint: 'Shows which tools the session uses',
    interrupt: 'Interrupt',
    interruptHint: 'Interrupt the running turn (Esc)',
    quit: 'Quit',
    quitHint: 'Stop the server and close the session'
  },

  settings: {
    title: 'Settings',
    speechOutput: 'Speech output',
    voice: 'Voice',
    voiceFromConfig: 'Voice from config',
    noChoice: 'no choice',
    backendsUnreadable: 'Backends not readable',
    model: 'Model',
    asConfigured: 'as configured',
    thinkingDepth: 'Thinking depth',
    language: 'Language',
    german: 'German',
    english: 'English',
    detectAutomatically: 'detect automatically',
    vocabulary: 'Terms for recognition',
    vocabularyPlaceholder: 'Terms Whisper otherwise mishears, comma separated',
    apply: 'apply',
    vocabularyApplied: 'Terms applied',
    toolLinesInTranscript: 'Tool lines in the transcript',
    showFullCommands: 'Show commands in full',
    tools: 'Tools',
    responseStyle: 'Response style',
    customStyle: 'Custom style',
    customStylePick: 'custom style…',
    customStylePlaceholder: 'Always give the result first, then how you got there.'
  },

  depth: {
    asConfigured: 'as configured',
    veryShallow: 'very shallow',
    medium: 'medium',
    deep: 'deep',
    veryDeep: 'very deep',
    maximum: 'maximum'
  },

  mode: {
    default: 'asks first',
    acceptEdits: 'edits without asking',
    plan: 'plan only',
    auto: 'model decides',
    dontAsk: 'pre-approved only',
    bypassPermissions: 'never ask'
  },

  backendLabel: {
    auto: 'Automatic',
    piper: 'Piper (local)',
    say: 'System (macOS)'
  },
  backendDetail: {
    bestAvailable: 'best available',
    alwaysAvailable: 'always available',
    keyNone: 'no key configured',
    keyEnv: 'key from the environment variable',
    keyFile: 'key from ~/.claude/voice.env',
    keyOnePassword: 'key from 1Password',
    keyKeychain: 'key from the keychain',
    edgeMissing: 'edge-tts not installed',
    edgeReady: 'Microsoft Neural, no key',
    piperMissing: 'piper or the voice model is missing'
  },
  style: {
    standard: 'as usual',
    concise: 'concise',
    thorough: 'thorough',
    explanatory: 'explanatory',
    factual: 'matter-of-fact',
    casual: 'casual',
    socratic: 'socratic',
    custom: 'custom style'
  },

  appearance: {
    title: 'Appearance',
    theme: 'Theme',
    themeSystem: 'match the system',
    themeLight: 'light',
    themeDark: 'dark',
    accent: 'Accent',
    textSize: 'Text size',
    density: 'Density',
    densityAiry: 'airy',
    densityNormal: 'normal',
    densityCompact: 'compact',
    corners: 'Corners',
    cornersSoft: 'soft',
    cornersNormal: 'normal',
    cornersSharp: 'sharp',
    reduceMotion: 'Reduce motion',
    noGlow: 'No background glow',
    muteReplies: 'Mute replies',
    speakingRate: 'Speaking rate'
  },

  size: {
    verySmall: 'very small',
    small: 'small',
    normal: 'normal',
    large: 'large',
    veryLarge: 'very large'
  },

  accent: {
    indigo: 'Indigo',
    emerald: 'Emerald',
    amber: 'Amber',
    rose: 'Rose',
    steel: 'Steel',
    teal: 'Teal'
  },

  transcript: {
    you: 'You',
    approvalNeeded: 'Approval needed',
    wantsToUse: (tool: string) => `Claude wants to use ${tool}.`,
    allow: 'Allow',
    deny: 'Deny',
    allowed: 'allowed',
    denied: 'denied',
    alwaysThis: (arg: string) => `always: ${arg}`,
    alwaysExactly: 'always exactly this',
    alwaysTool: (tool: string) => `always ${tool}`,
    expandRow: 'Click expands the whole row',
    thinking: 'thinking',
    auto: 'auto',
    ok: 'ok',
    failed: 'failed',
    noToolsYet: 'No tools used yet.'
  },

  tool: {
    Bash: 'Runs',
    Read: 'Reads',
    Write: 'Writes',
    Edit: 'Edits',
    Glob: 'Finds files',
    Grep: 'Searches',
    WebFetch: 'Fetches',
    WebSearch: 'Searches the web',
    Task: 'Starts subagent',
    Agent: 'Starts subagent',
    TodoWrite: 'Plans',
    NotebookEdit: 'Edits notebook'
  },

  groups: {
    tasks: 'Tasks',
    commands: 'Commands',
    status: 'Status',
    mcp: 'MCP servers',
    subagents: 'Subagents',
    history: 'History',
    reload: 'Reload',
    noCommands: 'No commands in this session.',
    noMcp: 'No MCP servers in this session.',
    noSubagents: 'No subagents in this session.',
    noSessions: 'No earlier sessions in this directory yet.',
    sessionStartsWithFirstQuestion:
      'The session starts with your first question. The list appears here afterwards.',
    unreadable: 'not readable',
    toolCount: (n: number) => `${n} tools`,
    done: 'done'
  },

  mcpState: {
    connected: 'connected',
    failed: 'failed',
    'needs-auth': 'needs sign-in',
    pending: 'connecting',
    disabled: 'disabled'
  },

  status: {
    work: 'Work',
    directory: 'Directory',
    branch: 'Branch',
    session: 'Session',
    running: 'Running',
    yes: 'yes',
    no: 'no',
    id: 'Id',
    noneYet: 'none yet',
    model: 'Model',
    depth: 'Thinking depth',
    style: 'Response style',
    runtime: 'Runtime',
    usage: 'Usage',
    turns: 'Turns',
    tokensIn: 'Tokens in',
    tokensOut: 'Tokens out',
    cost: 'Cost',
    context: 'Context',
    costPerModel: 'Cost per model',
    account: 'Account',
    email: 'Email',
    organisation: 'Organisation',
    plan: 'Plan',
    planLimits: 'Plan limits',
    fiveHours: '5 hours',
    sevenDays: '7 days',
    sevenDaysOpus: '7 days Opus',
    sevenDaysSonnet: '7 days Sonnet',
    speechRecognition: 'Speech recognition',
    server: 'Server',
    ownProcess: 'own process',
    foreignProcess: 'foreign process',
    serverOff: 'off',
    speechOutput: 'Speech output',
    backend: 'Backend',
    voice: 'Voice',
    environment: 'Runtime environment',
    node: 'Node',
    sdk: 'Agent SDK',
    port: 'Port',
    unknown: 'unknown'
  },

  bar: {
    sessionRuntime: 'Runtime of this session',
    completedTurns: 'Completed turns',
    tokens: 'Tokens: sent ↑ / received ↓, in brackets read from cache',
    contextFill: 'Context window usage · click for the breakdown',
    costBySdk: 'Cost as reported by the SDK',
    fiveHourWindow: 'Share of the 5-hour window · reset time in brackets',
    sevenDayWindow: 'Share of the 7-day window · reset time in brackets',
    toolMode: 'Tool mode · Shift+Tab cycles',
    turnsShort: 'turns',
    of: 'of',
    noBreakdown: 'no breakdown'
  },

  git: {
    branchHint: 'Git branch · click to switch, fetch, pull, push',
    newBranch: 'new branch',
    create: 'create',
    fetch: 'fetch',
    pull: 'pull',
    push: 'push',
    reallyPush: 'really?',
    running: 'running…',
    done: 'done',
    failed: 'failed',
    ahead: 'ahead',
    behind: 'behind',
    changed: 'changed',
    noUpstream: 'no upstream'
  },

  toast: {
    session: 'Session',
    mode: 'Tool mode',
    context: 'Context',
    model: 'Model',
    language: 'Language',
    responseStyle: 'Response style',
    speechRecognition: 'Speech recognition',
    error: 'Error',
    resumed: (title: string) => `Resumed: ${title}`,
    turnStillRunning: 'A turn is still running.',
    restartedForStyle: '. Started a new session, the style applies from now on.',
    restartedForMode: '. Started a new session, this mode can only be set at launch.',
    restartedForModel: '. Started a new session, because the model is set at launch.',
    restartedForLanguage:
      '. Started a new session, because the reply language is part of the system prompt.',
    appliesNextSession: '. Takes effect with the next session.'
  },

  restore: {
    toolCalls: (n: number, names: string) => `↳ ${n} tool calls · ${names}`,
    restored: (n: number) => `${n} contributions restored. Continue here.`,
    noTranscript: 'No transcript found. The session still has its memory.'
  },

  error: {
    micDenied: 'No microphone access',
    micDeniedHint:
      'System Settings → Privacy → Microphone, allow the browser there. Then reload.',
    micMissing: 'No microphone found',
    micMissingHint: 'Is an input device connected and selected?',
    modelMissing: 'Whisper model missing',
    modelMissingHint: 'Download it once: see README, Installation.',
    recognitionFailed: 'Speech recognition failed',
    serverUnreachable: 'Server unreachable',
    serverUnreachableHint: 'Is claude-voice-ui still running? Check the terminal window.',
    tokenInvalid: 'Token invalid',
    tokenInvalidHint:
      'Did you open this page without the ?token= in the URL? Restart claude-voice-ui.',
    rateLimited: 'Limit reached',
    rateLimitedHint: 'The Anthropic API is throttling. Wait a moment and try again.',
    unknownCause: 'Unknown cause'
  }
}
