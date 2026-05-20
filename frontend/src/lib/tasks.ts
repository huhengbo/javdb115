import type { Task } from '../types';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export const stageLabels: Record<string, string> = {
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
  manual_115_resubmitted: '手动重试已提交 115',
  manual_115_submitted: '手动提交 115'
};

export const statusLabels: Record<string, string> = {
  completed: '已完成',
  downloading: '下载中',
  failed: '失败',
  pending: '等待中',
  submitted: '已提交'
};

export function taskStageLabel(stage: string): string {
  return stageLabels[stage] ?? stage;
}

export function taskStatusLabel(status: string): string {
  return statusLabels[status] ?? status;
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
