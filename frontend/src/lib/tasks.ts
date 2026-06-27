import type { Task } from '../types';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export const stageLabels: Record<string, string> = {
  created: '已创建',
  '115_downloading': '115 下载中',
  '115_download_failed': '115 下载失败',
  '115_organized': '已自动整理',
  '115_organize_failed': '整理失败',
  '115_organizing': '正在整理',
  '115_submitted': '已提交 115',
  '115_submit_failed': '115 提交失败',
  '115_task_missing': '115 任务不存在',
  duplicate_active: '发现重复进行中任务',
  duplicate_completed: '发现已完成任务',
  follow_check_failed: '关注检查失败',
  javdb_movie_failed: '作品信息获取失败',
  manual_115_resubmitted: '手动重试已提交 115',
  manual_115_submitted: '手动提交 115'
};

export const statusLabels: Record<string, string> = {
  completed: '已完成',
  downloading: '下载中',
  failed: '失败',
  organizing: '整理中',
  pending: '等待中',
  submitted: '已提交'
};

export type TaskIssueKind =
  | 'none'
  | 'submit_failed'
  | 'download_failed'
  | 'organize_failed'
  | 'directory_error'
  | 'missing_video'
  | 'incomplete_submit'
  | 'javdb_failed';

const SUBMIT_FAILED_STAGES = new Set(['115_submit_failed']);
const DOWNLOAD_FAILED_STAGES = new Set(['115_download_failed', '115_task_missing']);
const JAVDB_FAILED_STAGES = new Set(['follow_check_failed', 'javdb_movie_failed']);

export function taskStageLabel(stage: string): string {
  return stageLabels[stage] ?? stage;
}

export function taskStatusLabel(status: string): string {
  return statusLabels[status] ?? status;
}

export function taskIssueKind(task: Task): TaskIssueKind {
  if (task.stage === '115_submit_incomplete') {
    return 'incomplete_submit';
  }
  if (JAVDB_FAILED_STAGES.has(task.stage)) {
    return 'javdb_failed';
  }
  if (task.status !== 'failed') {
    return 'none';
  }
  if (hasMissingVideoError(task.error_message)) {
    return 'missing_video';
  }
  if (hasDirectoryError(task.error_message)) {
    return 'directory_error';
  }
  if (SUBMIT_FAILED_STAGES.has(task.stage)) {
    return 'submit_failed';
  }
  if (DOWNLOAD_FAILED_STAGES.has(task.stage)) {
    return 'download_failed';
  }
  if (task.stage === '115_organize_failed') {
    return 'organize_failed';
  }
  return 'none';
}

export function taskIssueLabel(task: Task): string {
  const labels: Record<TaskIssueKind, string> = {
    directory_error: '目录配置问题',
    download_failed: '115 下载失败',
    incomplete_submit: '提交未完成',
    javdb_failed: 'JAVDB 访问异常',
    missing_video: '未找到有效视频',
    none: '',
    organize_failed: '整理失败',
    submit_failed: '115 提交失败'
  };
  return labels[taskIssueKind(task)];
}

export function taskRecoveryHint(task: Task): string {
  const hints: Record<TaskIssueKind, string> = {
    directory_error: '检查 115 下载临时目录和整理完成目录是否匹配。',
    download_failed: '资源可能失效，可以重新选择磁力或手动重试。',
    incomplete_submit: '提交过程没有拿到 115 任务 ID，可以手动重试。',
    javdb_failed: '检查 JAVDB 访问健康后再重新检查关注。',
    missing_video: '离线目录里没有可整理的视频文件，需要确认 115 下载内容。',
    none: '',
    organize_failed: '确认 115 目录结构和主视频文件后再重试整理。',
    submit_failed: '115 离线提交失败，检查 Cookie 和 p115client 调用状态。'
  };
  return hints[taskIssueKind(task)];
}

export function taskProgressStep(task: Task): number {
  if (task.status === 'completed') {
    return 4;
  }
  if (task.status === 'organizing' || task.stage.includes('organize')) {
    return 3;
  }
  if (task.status === 'downloading' || task.stage.includes('download')) {
    return 2;
  }
  if (task.status === 'submitted' || task.stage.includes('submitted') || task.stage.includes('submit')) {
    return 1;
  }
  return 0;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '未知';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) {
    return '未知';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const diff = Date.now() - date.getTime();
  if (diff < MS_PER_MINUTE) {
    return '刚刚';
  }
  if (diff < MS_PER_HOUR) {
    return `${Math.floor(diff / MS_PER_MINUTE)} 分钟前`;
  }
  if (diff < MS_PER_DAY) {
    return `${Math.floor(diff / MS_PER_HOUR)} 小时前`;
  }
  return `${Math.floor(diff / MS_PER_DAY)} 天前`;
}

export function taskElapsed(task: Task): string {
  const created = new Date(task.created_at).getTime();
  const updated = new Date(task.updated_at).getTime();
  if (Number.isNaN(created) || Number.isNaN(updated)) {
    return '未知';
  }
  const diff = Math.max(0, updated - created);
  if (diff < MS_PER_MINUTE) {
    return '1 分钟内';
  }
  if (diff < MS_PER_HOUR) {
    return `${Math.ceil(diff / MS_PER_MINUTE)} 分钟`;
  }
  if (diff < MS_PER_DAY) {
    return `${Math.ceil(diff / MS_PER_HOUR)} 小时`;
  }
  return `${Math.ceil(diff / MS_PER_DAY)} 天`;
}

function hasDirectoryError(message: string | null): boolean {
  const normalized = message?.toLowerCase() ?? '';
  return normalized.includes('folder') || normalized.includes('directory') || normalized.includes('目录');
}

function hasMissingVideoError(message: string | null): boolean {
  const normalized = message?.toLowerCase() ?? '';
  return normalized.includes('no video') || normalized.includes('视频');
}
