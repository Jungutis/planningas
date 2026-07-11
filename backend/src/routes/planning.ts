import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { planningStore } from '../store/planningStore';
import { broadcastToAll } from '../ws/wsServer';
import { PlanningOrder, LineConfig, PlanningComment, UserRole } from '../types/planning';

const router = Router();

router.get('/state', (_req: Request, res: Response) => {
  res.json({ orders: planningStore.orders, lineConfigs: planningStore.lineConfigs });
});

router.post('/orders', (req: Request, res: Response) => {
  const { partNumber, quantity, color } = req.body as {
    partNumber: string;
    quantity: number;
    color?: string;
  };

  if (!partNumber || !quantity) {
    res.status(400).json({ error: 'partNumber and quantity required' });
    return;
  }

  const order: PlanningOrder = {
    id: randomUUID(),
    partNumber,
    quantity: Number(quantity),
    color: color || '#3b82f6',
    lineId: null,
    startTime: null,
    closed: false,
    comments: [],
    scrapPercent: 0,
    createdAt: new Date().toISOString(),
  };

  planningStore.upsertOrder(order);
  broadcastToAll({ type: 'order_upserted', order });
  res.status(201).json(order);
});

router.patch('/orders/:id', (req: Request, res: Response) => {
  const order = planningStore.orders.find(o => o.id === req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const updated: PlanningOrder = { ...order, ...req.body };
  planningStore.upsertOrder(updated);
  broadcastToAll({ type: 'order_upserted', order: updated });
  res.json(updated);
});

router.post('/orders/:id/comments', (req: Request, res: Response) => {
  const order = planningStore.orders.find(o => o.id === req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const { text, author, role } = req.body as {
    text: string;
    author: string;
    role: UserRole;
  };

  const comment: PlanningComment = {
    id: randomUUID(),
    text,
    author: author || 'Vartotojas',
    role,
    createdAt: new Date().toISOString(),
  };

  const updated: PlanningOrder = { ...order, comments: [...order.comments, comment] };
  planningStore.upsertOrder(updated);
  broadcastToAll({ type: 'order_upserted', order: updated });
  res.status(201).json(comment);
});

router.delete('/orders/:id', (req: Request, res: Response) => {
  planningStore.deleteOrder(req.params.id);
  broadcastToAll({ type: 'order_deleted', id: req.params.id });
  res.status(204).end();
});

router.patch('/lines/:id', (req: Request, res: Response) => {
  const lineConfig = planningStore.lineConfigs.find(l => l.id === req.params.id);
  if (!lineConfig) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const updated: LineConfig = { ...lineConfig, ...req.body };
  planningStore.updateLineConfig(updated);
  broadcastToAll({ type: 'line_config_updated', lineConfig: updated });
  res.json(updated);
});

export default router;
