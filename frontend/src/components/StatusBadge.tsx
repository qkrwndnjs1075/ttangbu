const STATUS_LABELS: Record<string, string> = {
  active: '활성',
  inactive: '비활성',
  rented: '임대됨',
  pending: '대기중',
  approved: '승인됨',
  rejected: '거절됨',
  cancelled: '취소됨',
  completed: '완료됨',
}

const STATUS_CLASSES: Record<string, string> = {
  active: 'status-active',
  inactive: 'status-inactive',
  rented: 'status-rented',
  pending: 'status-pending',
  approved: 'status-approved',
  rejected: 'status-rejected',
  cancelled: 'status-cancelled',
  completed: 'status-completed',
}

export function getStatusLabel(status: string | null): string {
  if (status === null) {
    return '신규'
  }
  return STATUS_LABELS[status] || status
}

export function getStatusClass(status: string): string {
  return STATUS_CLASSES[status] || ''
}

interface StatusBadgeProps {
  status: string
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge ${getStatusClass(status)}`}>
      {getStatusLabel(status)}
    </span>
  )
}
