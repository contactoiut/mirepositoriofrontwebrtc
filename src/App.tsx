import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { QRCodeCanvas } from 'qrcode.react';
import { ConnectionStatus, LogEntry } from './types';
import QrScannerComponent from './components/QrScanner';

// The server URL is now read from the environment variable provided by Vite.
// This variable MUST be set in your Netlify deployment environment.
const PEER_SERVER_URL = import.meta.env.VITE_PEER_SERVER_URL;

// Helper component for status indicator
const StatusIndicator: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
  const statusConfig = {
    [ConnectionStatus.INITIALIZING]: { text: 'Initializing...', color: 'bg-gray-500' },
    [ConnectionStatus.CONNECTING]: { text: 'Connecting to Server...', color: 'bg-yellow-500' },
    [ConnectionStatus.CONNECTED]: { text: 'Connected to Server', color: 'bg-green-500' },
    [ConnectionStatus.DISCONNECTED]: { text: 'Disconnected', color: 'bg-gray-600' },
    [ConnectionStatus.ERROR]: { text: 'Connection Error', color: 'bg-red-500' },
    [ConnectionStatus.CREATING]: { text: 'Creating Room...', color: 'bg-blue-500' },
    [ConnectionStatus.SCANNING]: { text: 'Scanning QR Code...', color: 'bg-blue-500' },
    [ConnectionStatus.JOINING]: { text: 'Joining Room...', color: 'bg-purple-500' },
    [ConnectionStatus.PEER_CONNECTED]: { text: 'Peer Connected', color: 'bg-teal-500' },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center space-x-2 p-2 bg-gray-800 rounded-lg">
      <span className={`w-3 h-3 rounded-full ${config.color}`}></span>
      <span className="text-sm font-medium">{config.text}</span>
    </div>
  );
};

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.INITIALIZING);
  const [peerId, setPeerId] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  
  const [view, setView] = useState<'home' | 'create' | 'join' | 'config_error'>('home');

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${type.toUpperCase()}] ${timestamp}: ${message}`);
    setLogs(prev => [{ timestamp, message, type }, ...prev]);
  }, []);

  useEffect(() => {
    if (!PEER_SERVER_URL) {
      addLog('CRITICAL: Environment variable VITE_PEER_SERVER_URL is not set.', 'error');
      addLog('Please set this variable in your .env file for local development or in your Netlify deployment settings.', 'error');
      setStatus(ConnectionStatus.ERROR);
      setView('config_error');
      return;
    }

    let peer: Peer | null = null;
    
    const initialize = async () => {
        addLog('App component mounted.', 'system');

        // --- Diagnostic Health Check ---
        const serverHttpUrl = `https://${PEER_SERVER_URL}`;
        addLog(`Pinging server health check at: ${serverHttpUrl}`, 'system');
        try {
            const response = await fetch(serverHttpUrl);
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status} ${response.statusText}`);
            }
            const text = await response.text();
            addLog(`Server health check successful: "${text}"`, 'success');
        } catch (error: any) {
            addLog(`Server health check FAILED. The server at '${PEER_SERVER_URL}' is not reachable.`, 'error');
            addLog(`Error details: ${error.message}`, 'error');
            addLog('CRITICAL: Please verify the VITE_PEER_SERVER_URL is correct and the Render backend is running.', 'error');
            setStatus(ConnectionStatus.ERROR);
            return; // Abort initialization
        }

        // --- Initialize PeerJS (only if health check passes) ---
        addLog(`Attempting to connect to signaling server at: ${PEER_SERVER_URL}`, 'system');
        setStatus(ConnectionStatus.CONNECTING);

        peer = new Peer({
            host: PEER_SERVER_URL,
            path: '/peerjs',
            secure: true,
            port: 443,
            debug: 2,
        });
        peerRef.current = peer;

        peer.on('open', (id) => {
          addLog(`Connection to signaling server successful. My ID: ${id}`, 'success');
          setPeerId(id);
          setStatus(ConnectionStatus.CONNECTED);
        });

        peer.on('error', (err) => {
          if (err.type === 'peer-unavailable') {
             addLog(`Could not find peer with the specified ID. They might be offline.`, 'error');
          } else {
             addLog(`PeerJS error: ${err.type} - ${err.message}`, 'error');
          }
          setStatus(ConnectionStatus.ERROR);
        });

        peer.on('disconnected', () => {
          addLog('Disconnected from signaling server. Attempting to reconnect...', 'system');
          setStatus(ConnectionStatus.DISCONNECTED);
        });

        peer.on('connection', (conn) => {
          addLog(`Incoming connection from ${conn.peer}`, 'info');
          connRef.current = conn;
          setStatus(ConnectionStatus.PEER_CONNECTED);
          setupConnectionListeners(conn);
        });
    };
    
    initialize();

    return () => {
      if (peerRef.current) {
        addLog('Cleaning up PeerJS instance.', 'system');
        peerRef.current.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog]);

  const setupConnectionListeners = (conn: DataConnection) => {
    conn.on('open', () => {
      addLog(`Data connection established with ${conn.peer}. Ready to chat!`, 'success');
      setView('home');
      conn.send(`Hello from ${peerId}!`);
    });

    conn.on('data', (data) => {
      addLog(`Data received from ${conn.peer}: ${data}`, 'info');
    });

    conn.on('close', () => {
      addLog(`Connection with ${conn.peer} closed.`, 'system');
      connRef.current = null;
      setStatus(ConnectionStatus.CONNECTED); // Revert to server connected status
    });

    conn.on('error', (err) => {
      addLog(`Connection error with ${conn.peer}: ${err.message}`, 'error');
    });
  };

  const handleCreateRoom = () => {
    if (status === ConnectionStatus.CONNECTED) {
      addLog('"Create Room" clicked. Displaying QR code.', 'system');
      setView('create');
      setStatus(ConnectionStatus.CREATING);
    } else {
      addLog('Cannot create room, not connected to signaling server.', 'error');
    }
  };

  const handleJoinRoom = () => {
    addLog('"Join Room" clicked. Initializing QR scanner.', 'system');
    setView('join');
    setStatus(ConnectionStatus.SCANNING);
  };

  const handleQrScanSuccess = (scannedId: string) => {
    addLog(`QR code scanned successfully. Peer ID: ${scannedId}`, 'success');
    setStatus(ConnectionStatus.JOINING);
    
    if (!peerRef.current) {
        addLog('PeerJS instance not available.', 'error');
        setStatus(ConnectionStatus.ERROR);
        return;
    }
    try {
        addLog(`Attempting to connect to peer: ${scannedId}`, 'info');
        const conn = peerRef.current.connect(scannedId, { reliable: true });
        connRef.current = conn;
        setupConnectionListeners(conn);
    } catch (error: any) {
        addLog(`Failed to initiate connection: ${error.message}`, 'error');
        setStatus(ConnectionStatus.ERROR);
    }
  };

  const handleBackToHome = () => {
    setView('home');
    if (peerRef.current && peerRef.current.open) {
      setStatus(ConnectionStatus.CONNECTED);
    } else if (peerRef.current && peerRef.current.disconnected) {
       setStatus(ConnectionStatus.DISCONNECTED);
    }
  }

  const renderHome = () => (
    <div className="flex flex-col space-y-4 w-full">
      <h2 className="text-xl font-bold text-center">Choose an Action</h2>
      <button
        onClick={handleCreateRoom}
        disabled={status !== ConnectionStatus.CONNECTED}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-200"
      >
        Create Room
      </button>
      <button
        onClick={handleJoinRoom}
        disabled={status !== ConnectionStatus.CONNECTED}
        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-200"
      >
        Join Room
      </button>
    </div>
  );
  
  const renderCreate = () => (
    <div className="flex flex-col items-center space-y-4 w-full">
      <h2 className="text-xl font-bold">Room Created</h2>
      <p className="text-center text-gray-400">Have the other user scan this QR code to join your room.</p>
      <div className="p-4 bg-white rounded-lg">
        <QRCodeCanvas value={peerId} size={256} />
      </div>
      <p className="text-lg font-mono bg-gray-800 p-2 rounded-md break-all">{peerId}</p>
      <button
        onClick={handleBackToHome}
        className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
      >
        Back
      </button>
    </div>
  );
  
  const renderJoin = () => (
    <div className="flex flex-col items-center space-y-4 w-full">
       <h2 className="text-xl font-bold">Scan QR Code</h2>
       <QrScannerComponent 
         onScanSuccess={handleQrScanSuccess} 
         onScanFailure={(error) => addLog(`QR Scan Error: ${error}`, 'error')} 
       />
       <button
        onClick={handleBackToHome}
        className="w-full mt-4 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
      >
        Cancel
      </button>
    </div>
  );
  
  const renderConfigError = () => (
     <div className="flex flex-col items-center space-y-4 w-full text-center">
      <h2 className="text-2xl font-bold text-red-500">Configuration Error</h2>
      <p className="text-gray-300">The application cannot start because the signaling server URL is missing.</p>
      <p className="text-gray-400">Please make sure the <code className="bg-red-900 text-red-200 p-1 rounded">VITE_PEER_SERVER_URL</code> environment variable is set correctly in your hosting provider (e.g., Netlify).</p>
    </div>
  );

  const renderContent = () => {
    switch (view) {
        case 'home': return renderHome();
        case 'create': return renderCreate();
        case 'join': return renderJoin();
        case 'config_error': return renderConfigError();
        default: return renderHome();
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 font-sans">
      <div className="w-full max-w-2xl mx-auto bg-gray-800 rounded-xl shadow-2xl flex flex-col">
        <header className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">WebRTC Signaling Tester</h1>
          <StatusIndicator status={status} />
        </header>
        
        <main className="p-6 flex-grow flex items-center justify-center">
          {renderContent()}
        </main>

        <section className="bg-gray-900 p-4 border-t border-gray-700 rounded-b-xl">
          <h3 className="text-lg font-semibold mb-2">Event Log</h3>
          <div className="h-48 overflow-y-auto bg-black p-3 rounded-md font-mono text-sm space-y-1">
            {logs.length === 0 ? (
              <p className="text-gray-500">No events yet...</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className={`flex items-start ${
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'system' ? 'text-blue-400' : 'text-gray-300'
                }`}>
                    <span className="w-20 flex-shrink-0">{log.timestamp}</span>
                    <span className="flex-grow">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
       <footer className="text-center text-gray-500 mt-4 text-xs">
        {PEER_SERVER_URL ? (
            <p>Using PeerServer at: {PEER_SERVER_URL}</p>
        ) : (
            <p>PeerServer URL not configured.</p>
        )}
       </footer>
    </div>
  );
}
