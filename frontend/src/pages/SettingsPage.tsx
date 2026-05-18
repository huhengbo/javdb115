import { Send, Save } from 'lucide-react';
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

const directorySettings = [
  ['p115_download_dir_id', 'p115_download_dir_label', '115 下载临时目录'],
  ['p115_completed_dir_id', 'p115_completed_dir_label', '115 整理完成目录']
] as const;

const telegramConnectionKeys = ['telegram_bot_token'] as const;

const settingKeys = [
  ['p115_cookie', '115 Cookie', false],
  ['telegram_bot_token', 'Telegram Bot Token', true],
  ['telegram_chat_id', 'Telegram Chat ID（可空）', false],
  ['check_cron', '检查 Cron', false],
  ['filter_rules', '过滤规则 JSON', false],
  ['p115_download_dir_id', '115 下载临时目录 ID', false],
  ['p115_download_dir_label', '115 下载临时目录名称', false],
  ['p115_completed_dir_id', '115 整理完成目录 ID', false],
  ['p115_completed_dir_label', '115 整理完成目录名称', false]
] as const;

type SettingsLoadState = {
  readonly setError: (message: string | null) => void;
  readonly setHasLoaded: (value: boolean) => void;
  readonly setIsLoading: (value: boolean) => void;
  readonly setSavedValues: (values: Record<string, string>) => void;
  readonly setValues: (values: Record<string, string>) => void;
};

export function SettingsPage() {
  const form = useSettingsForm();

  return (
    <section>
      <SettingsHeader isDisabled={!form.hasLoaded || form.isSaving} isSaving={form.isSaving} onSave={form.save} />
      <SettingsFeedback error={form.error} isLoading={form.isLoading} message={form.message} />
      <div className="mt-4 space-y-3">
        <SettingsGroup title="115 账号" caption="Cookie 可手动填写，也可以通过扫码登录自动写入。">
          <CookieField values={form.values} onChange={form.setValue} />
          <P115QrLoginPanel onSuccess={form.reload} />
        </SettingsGroup>
        <SettingsGroup title="目录" caption="选择 115 下载临时目录和整理完成目录。">
          <DirectorySettings form={form} />
        </SettingsGroup>
        <SettingsGroup title="订阅检查" caption="默认每 6 小时检查一次，Cron 使用五段表达式。">
          <SingleLineField fieldKey="check_cron" label="检查 Cron" values={form.values} onChange={form.setValue} />
        </SettingsGroup>
        <SettingsGroup title="Telegram" caption="Bot Token 必填；Chat ID 可为空，发送 /start 后会自动绑定。">
          <TelegramFields values={form.values} onChange={form.setValue} />
          <TelegramTestPanel chatId={form.values.telegram_chat_id ?? ''} hasUnsavedChanges={form.hasUnsavedTelegramSettings} />
        </SettingsGroup>
        <SettingsGroup title="高级过滤规则" caption="用于自动挑选磁力，保存后后续检查会使用新规则。">
          <FilterRulesEditor value={form.values.filter_rules ?? ''} onChange={(value) => form.setValue('filter_rules', value)} />
        </SettingsGroup>
      </div>
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
  const hasUnsavedTelegramSettings = telegramConnectionKeys.some((key) => values[key] !== savedValues[key]);

  useEffect(() => {
    void loadSettings({ setError, setHasLoaded, setIsLoading, setSavedValues, setValues });
  }, []);

  async function reload() {
    setError(null);
    setIsLoading(true);
    await loadSettings({ setError, setHasLoaded, setIsLoading, setSavedValues, setValues });
  }

  async function save() {
    setError(null);
    setMessage(null);
    setIsSaving(true);
    const items = settingKeys.map(([key, , secret]) => ({ key, value: values[key] ?? '', is_secret: secret }));
    try {
      await client.saveSettings(items);
      setMessage('已保存');
      setSavedValues(values);
      setDirectoryReloadKey((current) => current + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  function setValue(key: string, value: string) {
    setMessage(null);
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setDirectory(idKey: string, labelKey: string, selection: DirectorySelection) {
    setMessage(null);
    setValues((current) => ({ ...current, [idKey]: selection.id, [labelKey]: selection.label }));
  }

  return {
    directoryReloadKey,
    error,
    hasLoaded,
    hasUnsavedTelegramSettings,
    isLoading,
    isSaving,
    message,
    reload,
    save,
    setDirectory,
    setValue,
    values
  };
}

async function loadSettings(state: SettingsLoadState) {
  await client.settings()
    .then((items) => {
      const values = mapSettings(items);
      state.setValues(values);
      state.setSavedValues(values);
      state.setHasLoaded(true);
    })
    .catch((err: Error) => state.setError(err.message))
    .finally(() => state.setIsLoading(false));
}

type SettingsForm = ReturnType<typeof useSettingsForm>;

type SettingsHeaderProps = {
  readonly isDisabled: boolean;
  readonly isSaving: boolean;
  readonly onSave: () => Promise<void>;
};

function SettingsHeader({ isDisabled, isSaving, onSave }: SettingsHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-ink">设置</h1>
        <p className="mt-1 text-sm text-slate-600">凭据、规则、定时和 115 目录</p>
      </div>
      <button className="flex min-h-11 items-center gap-2 rounded-md bg-brand px-3 text-white disabled:opacity-60" disabled={isDisabled} onClick={onSave} type="button">
        <Save size={18} />
        {isSaving ? '保存中' : '保存'}
      </button>
    </div>
  );
}

function SettingsFeedback({ error, isLoading, message }: { readonly error: string | null; readonly isLoading: boolean; readonly message: string | null }) {
  if (isLoading) {
    return <p className="mt-3 rounded-md border border-line bg-white p-3 text-sm text-slate-600">设置加载中...</p>;
  }
  return (
    <>
      {message ? <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
    </>
  );
}

function DirectorySettings({ form }: { readonly form: SettingsForm }) {
  return directorySettings.map(([idKey, labelKey, label]) => (
    <DirectoryPicker
      key={idKey}
      label={label}
      reloadKey={form.directoryReloadKey}
      selectedLabel={form.values[labelKey] ?? ''}
      value={form.values[idKey] ?? ''}
      onChange={(selection) => form.setDirectory(idKey, labelKey, selection)}
    />
  ));
}

function TelegramTestPanel({
  chatId,
  hasUnsavedChanges
}: {
  readonly chatId: string;
  readonly hasUnsavedChanges: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function sendTest() {
    setError(null);
    setMessage(null);
    if (hasUnsavedChanges) {
      setError('请先保存 Telegram Bot Token 后再检查连接');
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
    <section className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-ink">Telegram 连接</h2>
          <p className="mt-1 text-xs text-slate-500">检查 Bot Token，并自动写入命令菜单；发送 /start 绑定通知</p>
          <p className="mt-1 text-xs text-slate-500">绑定状态：{chatId.trim() ? `已绑定 ${chatId}` : '未绑定'}</p>
        </div>
        <button
          className="flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-ink disabled:opacity-60"
          disabled={isSending}
          onClick={sendTest}
          type="button"
        >
          <Send size={16} />
          {isSending ? '检查中' : '检查连接'}
        </button>
      </div>
      {message ? <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
    </section>
  );
}

function mapSettings(items: SettingItem[]): Record<string, string> {
  return items.reduce<Record<string, string>>((acc, item) => {
    acc[item.key] = item.value ?? '';
    return acc;
  }, {});
}
