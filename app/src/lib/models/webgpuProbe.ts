interface GpuNavigator {
  gpu?: { requestAdapter(): Promise<unknown | null> };
}

export async function hasWebGpu(): Promise<boolean> {
  try {
    const { gpu } = navigator as unknown as GpuNavigator;
    return gpu !== undefined && (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}
