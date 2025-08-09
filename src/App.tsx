

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { QRCodeCanvas } from 'qrcode.react';
import { ConnectionStatus, LogEntry, Player, PlayerRole, GameMessage, PeerError } from './types';
import QrScanner from './components/QrScanner';

const PEER_SERVER_URL = import.meta.env.VITE_PEER_SERVER_URL;
const MAX_PLAYERS = 6;

const StatusIndicator: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
  const statusConfig = {
    [ConnectionStatus.INITIALIZING]: { text: 'Initializing...', color: 'bg-gray-500' },
    [ConnectionStatus.CONNECTING]: { text: 'Connecting...', color: 'bg-yellow-500' },
    [ConnectionStatus.CONNECTED]: { text: 'Ready', color: 'bg-green-500' },
    [ConnectionStatus.DISCONNECTED]: { text: 'Disconnected', color: 'bg-gray-600' },
    [ConnectionStatus.ERROR]: { text: 'Connection Error', color: 'bg-red-500' },
    [ConnectionStatus.IN_ROOM]: { text: 'In Room', color: 'bg-blue-500' },
  };
  const config = statusConfig[status] || statusConfig[ConnectionStatus.ERROR];
  return (
    <div className="flex items-center space-x-2 p-2 bg-slate-700 rounded-lg">
      <span className={`w-3 h-3 rounded-full ${config.color} animate-pulse`}></span>
      <span className="text-sm font-medium">{config.text}</span>
    </div>
  );
};

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.INITIALIZING);
  const [peerId, setPeerId] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [message, setMessage] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isQrVisible, setIsQrVisible] = useState(false);
  const [isScannerVisible, setIsScannerVisible] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${type.toUpperCase()}] ${timestamp}: ${message}`);
    setLogs(prev => [{ timestamp, message, type }, ...prev].slice(0, 100));
  }, []);

  const broadcastMessage = useCallback((message: GameMessage, senderIdToExclude?: string) => {
    addLog(`Broadcasting message type: ${message.type}`, 'system');
    connectionsRef.current.forEach((conn, peerId) => {
      if (peerId !== senderIdToExclude) {
        conn.send(message);
      }
    });
  }, [addLog]);

  const handleLeaveRoom = useCallback(() => {
    addLog('Leaving the room.', 'system');
    connectionsRef.current.forEach(conn => conn.close());
    connectionsRef.current.clear();
    setRole(null);
    setPlayers([]);
    setRoomCode('');
    setStatus(ConnectionStatus.CONNECTED);
  }, [addLog]);

  const handleDataReceivedAsClient = useCallback((message: GameMessage) => {
    switch (message.type) {
      case 'PLAYER_LIST_UPDATE':
        setPlayers(message.payload.players);
        addLog('Player list updated by host.', 'system');
        break;
      case 'CHAT_MESSAGE':
        addLog(`[${message.payload.senderId.slice(0, 6)}]: ${message.payload.text}`, 'info');
        break;
      case 'ROOM_FULL':
        addLog('Could not join: The room is full.', 'error');
        handleLeaveRoom();
        break;
      default:
        addLog(`Received unhandled message type: ${message.type}`, 'system');
    }
  }, [addLog, handleLeaveRoom]);

  const setupConnectionListeners = useCallback((conn: DataConnection) => {
    conn.on('data', (data) => {
      const message = data as GameMessage;
      if (role === 'host') {
        if (message.type === 'CHAT_MESSAGE') {
          message.payload.senderId = conn.peer;
          addLog(`[${conn.peer.slice(0, 6)}]: ${message.payload.text}`, 'info');
          broadcastMessage(message, conn.peer);
        }
      } else {
        // Clients handle all their data here
        handleDataReceivedAsClient(message);
      }
    });

    conn.on('close', () => {
      addLog(`Connection with ${conn.peer} closed.`, 'system');
      if (role === 'host') {
        connectionsRef.current.delete(conn.peer);
        setPlayers(prevPlayers => {
          const remainingPlayers = prevPlayers.filter(p => p.id !== conn.peer);
          broadcastMessage({
            type: 'PLAYER_LIST_UPDATE',
            payload: { players: remainingPlayers },
          });
          return remainingPlayers;
        });
      } else {
        addLog('Disconnected from host. Returning to lobby.', 'error');
        handleLeaveRoom();
      }
    });

    conn.on('error', (err: PeerError) => {
      addLog(`Connection error with ${conn.peer}: ${err.type} ${err.message}`, 'error');
    });
  }, [role, addLog, broadcastMessage, handleLeaveRoom, handleDataReceivedAsClient]);

  const handleSendMessage = useCallback(() => {
    if (!message.trim() || !role) {
      return;
    }

    const chatMessage: GameMessage = {
      type: 'CHAT_MESSAGE',
      payload: {
        senderId: peerId,
        text: message,
      },
    };

    if (role === 'host') {
      addLog(`[You]: ${message}`, 'info');
      broadcastMessage(chatMessage);
    } else {
      // Client sends to host, host will broadcast
      const hostConnection = connectionsRef.current.values().next().value;
      if (hostConnection) {
        hostConnection.send(chatMessage);
        // Optimistically add to own log. Host won't echo it back to sender.
        addLog(`[You]: ${message}`, 'info');
      } else {
        addLog('Cannot send message: Not connected to host.', 'error');
      }
    }

    setMessage(''); // Clear input after sending
  }, [message, role, peerId, addLog, broadcastMessage]);

  useEffect(() => {
    if (!PEER_SERVER_URL) {
      addLog('CRITICAL: VITE_PEER_SERVER_URL is not set.', 'error');
      setStatus(ConnectionStatus.ERROR);
      return;
    }
    addLog('Attempting to connect to signaling server...', 'system');
    setStatus(ConnectionStatus.CONNECTING);
    const peer = new Peer({
      host: PEER_SERVER_URL, path: '/peerjs', secure: true, port: 443, debug: 2,
    });
    peerRef.current = peer;

    peer.on('open', (id) => {
      addLog(`Connected to signaling server. My ID: ${id}`, 'success');
      setPeerId(id);
      setStatus(ConnectionStatus.CONNECTED);
    });
    peer.on('error', (err: PeerError) => {
      addLog(`PeerJS error: ${err.type} - ${err.message}`, 'error');
      if (err.type === 'peer-unavailable') {
        addLog(`Could not find host with code: ${roomCode}. Please check code.`, 'error');
        setRole(null);
      } else {
        setStatus(ConnectionStatus.ERROR);
      }
    });
    peer.on('disconnected', () => {
      addLog('Disconnected from signaling server. Reconnecting...', 'system');
      setStatus(ConnectionStatus.CONNECTING);
      peer.reconnect();
    });
    peer.on('connection', (conn) => {
      if (role !== 'host') {
        addLog(`Incoming connection from ${conn.peer} ignored: not a host.`, 'system');
        conn.close();
        return;
      }
      if (players.length >= MAX_PLAYERS) {
        addLog(`Connection from ${conn.peer} rejected: room full.`, 'system');
        conn.on('open', () => conn.send({ type: 'ROOM_FULL', payload: {} }));
        setTimeout(() => conn.close(), 100);
        return;
      }
      addLog(`Incoming connection request from ${conn.peer}`, 'info');
      conn.on('open', () => {
        addLog(`Data connection established with client: ${conn.peer}`, 'success');
        connectionsRef.current.set(conn.peer, conn);
        setPlayers(prevPlayers => {
          const newPlayer: Player = { id: conn.peer, role: 'client' };
          const updatedPlayers = [...prevPlayers, newPlayer];
          const updateMessage: GameMessage = { type: 'PLAYER_LIST_UPDATE', payload: { players: updatedPlayers } };
          conn.send(updateMessage);
          broadcastMessage(updateMessage, conn.peer);
          return updatedPlayers;
        });
        setupConnectionListeners(conn);
      });
    });
    return () => { peer.destroy(); };
  }, [addLog, role, roomCode, players.length, setupConnectionListeners]);

  const handleCreateRoom = () => {
    setRole('host');
    const hostPlayer: Player = { id: peerId, role: 'host' };
    setPlayers([hostPlayer]);
    setStatus(ConnectionStatus.IN_ROOM);
    addLog(`Room created. You are the host. Room Code: ${peerId}`, 'success');
  };

  const joinRoomByCode = (code: string) => {
    if (!code) {
      addLog('Please enter a room code.', 'error');
      return;
    }
    if (!peerRef.current || peerRef.current.disconnected) {
      addLog('PeerJS not initialized.', 'error');
      return;
    }
    if (code === peerId) {
      addLog('You cannot join your own room.', 'error');
      return;
    }
    addLog(`Attempting to join room with code: ${code}`, 'info');
    setRole('client');
    const conn = peerRef.current.connect(code, { reliable: true });
    conn.on('open', () => {
      addLog(`Data connection established with host: ${code}`, 'success');
      setStatus(ConnectionStatus.IN_ROOM);
      connectionsRef.current.set(code, conn);
      setupConnectionListeners(conn);
    });
  };

  const handleScanSuccess = (decodedText: string) => {
    addLog(`QR Code scanned successfully`, 'success');
    setRoomCode(decodedText);
    setIsScannerVisible(false);
    setTimeout(() => joinRoomByCode(decodedText), 100);
  };

  const renderLobby = () => (
    <div className="flex flex-col space-y-4 w-full">
      <h2 className="text-xl font-bold text-center">Multiplayer Lobby</h2>
      <button onClick={handleCreateRoom} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition">Create Game Room</button>
      <div className="relative flex items-center pt-2 pb-2">
        <div className="flex-grow border-t border-slate-600"></div><span className="flex-shrink mx-4 text-slate-400">OR</span><div className="flex-grow border-t border-slate-600"></div>
      </div>
      <div className="flex flex-col space-y-2">
        <input type="text" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} placeholder="Enter Room Code" className="w-full p-3 rounded-md bg-slate-700 text-white placeholder-slate-400 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500"/>
        <div className="flex space-x-2">
            <button onClick={() => joinRoomByCode(roomCode)} disabled={!roomCode.trim()} className="flex-grow bg-teal-600 hover:bg-teal-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition">Join Game</button>
            <button onClick={() => setIsScannerVisible(true)} className="bg-slate-600 hover:bg-slate-500 text-white font-bold p-3 rounded-lg transition">Scan QR</button>
        </div>
      </div>
    </div>
  );

  const renderGameRoom = () => (
    <div className="flex flex-col w-full space-y-4">
      <div className="flex justify-between items-center"><h2 className="text-xl font-bold">Game Room</h2><button onClick={handleLeaveRoom} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-sm">Leave</button></div>
      {role === 'host' && (
        <div className="text-center bg-slate-900 p-3 rounded-lg">
          <p className="text-slate-400">Share this room code:</p>
          <p className="text-lg font-mono text-teal-400 break-all cursor-pointer" onClick={() => navigator.clipboard.writeText(peerId)} title="Click to copy">{peerId}</p>
          <button onClick={() => setIsQrVisible(!isQrVisible)} className="mt-2 text-sm bg-teal-800 hover:bg-teal-700 text-white py-1 px-3 rounded-md">{isQrVisible ? 'Hide' : 'Show'} QR</button>
          {isQrVisible && <div className="bg-white p-4 mt-4 inline-block rounded-lg"><QRCodeCanvas value={peerId} size={128} /></div>}
        </div>
      )}
      <div className="bg-slate-700 p-4 rounded-lg"><h3 className="font-bold mb-2">Players ({players.length}/{MAX_PLAYERS})</h3><ul className="space-y-1">
        {players.map(p => (<li key={p.id} className="flex items-center space-x-2 text-sm"><span className={`w-2 h-2 rounded-full ${p.role === 'host' ? 'bg-yellow-400' : 'bg-green-400'}`}></span><span className="font-mono">{p.id.slice(0, 12)}...</span>{p.id === peerId && <span className="text-xs text-slate-400">(You)</span>}{p.role === 'host' && <span className="text-xs text-yellow-400 font-bold">(Host)</span>}</li>))}</ul>
      </div>
      <div className="flex-grow flex flex-col space-y-2"><h3 className="font-bold">Chat</h3><div className="flex space-x-2">
        <input type="text" value={message} onChange={(e) => setMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Type a message..." className="flex-grow p-3 rounded-md bg-slate-700 text-white placeholder-slate-400 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        <button onClick={handleSendMessage} disabled={!role} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg">Send</button>
      </div></div>
    </div>
  );

  const renderContent = () => {
    if (status === ConnectionStatus.ERROR && !role) return <div className="text-center text-red-400">Failed to connect. Check logs and env variables, then refresh.</div>
    if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.DISCONNECTED) return renderLobby();
    if (status === ConnectionStatus.IN_ROOM && role) return renderGameRoom();
    return <div className="text-center">Connecting...</div>;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center p-4 font-sans">
      {isScannerVisible && <QrScanner onScanSuccess={handleScanSuccess} onCancel={() => setIsScannerVisible(false)} />}
      <div className="w-full max-w-2xl mx-auto bg-slate-800 rounded-xl shadow-2xl flex flex-col">
        <header className="p-4 border-b border-slate-700 flex justify-between items-center"><h1 className="text-2xl font-bold text-white">WebRTC Multi-Player Tester</h1><StatusIndicator status={status} /></header>
        <main className="p-6 flex-grow flex items-center justify-center min-h-[30rem]">{renderContent()}</main>
        <section className="bg-slate-950 p-4 border-t border-slate-700 rounded-b-xl"><h3 className="text-lg font-semibold mb-2">Event Log</h3><div className="h-48 overflow-y-auto bg-black p-3 rounded-md font-mono text-sm space-y-1">
          {logs.length === 0 ? <p className="text-slate-500">No events yet...</p> : logs.map((log, index) => (<div key={index} className={`flex items-start ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : log.type === 'system' ? 'text-sky-400' : 'text-slate-300'}`}><span className="w-24 flex-shrink-0">{log.timestamp}</span><span className="flex-grow break-all">{log.message}</span></div>))}
        </div></section>
      </div>
      <footer className="text-center text-slate-500 mt-4 text-xs">{PEER_SERVER_URL && <p>Signaling Server: {PEER_SERVER_URL}</p>}</footer>
    </div>
  );
}