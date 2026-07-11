import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { WsMessage } from '../types/planning';
import { getFullState } from '../routes/planning';

const clients = new Set<WebSocket>();

export function initWss(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws: WebSocket) => {
    clients.add(ws);
    try {
      const state = await getFullState();
      ws.send(JSON.stringify({ type: 'full_state', ...state } satisfies WsMessage));
    } catch (e) {
      console.error('WS full_state error', e);
    }
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
}

export function broadcastToAll(message: WsMessage): void {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}
