export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type LineId = string;
export type UserRole = 'Q' | 'LOG' | 'PROD';

export interface PlanningComment {
  id: string;
  text: string;
  author: string;
  role: UserRole;
  createdAt: string;
}

export interface PlanningOrder {
  id: string;
  partNumber: string;
  quantity: number;
  color: string;
  lineId: LineId | null;
  startTime: string | null;
  closed: boolean;
  comments: PlanningComment[];
  scrapPercent: number;
  createdAt: string;
  relatedOrderId?: string | null;
}

export interface LineConfig {
  id: LineId;
  name: string;
  cycleTimeSeconds: number;
}

export interface Blocker {
  id: string;
  lineId: LineId | null;
  startTime: string;
  endTime: string;
  label: string;
  color: string;
  createdAt: string;
}

export type WsMessage =
  | { type: 'full_state'; orders: PlanningOrder[]; lineConfigs: LineConfig[]; blockers: Blocker[] }
  | { type: 'order_upserted'; order: PlanningOrder }
  | { type: 'order_deleted'; id: string }
  | { type: 'line_config_updated'; lineConfig: LineConfig }
  | { type: 'line_config_created'; lineConfig: LineConfig }
  | { type: 'line_config_deleted'; id: string }
  | { type: 'blocker_upserted'; blocker: Blocker }
  | { type: 'blocker_deleted'; id: string };

export const ORDER_COLORS = [
  '#3b82f6', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b', '#6b7280',
];

export const BLOCKER_COLORS = [
  '#ef4444', '#f97316', '#6b7280', '#1e293b', '#7c3aed',
];
