import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../db';
import { broadcastToAll } from '../ws/wsServer';
import { PlanningOrder, LineConfig, PlanningComment, Blocker } from '../types/planning';
import { Prisma } from '@prisma/client';

const router = Router();

function serializeOrder(o: {
  id: string; partNumber: string; quantity: number; color: string;
  lineId: string | null; startTime: Date | null; closed: boolean;
  comments: unknown; scrapPercent: number; createdAt: Date; relatedOrderId?: string | null;
}): PlanningOrder {
  return {
    id: o.id,
    partNumber: o.partNumber,
    quantity: o.quantity,
    color: o.color,
    lineId: o.lineId as PlanningOrder['lineId'],
    startTime: o.startTime ? o.startTime.toISOString() : null,
    closed: o.closed,
    comments: (o.comments as PlanningComment[]) ?? [],
    scrapPercent: o.scrapPercent,
    createdAt: o.createdAt.toISOString(),
    relatedOrderId: o.relatedOrderId ?? null,
  };
}

function serializeBlocker(b: {
  id: string; lineId: string | null; startTime: Date; endTime: Date;
  label: string; color: string; createdAt: Date;
}): Blocker {
  return {
    id: b.id,
    lineId: b.lineId as Blocker['lineId'],
    startTime: b.startTime.toISOString(),
    endTime: b.endTime.toISOString(),
    label: b.label,
    color: b.color,
    createdAt: b.createdAt.toISOString(),
  };
}

export async function getFullState() {
  const [dbOrders, dbLines, dbBlockers] = await Promise.all([
    prisma.planningOrder.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.lineConfig.findMany(),
    prisma.blocker.findMany({ orderBy: { startTime: 'asc' } }),
  ]);
  return {
    orders: dbOrders.map(serializeOrder),
    lineConfigs: dbLines as LineConfig[],
    blockers: dbBlockers.map(serializeBlocker),
  };
}

// ── Orders ──────────────────────────────────────────────

router.get('/state', async (_req, res: Response) => {
  res.json(await getFullState());
});

router.post('/orders', async (req: Request, res: Response) => {
  const { partNumber, quantity, color, lineId } = req.body as {
    partNumber: string; quantity: number; color?: string; lineId?: string;
  };
  if (!partNumber || !quantity) {
    res.status(400).json({ error: 'partNumber and quantity required' });
    return;
  }
  const created = await prisma.planningOrder.create({
    data: { id: randomUUID(), partNumber, quantity: Number(quantity), color: color || '#3b82f6', lineId: lineId ?? null, comments: [] },
  });
  const order = serializeOrder(created);
  broadcastToAll({ type: 'order_upserted', order });
  res.status(201).json(order);
});

router.patch('/orders/:id', async (req: Request, res: Response) => {
  const existing = await prisma.planningOrder.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  const body = req.body as Partial<PlanningOrder>;
  const updated = await prisma.planningOrder.update({
    where: { id: req.params.id },
    data: {
      ...(body.partNumber !== undefined && { partNumber: body.partNumber }),
      ...(body.quantity !== undefined && { quantity: body.quantity }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.lineId !== undefined && { lineId: body.lineId }),
      ...(body.startTime !== undefined && { startTime: body.startTime ? new Date(body.startTime) : null }),
      ...(body.closed !== undefined && { closed: body.closed }),
      ...(body.scrapPercent !== undefined && { scrapPercent: body.scrapPercent }),
      ...(body.comments !== undefined && { comments: body.comments as unknown as Prisma.InputJsonValue }),
      ...('relatedOrderId' in body && { relatedOrderId: body.relatedOrderId ?? null }),
    },
  });
  const order = serializeOrder(updated);
  broadcastToAll({ type: 'order_upserted', order });
  res.json(order);
});

router.delete('/orders/:id', async (req: Request, res: Response) => {
  try {
    await prisma.planningOrder.delete({ where: { id: req.params.id } });
    broadcastToAll({ type: 'order_deleted', id: req.params.id });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

router.patch('/lines/:id', async (req: Request, res: Response) => {
  const existing = await prisma.lineConfig.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await prisma.lineConfig.update({ where: { id: req.params.id }, data: req.body });
  const lineConfig = updated as LineConfig;
  broadcastToAll({ type: 'line_config_updated', lineConfig });
  res.json(lineConfig);
});

// ── Blockers ─────────────────────────────────────────────

router.post('/blockers', async (req: Request, res: Response) => {
  const { lineId, startTime, endTime, label, color } = req.body as {
    lineId?: string; startTime: string; endTime: string; label: string; color?: string;
  };
  if (!startTime || !endTime || !label) {
    res.status(400).json({ error: 'startTime, endTime, label required' });
    return;
  }
  const created = await prisma.blocker.create({
    data: { id: randomUUID(), lineId: lineId ?? null, startTime: new Date(startTime), endTime: new Date(endTime), label, color: color || '#ef4444' },
  });
  const blocker = serializeBlocker(created);
  broadcastToAll({ type: 'blocker_upserted', blocker });
  res.status(201).json(blocker);
});

router.delete('/blockers/:id', async (req: Request, res: Response) => {
  try {
    await prisma.blocker.delete({ where: { id: req.params.id } });
    broadcastToAll({ type: 'blocker_deleted', id: req.params.id });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

export default router;
