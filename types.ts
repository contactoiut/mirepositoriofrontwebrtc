export enum ConnectionStatus {
  INITIALIZING = 'INITIALIZING',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR',
  SCANNING = 'SCANNING',
  CREATING = 'CREATING',
  JOINING = 'JOINING',
  PEER_CONNECTED = 'PEER_CONNECTED',
}

export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'system';
}