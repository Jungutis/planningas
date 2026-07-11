export type LineId = 'smt4' | 'qlab' | 'xray';
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
  | { type: 'blocker_upserted'; blocker: Blocker }
  | { type: 'blocker_deleted'; id: string };
