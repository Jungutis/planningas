import { PlanningOrder, LineConfig } from '../types/planning';

class PlanningStore {
  orders: PlanningOrder[] = [];

  lineConfigs: LineConfig[] = [
    { id: 'smt4', name: 'SMT4', cycleTimeSeconds: 30 },
    { id: 'qlab', name: 'QLab', cycleTimeSeconds: 45 },
    { id: 'xray', name: 'X-ray', cycleTimeSeconds: 20 },
  ];

  upsertOrder(order: PlanningOrder): void {
    const idx = this.orders.findIndex(o => o.id === order.id);
    if (idx >= 0) this.orders[idx] = order;
    else this.orders.push(order);
  }

  deleteOrder(id: string): void {
    this.orders = this.orders.filter(o => o.id !== id);
  }

  updateLineConfig(config: LineConfig): void {
    const idx = this.lineConfigs.findIndex(l => l.id === config.id);
    if (idx >= 0) this.lineConfigs[idx] = config;
  }
}

export const planningStore = new PlanningStore();
