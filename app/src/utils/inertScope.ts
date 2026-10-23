const LIVE_REGION_SELECTOR = "[aria-live], [role='status'], [role='alert']";

export function isolateFromPage(target: HTMLElement): () => void {
  const isolated: HTMLElement[] = [];
  for (let node: HTMLElement = target; node.parentElement && node !== document.body; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === node || sibling.inert || sibling.matches(LIVE_REGION_SELECTOR) || sibling.tagName === "SCRIPT") continue;
      sibling.inert = true;
      isolated.push(sibling);
    }
  }
  return () => isolated.forEach((element) => { element.inert = false; });
}
