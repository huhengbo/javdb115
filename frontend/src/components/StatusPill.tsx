type Props = {
  value: string;
};

const toneByStatus: Record<string, string> = {
  failed: 'bg-red-50 text-danger ring-red-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  downloading: 'bg-blue-50 text-blue-700 ring-blue-200',
  submitted: 'bg-teal-50 text-brand ring-teal-200',
  skipped: 'bg-amber-50 text-warn ring-amber-200'
};

const labelByStatus: Record<string, string> = {
  completed: '已完成',
  downloading: '下载中',
  failed: '失败',
  skipped: '已跳过',
  submitted: '已提交'
};

export function StatusPill({ value }: Props) {
  const tone = toneByStatus[value] ?? 'bg-slate-100 text-slate-700 ring-slate-200';
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${tone}`}>
      {labelByStatus[value] ?? value}
    </span>
  );
}
