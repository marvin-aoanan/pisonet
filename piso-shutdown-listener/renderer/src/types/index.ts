export interface Timer {
  unit_id: number;
  remaining_seconds: number;
  total_revenue: number;
  last_updated: string;
}

export interface Unit {
  id: number;
  name: string;
  status: 'idle' | 'active' | 'warning' | 'disconnected';
  totalSeconds: number;
  revenue: number;
  intervalId: NodeJS.Timeout | null;
  warningShown: boolean;
}

export interface PCConfig {
  ip: string;
  method: 'windows-remote' | 'ssh' | 'local';
  username?: string;
  password?: string;
}

export interface ElectronAPI {
  simulateCoin: (unitId: number, coinValue: number) => void;
  getTimers: () => Promise<Timer[]>;
  updateTimer: (unitId: number, remainingSeconds: number, totalRevenue: number) => Promise<void>;
  relayOn: (unitId: number) => Promise<{ success: boolean; error?: string }>;
  relayOff: (unitId: number) => Promise<{ success: boolean; error?: string }>;
  shutdownPC: (unitId: number) => Promise<{ success: boolean; error?: string }>;
  getRevenueToday: () => Promise<number>;
  getRevenueAll: () => Promise<number>;
  getSessionsToday: () => Promise<number>;
  login: (password: string) => Promise<{ success: boolean }>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  getAllTransactions: (dateFrom: string, dateTo: string) => Promise<Array<{
    id: number;
    unitId: number;
    coinValue: number;
    insertedAt: string;
  }>>;
  configurePC: (unitId: number, config: PCConfig) => Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
