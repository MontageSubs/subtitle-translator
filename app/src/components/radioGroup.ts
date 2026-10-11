export interface RadioGroupHandle {
  sync(): void;
}

const ARROW_STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function mountRadioGroup(radios: readonly HTMLElement[]): RadioGroupHandle {
  function sync(): void {
    const checked = radios.find((radio) => radio.getAttribute("aria-checked") === "true") ?? radios[0];
    radios.forEach((radio) => { radio.tabIndex = radio === checked ? 0 : -1; });
  }

  function targetFor(event: KeyboardEvent, index: number): HTMLElement | undefined {
    if (Object.hasOwn(ARROW_STEPS, event.key)) return radios[(index + ARROW_STEPS[event.key] + radios.length) % radios.length];
    if (event.key === "Home") return radios[0];
    if (event.key === "End") return radios[radios.length - 1];
    return undefined;
  }

  radios[0]?.parentElement?.addEventListener("keydown", (event) => {
    const index = radios.indexOf(event.target as HTMLElement);
    const target = index < 0 ? undefined : targetFor(event, index);
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.click();
  });

  sync();
  return { sync };
}
