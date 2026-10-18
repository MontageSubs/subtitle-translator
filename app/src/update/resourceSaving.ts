interface BatteryState {
  charging: boolean;
  level: number;
}

type ResourceAwareNavigator = Navigator & {
  connection?: { saveData?: boolean };
  getBattery?: () => Promise<BatteryState>;
};

const LOW_BATTERY_LEVEL = 0.2;

function prefersReducedData(): boolean {
  const { connection } = navigator as ResourceAwareNavigator;
  return connection?.saveData === true || matchMedia("(prefers-reduced-data: reduce)").matches;
}

async function isBatteryLow(): Promise<boolean> {
  const battery = await (navigator as ResourceAwareNavigator).getBattery?.().catch(() => undefined);
  return battery !== undefined && !battery.charging && battery.level <= LOW_BATTERY_LEVEL;
}

export async function isConservingResources(): Promise<boolean> {
  return prefersReducedData() || (await isBatteryLow());
}
