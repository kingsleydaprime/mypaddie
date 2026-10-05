import { assertNaira, type Naira } from "@/shared/domain";

export interface NeedForDeficit {
  id: string;
  title: string;
  /** Lower number = funded first. */
  priority: number;
  /** Cheapest honest way to meet this need, per month. */
  floor: Naira;
  /** What you spend on it now, per month. comfortable − floor is a hidden want. */
  comfortable: Naira;
}

export interface NeedAllocation {
  id: string;
  title: string;
  allocated: Naira;
  /** True when at least the floor is covered. */
  floorCovered: boolean;
  /** How far short of the floor this need is (0 when covered). */
  shortOfFloor: Naira;
}

export interface DeficitPlan {
  allocations: NeedAllocation[];
  /** Savings and wants always get nothing in deficit mode, and Paddie says so. */
  savings: 0;
  wants: 0;
  /** Comfortable needs − income: the number you are told plainly. */
  gap: Naira;
  /** Floor needs − income: the gap that remains even after cutting every hidden want. */
  floorGap: Naira;
  /** comfortable − floor across all needs: the hidden wants inside "needs". */
  hiddenWants: Naira;
}

/**
 * Deficit mode: income fills needs in priority order until it runs out.
 * Pass 1 covers each need's floor in priority order, so the cheapest honest
 * version of everything important is funded before anything gets comfort.
 * Pass 2 tops needs up towards comfortable, again in priority order.
 */
export function planDeficit(income: Naira, needs: readonly NeedForDeficit[]): DeficitPlan {
  assertNaira(income, "income");
  for (const n of needs) {
    assertNaira(n.floor, `floor of "${n.title}"`);
    assertNaira(n.comfortable, `comfortable of "${n.title}"`);
    if (n.floor > n.comfortable) {
      throw new RangeError(`"${n.title}": floor cannot exceed comfortable`);
    }
  }

  // Stable sort: equal priorities keep the order they were given in.
  const ordered = [...needs].sort((a, b) => a.priority - b.priority);
  const allocated = new Map<string, number>(ordered.map((n) => [n.id, 0]));
  let remaining = income;

  for (const n of ordered) {
    const give = Math.min(remaining, n.floor);
    allocated.set(n.id, give);
    remaining -= give;
  }
  for (const n of ordered) {
    const give = Math.min(remaining, n.comfortable - n.floor);
    allocated.set(n.id, allocated.get(n.id)! + give);
    remaining -= give;
  }

  const totalFloor = ordered.reduce((s, n) => s + n.floor, 0);
  const totalComfortable = ordered.reduce((s, n) => s + n.comfortable, 0);

  return {
    allocations: ordered.map((n) => {
      const got = allocated.get(n.id)!;
      return {
        id: n.id,
        title: n.title,
        allocated: got,
        floorCovered: got >= n.floor,
        shortOfFloor: Math.max(0, n.floor - got),
      };
    }),
    savings: 0,
    wants: 0,
    gap: Math.max(0, totalComfortable - income),
    floorGap: Math.max(0, totalFloor - income),
    hiddenWants: totalComfortable - totalFloor,
  };
}
