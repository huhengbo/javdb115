import { RotateCcw, Save, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { client } from '../api';
import { DirectoryPicker, type DirectorySelection } from '../components/DirectoryPicker';
import { P115QrLoginPanel } from '../components/P115QrLoginPanel';
import {
  CookieField,
  FilterRulesEditor,
  SettingsGroup,
  SingleLineField,
  TelegramFields
} from '../components/settings/SettingsFields';
import type { SettingItem } from '../types';

const COMPLETED_DIR_MODE_KEY = 'p115_completed_dir_mode';
const COMPLETED_DIR_MODE_SINGLE = 'single';
const COMPLETED_DIR_MODE_CATEGORY = 'category';

const downloadDirectory = {
  idKey: 'p115_download_dir_id',
  labelKey: 'p115_download_dir_label',
  label: '115 下载临时目录'
} as const;

const unifiedCompletedDirectory = {
  idKey: 'p115_completed_dir_id',
  labelKey: 'p115_completed_dir_label',
  label: '统一整理完成目录',
  helperText: '所有作品整理到同一个 115 目录下'
} as const;

const categoryCompletedDirectories = [
  {
    idKey: 'p115_completed_censored_dir_id',
    labelKey: 'p115_completed_censored_dir_label',
    label: '有码整理目录',
    helperText: '常规番号默认进入这里'
  },
  {
    idKey: 'p115_completed_uncensored_dir_id',
    labelKey: 'p115_completed_uncensored_dir_label',
    label: '无码整理目录',
    helperText: 'HEYZO、Carib、数字无码番号进入这里'
  },
  {
    idKey: 'p115_completed_fc2_dir_id',
    labelKey: 'p115_completed_fc2_dir_label',
    label: 'FC2 整理目录',
    helperText: 'FC2、FC2-PPV 番号进入这里'
  }
] as const;

const telegramConnectionKeys = ['telegram_bot_token'] as const;

const settingKeys = [
  ['p115_cookie', '115 Cookie', true],
  ['telegram_bot_token', 'Telegram Bot Token', true],
  ['telegram_chat_id', 'Telegram Chat ID（可空）', false],
  ['check_cron', '检查 Cron', false],
  ['filter_rules', '过滤规则 JSON', false],
  [COMPLETED_DIR_MODE_KEY, '115 整理目录模式', false],
  ['p115_download_dir_id', '115 下载临时目录', false],
  ['p115_download_dir_label', '115 下载临时目录名称', false],
  ['p115_completed_dir_id', '115 统一整理完成目录', false],
  ['p115_completed_dir_label', '115 统一整理完成目录名称', false],
  ['p115_completed_censored_dir_id', '115 有码整理目录', false],
  ['p115_completed_censored_dir_label', '115 有码整理目录名称', false],
  ['p115_completed_uncensored_dir_id', '115 无码整理目录', false],
  ['p115_completed_uncensored_dir_label', '115 无码整理目录名称', false],
  ['p115_completed_fc2_dir_id', '115 FC2 整理目录', false],
  ['p115_completed_fc2_dir_label', '115 FC2 整理目录名称', false]
] as const;

type CompletedDirMode = typeof COMPLETED_DIR_MODE_SINGLE | typeof COMPLETED_DIR_MODE_CATEGORY;
type DirectoryConfig = typeof downloadDirectory | typeof unifiedCompletedDirectory | typeof categoryCompletedDirectories[number];

type SettingsSaveState = {
  readonly setDirectoryReloadKey: (update: (value: number) => number) => void;
  readonly setError: (message: string | null) => void;
  readonly setIsSaving: (value: boolean) => void;
  readonly setMessage: (message: string | null) => void;
  readonly setSavedValues: (values: Record<string, string>) => void;
  readonly values: Record<string, string>;
};

export function SettingsPage() {
  const form = useSettingsForm();

  return (
    <section className={form.hasUnsavedChanges ? 'pb-24' : undefined}>
      <SettingsHeader hasUnsavedChanges={form.hasUnsavedChanges} isDisabled={!form.hasLoaded || form.isSaving} isSaving={form.isSaving} onSave={form.save} />
      <SettingsFeedback error={form.error} isLoading={form.isLoading} message={form.message} />
      <fieldset className="mt-2 border-t border-line disabled:opacity-70" disabled={!form.hasLoaded || form.isSaving}>
        <SettingsGroup title="115 账号">
          <CookieField values={form.values} onChange={form.setValue} />
          <P115QrLoginPanel onSuccess={form.onP115LoginSuccess} />
        </SettingsGroup>
        <SettingsGroup title="目录">
          <DirectorySettings form={form} />
        </SettingsGroup>
        <SettingsGroup title="订阅检查">
          <SingleLineField fieldKey="check_cron" label="检查 Cron" values={form.values} onChange={form.setValue} />
        </SettingsGroup>
        <SettingsGroup title="Telegram">
          <TelegramFields values={form.values} onChange={form.setValue} />
          <TelegramTestPanel chatId={form.values.telegram_chat_id ?? ''} hasUnsavedChanges={form.hasUnsavedTelegramSettings} />
        </SettingsGroup>
        <SettingsGroup title="高级过滤规则">
          <FilterRulesEditor value={form.values.filter_rules ?? ''} onChange={(value) => form.setValue('filter_rules', value)} />
        </SettingsGroup>
      </fieldset>
      {form.hasUnsavedChanges ? <MobileSaveBar isSaving={form.isSaving} onDiscard={form.discard} onSave={form.save} /> : null}
    </section>
  );
}

function useSettingsForm() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [directoryReloadKey, setDirectoryReloadKey] = useState(0);
  const hasUnsavedChanges = settingKeys.some(([key]) => (values[key] ?? '') !== (savedValues[key] ?? ''));
  const hasUnsavedTelegramSettings = telegramConnectionKeys.some((key) => values[key] !== savedValues[key]);

  useEffect(() => {
    void client.settings()
      .then((items) => {
        const nextValues = mapSettings(items);
        setValues(nextValues);
        setSavedValues(nextValues);
        setHasLoaded(true);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('settings-dirty-change', { detail: { dirty: hasUnsavedChanges } }));
    if (!hasUnsavedChanges) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('settings-dirty-change', { detail: { dirty: false } }));
  }, []);

  async function save() {
    await saveSettings({ setDirectoryReloadKey, setError, setIsSaving, setMessage, setSavedValues, values });
  }

  function discard() {
    setValues({ ...savedValues });
    setMessage('已放弃未保存修改');
    setError(null);
  }

  function onP115LoginSuccess() {
    setMessage('115 扫码登录成功');
    setDirectoryReloadKey((current) => current + 1);
  }

  function setValue(key: string, value: string) {
    setMessage(null);
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setDirectory(idKey: string, labelKey: string, selection: DirectorySelection) {
    setMessage(null);
    setValues((current) => ({ ...current, [idKey]: selection.id, [labelKey]: selection.label }));
  }

  function completedDirMode(): CompletedDirMode {
    return completedDirModeFromValues(values);
  }

  return { completedDirMode, directoryReloadKey, discard, error, hasLoaded, hasUnsavedChanges, hasUnsavedTelegramSettings, isLoading, isSaving, message, onP115LoginSuccess, save, setDirectory, setValue, values };
}

async function saveSettings(state: SettingsSaveState) {
  state.setError(null);
  state.setMessage(null);
  state.setIsSaving(true);
  const snapshot = { ...state.values };
  const items = settingKeys.map(([key, , secret]) => ({ key, value: snapshot[key] ?? '', is_secret: secret }));
  try {
    await client.saveSettings(items);
    state.setMessage('已保存');
    state.setSavedValues(snapshot);
    state.setDirectoryReloadKey((current) => current + 1);
  } catch (err) {
    state.setError((err as Error).message);
  } finally {
    state.setIsSaving(false);
  }
}

function completedDirModeFromValues(values: Record<string, string>): CompletedDirMode {
  return values[COMPLETED_DIR_MODE_KEY] === COMPLETED_DIR_MODE_CATEGORY ? COMPLETED_DIR_MODE_CATEGORY : COMPLETED_DIR_MODE_SINGLE;
}

type SettingsForm = ReturnType<typeof useSettingsForm>;

function SettingsHeader(props: { readonly hasUnsavedChanges: boolean; readonly isDisabled: boolean; readonly isSaving: boolean; readonly onSave: () => Promise<void> }) {
  if (!props.hasUnsavedChanges) return null;
  return (
    <div className="mb-2 flex min-h-10 items-center justify-between gap-3">
      <span className="text-xs font-medium text-amber-700">有未保存修改</span>
      <button className="hidden min-h-10 items-center gap-2 px-2 text-sm font-medium text-brand disabled:opacity-60 sm:flex" disabled={props.isDisabled} onClick={() => void props.onSave()} type="button"><Save size={17} />{props.isSaving ? '保存中' : '保存'}</button>
    </div>
  );
}

function MobileSaveBar(props: { readonly isSaving: boolean; readonly onDiscard: () => void; readonly onSave: () => Promise<void> }) {
  return (
    <div className="fixed inset-x-0 z-30 mx-auto max-w-3xl border-t border-line bg-white/95 px-4 pb-3 pt-3 backdrop-blur sm:hidden" style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
      <div className="grid grid-cols-2 gap-2">
        <button className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white text-sm font-medium text-ink" disabled={props.isSaving} onClick={props.onDiscard} type="button"><RotateCcw size={16} />放弃</button>
        <button className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand text-sm font-medium text-white disabled:opacity-60" disabled={props.isSaving} onClick={() => void props.onSave()} type="button"><Save size={16} />{props.isSaving ? '保存中' : '保存'}</button>
      </div>
    </div>
  );
}

function SettingsFeedback({ error, isLoading, message }: { readonly error: string | null; readonly isLoading: boolean; readonly message: string | null }) {
  if (isLoading) return <p className="py-3 text-sm text-slate-500">加载中...</p>;
  return <>{message ? <p className="mb-2 text-sm text-emerald-700" role="status">{message}</p> : null}{error ? <p className="mb-2 rounded-lg bg-red-50 p-3 text-sm text-danger" role="alert">{error}</p> : null}</>;
}

function DirectorySettings({ form }: { readonly form: SettingsForm }) {
  return <><DirectoryPickerField config={downloadDirectory} form={form} /><CompletedDirectorySettings form={form} /></>;
}

function DirectoryPickerField({ config, form }: { readonly config: DirectoryConfig; readonly form: SettingsForm }) {
  return <DirectoryPicker helperText={'helperText' in config ? config.helperText : undefined} label={config.label} reloadKey={form.directoryReloadKey} selectedLabel={form.values[config.labelKey] ?? ''} value={form.values[config.idKey] ?? ''} onChange={(selection) => form.setDirectory(config.idKey, config.labelKey, selection)} />;
}

function CompletedDirectorySettings({ form }: { readonly form: SettingsForm }) {
  const mode = form.completedDirMode();
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-medium text-ink">115 整理完成目录</h2>
        <CompletedModeSwitch mode={mode} onChange={(value) => form.setValue(COMPLETED_DIR_MODE_KEY, value)} />
      </div>
      <div className="grid gap-3">{mode === COMPLETED_DIR_MODE_SINGLE ? <DirectoryPickerField config={unifiedCompletedDirectory} form={form} /> : categoryCompletedDirectories.map((config) => <DirectoryPickerField config={config} form={form} key={config.idKey} />)}</div>
    </section>
  );
}

function CompletedModeSwitch(props: { readonly mode: CompletedDirMode; readonly onChange: (mode: CompletedDirMode) => void }) {
  return <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-0.5 text-sm"><ModeButton active={props.mode === COMPLETED_DIR_MODE_SINGLE} label="统一目录" onClick={() => props.onChange(COMPLETED_DIR_MODE_SINGLE)} /><ModeButton active={props.mode === COMPLETED_DIR_MODE_CATEGORY} label="按类型" onClick={() => props.onChange(COMPLETED_DIR_MODE_CATEGORY)} /></div>;
}

function ModeButton(props: { readonly active: boolean; readonly label: string; readonly onClick: () => void }) {
  return <button aria-pressed={props.active} className={`min-h-9 rounded-md px-3 font-medium ${props.active ? 'bg-white text-ink' : 'text-slate-500'}`} onClick={props.onClick} type="button">{props.label}</button>;
}

function TelegramTestPanel({ chatId, hasUnsavedChanges }: { readonly chatId: string; readonly hasUnsavedChanges: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function sendTest() {
    setError(null);
    setMessage(null);
    if (hasUnsavedChanges) {
      setError('请先保存 Bot Token');
      return;
    }
    setIsSending(true);
    try {
      const result = await client.testTelegram();
      setMessage(result.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="border-t border-line pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{chatId.trim() ? `已绑定 ${chatId}` : '未绑定'}</p>
        <button aria-label="检查 Telegram 连接" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-60" disabled={isSending} onClick={() => void sendTest()} type="button"><Send size={16} /></button>
      </div>
      {message ? <p className="mt-2 text-sm text-emerald-700" role="status">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-danger" role="alert">{error}</p> : null}
    </section>
  );
}

function mapSettings(items: SettingItem[]): Record<string, string> {
  return items.reduce<Record<string, string>>((acc, item) => { acc[item.key] = item.value ?? ''; return acc; }, {});
}
