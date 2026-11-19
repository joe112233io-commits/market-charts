// The arithmetic of a paper fill, kept apart from the database.

export interface AccountState {
  id: string;
  cash: number;
  realizedPnl: number;
  commissionPct: number;
}
export interface PositionState {
  qty: number;
  avgPrice: number;
}

export type FillOutcome =
  | { ok: false; reason: string }
  | { ok: true; cash: number; realizedPnl: number; position: PositionState | null; commission: number };

/** What a fill does to an account's cash, realized P&L and position, or why it's refused. */
export function applyFill(
  account: AccountState,
  position: PositionState | null,
  side: "buy" | "sell",
  qty: number,
  price: number,
): FillOutcome {
  const commission = (qty * price * account.commissionPct) / 100;
  const held = position?.qty ?? 0;
  if (side === "buy") {
    const cost = qty * price + commission;
    if (cost > account.cash + 1e-9) return { ok: false, reason: "Not enough cash" };
    const newQty = held + qty;
    const avg = (held * (position?.avgPrice ?? 0) + qty * price + commission) / newQty;
    return { ok: true, cash: account.cash - cost, realizedPnl: account.realizedPnl, position: { qty: newQty, avgPrice: avg }, commission };
  }
  if (qty > held + 1e-9) return { ok: false, reason: "Sells more than the position holds" };
  const avg = position?.avgPrice ?? 0;
  const left = held - qty;
  return {
    ok: true,
    cash: account.cash + qty * price - commission,
    realizedPnl: account.realizedPnl + (price - avg) * qty - commission,
    position: left > 1e-9 ? { qty: left, avgPrice: avg } : null,
    commission,
  };
}

