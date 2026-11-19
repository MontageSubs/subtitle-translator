interface GpuNavigator {
  gpu?: { requestAdapter(): Promise<unknown | null> };
}

const ADAPTER_DEADLINE_MS = 3000;

export async function hasWebGpu(): Promise<boolean> {
  try {
    const { gpu } = navigator as unknown as GpuNavigator;
    if (gpu === undefined) return false;
    const deadline = new Promise<null>((resolve) => setTimeout(resolve, ADAPTER_DEADLINE_MS, null));
    return (await Promise.race([gpu.requestAdapter(), deadline])) !== null;
  } catch {
    return false;
  }
}
