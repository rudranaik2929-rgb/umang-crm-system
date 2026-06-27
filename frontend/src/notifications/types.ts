export type NotificationType =
  | 'lead_assigned'
  | 'lead_reassigned_removed'
  | 'lead_updated'
  | 'note_added'
  | 'manager_comment'
  | 'facebook_lead'
  | 'housing_lead'
  | 'follow_up_reminder'
  | 'follow_up_overdue'
  | 'lead_closed'
  | 'lead_won'
  | 'lead_lost'
  | 'broadcast'
  | 'system'
  | 'workflow';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface CrmNotification {
  notification_id: string;
  user_id: string;
  sender_id?: string | null;
  lead_id?: string | null;
  type: NotificationType | string;
  title: string;
  message: string;
  priority?: NotificationPriority | string;
  metadata?: Record<string, unknown>;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  items: CrmNotification[];
  total: number;
  unread_count: number;
  limit: number;
  offset: number;
}

export interface NotificationPreferences {
  lead_assigned: boolean;
  lead_updated: boolean;
  comments: boolean;
  housing_leads: boolean;
  facebook_leads: boolean;
  reminders: boolean;
  marketing: boolean;
  system_alerts: boolean;
  push_enabled: boolean;
}

export type NotificationFilter =
  | 'all'
  | 'unread'
  | 'read'
  | 'assignments'
  | 'lead_updates'
  | 'comments'
  | 'facebook'
  | 'housing'
  | 'system';

export const FILTER_TYPE_MAP: Partial<Record<NotificationFilter, string>> = {
  assignments: 'lead_assigned',
  lead_updates: 'lead_updated',
  comments: 'note_added',
  facebook: 'facebook_lead',
  housing: 'housing_lead',
  system: 'broadcast',
};

export const TYPE_ICONS: Record<string, string> = {
  lead_assigned: 'home-outline',
  lead_reassigned_removed: 'remove-circle-outline',
  lead_updated: 'sync-outline',
  note_added: 'document-text-outline',
  manager_comment: 'chatbubble-ellipses-outline',
  facebook_lead: 'logo-facebook',
  housing_lead: 'business-outline',
  follow_up_reminder: 'alarm-outline',
  follow_up_overdue: 'warning-outline',
  lead_closed: 'checkmark-circle-outline',
  lead_won: 'trophy-outline',
  lead_lost: 'close-circle-outline',
  broadcast: 'megaphone-outline',
  system: 'notifications-outline',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: '#94A3B8',
  normal: '#3B82F6',
  high: '#F59E0B',
  urgent: '#EF4444',
};
