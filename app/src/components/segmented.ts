import { tipAttr } from "../utils/labelAttrs";
import { mountRadioGroup } from "./radioGroup";

export interface SegmentedOption {
  value: string;
  label: string;
  title?: string;
}

export interface SegmentedHandle {
  setValue(value: string): void;
  setDisabled(disabled: boolean): void;
}

export function mountSegmented(
  container: HTMLElement, options: SegmentedOption[], selected: string, onChange: (value: string) => void
): SegmentedHandle {
  container.innerHTML = options.map((opt) => `
    <button type="button" class="segmented__option" role="radio" data-value="${opt.value}"${opt.title ? ` ${tipAttr(opt.title)}` : ""}>${opt.label}</button>
  `).join("");
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".segmented__option"));
  const group = mountRadioGroup(buttons);

  function applyActive(value: string): void {
    buttons.forEach((btn) => {
      const active = btn.dataset.value === value;
      btn.classList.toggle("segmented__option--active", active);
      btn.setAttribute("aria-checked", String(active));
    });
    group.sync();
  }
  applyActive(selected);

  function setDisabled(disabled: boolean): void {
    buttons.forEach((btn) => { btn.disabled = disabled; });
    group.sync();
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.value!;
      applyActive(value);
      onChange(value);
    });
  });

  return { setValue: applyActive, setDisabled };
}
