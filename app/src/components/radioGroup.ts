export interface RadioGroupHandle {
  sync(): void;
}

export interface RadioGroupOptions {
  columns?: number;
  selectOnArrow?: boolean;
}

const HORIZONTAL_ARROWS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowRight"]);
const FORWARD_ARROWS: ReadonlySet<string> = new Set(["ArrowRight", "ArrowDown"]);

const isDisabled = (radio: HTMLElement): boolean => radio.matches(":disabled") || radio.getAttribute("aria-disabled") === "true";

export function mountRadioGroup(radios: readonly HTMLElement[], { columns = 1, selectOnArrow = true }: RadioGroupOptions = {}): RadioGroupHandle {
  function sync(): void {
    const tabbable = radios.find((radio) => radio.getAttribute("aria-checked") === "true" && !isDisabled(radio)) ?? radios.find((radio) => !isDisabled(radio));
    radios.forEach((radio) => { radio.tabIndex = radio === tabbable ? 0 : -1; });
  }

  function arrowTarget(key: string, index: number): HTMLElement | undefined {
    const forward = FORWARD_ARROWS.has(key);
    const mirrored = HORIZONTAL_ARROWS.has(key) && getComputedStyle(radios[index]).direction === "rtl";
    const distance = HORIZONTAL_ARROWS.has(key) || columns === 1 ? 1 : columns;
    const delta = forward !== mirrored ? distance : -distance;
    for (let attempt = 1; attempt <= radios.length; attempt++) {
      const candidate = radios[(((index + delta * attempt) % radios.length) + radios.length) % radios.length];
      if (!isDisabled(candidate)) return candidate;
    }
    return undefined;
  }

  function targetFor(event: KeyboardEvent, index: number): HTMLElement | undefined {
    if (event.key.startsWith("Arrow")) return arrowTarget(event.key, index);
    if (event.key === "Home") return radios.find((radio) => !isDisabled(radio));
    if (event.key === "End") return [...radios].reverse().find((radio) => !isDisabled(radio));
    return undefined;
  }

  radios[0]?.parentElement?.addEventListener("keydown", (event) => {
    const index = radios.indexOf(event.target as HTMLElement);
    if (index >= 0 && (event.key === " " || event.key === "Enter")) {
      event.preventDefault();
      radios[index].click();
      return;
    }
    const target = index < 0 ? undefined : targetFor(event, index);
    if (!target) return;
    event.preventDefault();
    target.focus();
    if (selectOnArrow) target.click();
    else radios.forEach((radio) => { radio.tabIndex = radio === target ? 0 : -1; });
  });

  sync();
  return { sync };
}
