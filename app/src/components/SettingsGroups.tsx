import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import { ACCENTS, TEXT_SIZES, useSettings } from '../store/settings.ts'
import { useSession } from '../store/session.ts'
import { useMessages } from '../lib/i18n/index.ts'
import { Group } from './ui/Group.tsx'
import { Checkbox, Field, Select, Slider, TextArea, type Choice } from './ui/Fields.tsx'
import { useToasts } from './ui/Toasts.tsx'
import { audio } from '../lib/audio.ts'
import type { LanguageChoice } from '../lib/i18n/index.ts'
import type { ModelInfo, PermissionMode, SpeechBackend } from '../lib/types.ts'

export const MODES: PermissionMode[] = [
  'default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'
]

export const STYLES = [
  'standard', 'concise', 'thorough', 'explanatory',
  'factual', 'casual', 'socratic', 'custom'
] as const

/** Index maps to the effort levels the SDK accepts; 0 leaves the model's own. */
const DEPTHS = ['', 'low', 'medium', 'high', 'xhigh', 'max']
const DEPTH_KEYS = [
  'asConfigured', 'veryShallow', 'medium', 'deep', 'veryDeep', 'maximum'
] as const
const SIZE_KEYS = ['verySmall', 'small', 'normal', 'large', 'veryLarge'] as const

/**
 * A snapshot until a session runs; from then on supportedModels() replaces the
 * list and only what this access can reach remains.
 */
const FALLBACK_MODELS: Choice[] = [
  { value: 'claude-fable-5', label: 'Fable 5', group: 'Fable' },
  { value: 'claude-opus-5', label: 'Opus 5', group: 'Opus' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8', group: 'Opus' },
  { value: 'claude-sonnet-5', label: 'Sonnet 5', group: 'Sonnet' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5', group: 'Haiku' }
]

export function SettingsGroup ({ models }: { models: ModelInfo[] }) {
  const { m } = useMessages()
  const settings = useSettings()
  const toast = useToasts(s => s.show)
  const [backends, setBackends] = useState<SpeechBackend[]>([])
  const [backend, setBackend] = useState('')
  const [voice, setVoice] = useState('')
  const [model, setModel] = useState('')
  const [mode, setMode] = useState<PermissionMode>('default')
  const [depth, setDepth] = useState(0)
  const [vocabulary, setVocabulary] = useState('')

  useEffect(() => {
    void api.backends().then(d => {
      setBackends(d.backends)
      const available = d.backends.filter(b => b.available).map(b => b.id)
      setBackend(available.includes(d.active) ? d.active : available[0] ?? '')
    }).catch(() => {})
    void api.config().then(c => {
      setMode((c.permissionMode as PermissionMode) ?? 'default')
      setModel(c.modelOverride ?? '')
      setDepth(Math.max(0, DEPTHS.indexOf(c.effort ?? '')))
    }).catch(() => {})
    void api.vocabulary().then(d => setVocabulary(d.vocabulary)).catch(() => {})
  }, [])

  const selected = backends.find(b => b.id === backend)
  const voiceChoices: Choice[] = selected?.voices.length
    ? selected.voices.map(v => ({ value: v.id, label: v.name ?? v.id, title: v.id }))
    : [{ value: '', label: selected?.id === 'auto' ? m.settings.voiceFromConfig : m.settings.noChoice }]

  const modelChoices: Choice[] = [
    { value: '', label: m.settings.asConfigured },
    ...(models.length
      ? models.map(x => ({ value: x.id, label: x.name, title: x.description }))
      : FALLBACK_MODELS)
  ]

  const fail = (err: unknown) => toast(m.toast.error, String((err as Error).message), true)

  return (
    <Group id="settings" title={m.settings.title}>
      <Field label={m.settings.speechOutput}>
        <Select
          value={backend} onChange={setBackend}
          choices={backends.map(b => ({
            value: b.id,
            label: b.available ? b.label : `${b.label} (${b.detail})`,
            title: b.detail
          }))}
        />
      </Field>
      <Field label={m.settings.voice}>
        <Select value={voice || (voiceChoices[0]?.value ?? '')} onChange={setVoice}
                choices={voiceChoices} />
      </Field>
      <Field label={m.settings.model}>
        <Select
          value={model} choices={modelChoices}
          onChange={async v => {
            setModel(v)
            try {
              const r = await api.setModel(v)
              toast(m.toast.model,
                (v || m.settings.asConfigured) + (r.restarted ? m.toast.restartedForModel : ''))
            } catch (err) { fail(err) }
          }}
        />
      </Field>
      <Slider
        label={m.settings.thinkingDepth} value={depth} min={0} max={5} step={1}
        display={m.depth[DEPTH_KEYS[depth]]}
        onChange={async n => {
          setDepth(n)
          try { await api.setDepth(DEPTHS[n] || null) } catch (err) { fail(err) }
        }}
      />
      <Field label={m.settings.language}>
        <Select
          value={settings.language}
          choices={[
            { value: 'de', label: m.settings.german },
            { value: 'en', label: m.settings.english },
            { value: 'auto', label: m.settings.detectAutomatically }
          ]}
          onChange={async v => {
            settings.set({ language: v as LanguageChoice })
            try {
              const r = await api.setLanguage(v)
              toast(m.toast.language, r.restarted ? m.toast.restartedForLanguage : '')
            } catch (err) { fail(err) }
          }}
        />
      </Field>
      <Field label={m.settings.vocabulary}>
        <TextArea value={vocabulary} onChange={setVocabulary}
                  placeholder={m.settings.vocabularyPlaceholder} />
      </Field>
      <button className="chip self-start text-[11px] py-[3px]"
              onClick={async () => {
                try {
                  await api.setVocabulary(vocabulary)
                  toast(m.toast.speechRecognition, m.settings.vocabularyApplied)
                } catch (err) { fail(err) }
              }}>{m.settings.apply}</button>

      <div className="flex flex-col gap-[2px] border-t border-line pt-2">
        <Checkbox checked={settings.toolLines} onChange={v => settings.set({ toolLines: v })}
                  label={m.settings.toolLinesInTranscript} />
        <Checkbox checked={settings.fullCommands} onChange={v => settings.set({ fullCommands: v })}
                  label={m.settings.showFullCommands} />
      </div>

      <Field label={m.settings.responseStyle}>
        <Select
          value={settings.style}
          choices={STYLES.map(s => ({
            value: s, label: s === 'custom' ? m.settings.customStylePick : m.style[s]
          }))}
          onChange={async v => {
            settings.set({ style: v })
            try {
              const r = await api.setStyle(v, settings.styleText)
              toast(m.toast.responseStyle,
                m.style[v as keyof typeof m.style] + (r.restarted ? m.toast.restartedForStyle : ''))
            } catch (err) { fail(err) }
          }}
        />
      </Field>
      {settings.style === 'custom' && (
        <Field label={m.settings.customStyle}>
          <TextArea value={settings.styleText} rows={3}
                    onChange={v => settings.set({ styleText: v })}
                    placeholder={m.settings.customStylePlaceholder} />
        </Field>
      )}

      <Field label={m.settings.tools}>
        <Select
          value={mode} danger={mode === 'bypassPermissions'}
          choices={MODES.map(x => ({ value: x, label: m.mode[x] }))}
          onChange={async v => {
            const next = v as PermissionMode
            setMode(next)
            try {
              const r = await api.setMode(next)
              toast(m.toast.mode, `${m.settings.tools}: ${m.mode[next]}` +
                (r.restarted ? m.toast.restartedForMode
                 : r.applied ? '' : m.toast.appliesNextSession))
            } catch (err) { fail(err) }
          }}
        />
      </Field>
    </Group>
  )
}

export function AppearanceGroup () {
  const { m } = useMessages()
  const settings = useSettings()
  return (
    <Group id="appearance" title={m.appearance.title}>
      <Field label={m.appearance.theme}>
        <Select
          value={settings.theme} onChange={v => settings.set({ theme: v as never })}
          choices={[
            { value: 'system', label: m.appearance.themeSystem },
            { value: 'light', label: m.appearance.themeLight },
            { value: 'dark', label: m.appearance.themeDark }
          ]}
        />
      </Field>
      <Field label={m.appearance.accent}>
        {/* The active swatch carries a ring rather than a check: a check on a
            coloured ground reads well for some hues and not at all for others. */}
        <span className="flex flex-wrap gap-[6px]">
          {ACCENTS.map(a => (
            <button
              key={a.key} type="button" title={m.accent[a.key]}
              aria-pressed={settings.accent === a.key}
              onClick={() => settings.set({ accent: a.key })}
              style={{ background: a.light, color: a.light }}
              className="w-[22px] h-[22px] rounded-field border border-black/20 p-0 cursor-pointer
                         transition-transform hover:scale-110 active:scale-95
                         aria-pressed:shadow-[0_0_0_2px_var(--panel),0_0_0_3.5px_currentColor]
                         focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-2"
            />
          ))}
        </span>
      </Field>
      <Slider
        label={m.appearance.textSize} value={settings.textSize} min={0} max={4} step={1}
        display={m.size[SIZE_KEYS[settings.textSize] ?? 'normal']}
        onChange={n => settings.set({ textSize: n })}
      />
      <Field label={m.appearance.density}>
        <Select
          value={settings.density} onChange={v => settings.set({ density: v as never })}
          choices={[
            { value: 'airy', label: m.appearance.densityAiry },
            { value: 'normal', label: m.appearance.densityNormal },
            { value: 'compact', label: m.appearance.densityCompact }
          ]}
        />
      </Field>
      <Field label={m.appearance.corners}>
        <Select
          value={settings.corners} onChange={v => settings.set({ corners: v as never })}
          choices={[
            { value: 'soft', label: m.appearance.cornersSoft },
            { value: 'normal', label: m.appearance.cornersNormal },
            { value: 'sharp', label: m.appearance.cornersSharp }
          ]}
        />
      </Field>
      <div className="flex flex-col gap-[2px] border-t border-line pt-2">
        <Checkbox checked={settings.reduceMotion} onChange={v => settings.set({ reduceMotion: v })}
                  label={m.appearance.reduceMotion} />
        <Checkbox checked={settings.noGlow} onChange={v => settings.set({ noGlow: v })}
                  label={m.appearance.noGlow} />
        <Checkbox checked={settings.muted}
                  onChange={v => { settings.set({ muted: v }); audio.setMuted(v) }}
                  label={m.appearance.muteReplies} />
      </div>
      <Slider
        label={m.appearance.speakingRate} value={settings.speakingRate} min={70} max={150} step={5}
        display={`${settings.speakingRate} %`}
        onChange={n => { settings.set({ speakingRate: n }); audio.setRate(n / 100) }}
      />
    </Group>
  )
}

/**
 * What the model set out to do. It says more about progress than any bar,
 * because it comes from the model itself.
 */
export function TasksGroup () {
  const { m } = useMessages()
  const todos = useSession(s => s.todos)
  if (!todos.length) return null
  const done = todos.filter(t => t.status === 'completed').length
  return (
    <Group id="tasks" title={m.groups.tasks}
           badge={`${done}/${todos.length}`} badgeActive={done < todos.length}>
      <ol className="flex list-none flex-col gap-[5px] p-0 m-0">
        {todos.map((t, i) => (
          <li key={i} className={
            'flex items-baseline gap-2 text-[12px] ' +
            (t.status === 'completed' ? 'text-label opacity-50 line-through'
             : t.status === 'in_progress' ? 'text-fg' : 'text-label')
          }>
            <span className={'shrink-0 text-[10px] ' +
              (t.status === 'in_progress' ? 'text-accent' : 'opacity-50')}>
              {t.status === 'completed' ? '●' : t.status === 'in_progress' ? '◐' : '○'}
            </span>
            {/* activeForm is the progressive phrasing and reads better while a
                task is running than the infinitive does. */}
            <span>{t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content}</span>
          </li>
        ))}
      </ol>
    </Group>
  )
}

export { TEXT_SIZES }
