import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { WsMessage } from '../types/planning';
import { planningStore } from '../store/planningStore';

const clients = new Set<WebSocket>();

export function initWss(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);

    ws.send(
      JSON.stringify({
        type: 'full_state',
        orders: planningStore.orders,
        lineConfigs: planningStore.lineConfigs,
      } satisfies WsMessage)
    );

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
}

export function broadcastToAll(message: WsMessage): void {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
