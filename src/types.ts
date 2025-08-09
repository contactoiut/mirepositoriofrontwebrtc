import { PeerError as PeerJsError, PeerErrorType } from 'peerjs';

export enum ConnectionStatus {
  INITIALIZING = 'INITIALIZING',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED', // Connected to signaling server, in lobby
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR',
  IN_ROOM = 'IN_ROOM', // Connected to peers in a room
}

export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'system';
}

export type PlayerRole = 'host' | 'client';

export interface Player {
  id: string;
  role: PlayerRole;
}

// A standardized structure for all messages sent between peers
export interface GameMessage {
  type: 'CHAT_MESSAGE' | 'PLAYER_JOINED' | 'PLAYER_LEFT' | 'WELCOME' | 'ROOM_FULL' | 'GAME_UPDATE';
  payload: any;
}

// Create a concrete, non-generic type alias for PeerError.
// By defining it with `string`, it becomes compatible with all PeerJS error events,
// including those on Peer and DataConnection, which use different error type sets.
export type PeerError = PeerJsError<string>;