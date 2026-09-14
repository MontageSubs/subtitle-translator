export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedHandle {
  setValue(value: string): void;
  setDisabled(disabled: boolean): void;
}

export function mountSegmented(
  container: HTMLElement, options: SegmentedOption[], selected: string, onChange: (value: string) => void
): SegmentedHandle {
  container.innerHTML = options.map((opt) => `
    <button type="button" class="segmented__option" data-value="${opt.value}">${opt.label}</button>
  `).join("");

  function applyActive(value: string): void {
    container.querySelectorAll<HTMLButtonElement>(".segmented__option").forEach((btn) => {
      const active = btn.dataset.value === value;
      btn.classList.toggle("segmented__option--active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }
  applyActive(selected);

  function setDisabled(disabled: boolean): void {
    container.querySelectorAll<HTMLButtonElement>(".segmented__option").forEach((btn) => { btn.disabled = disabled; });
  }

  container.querySelectorAll<HTMLButtonElement>(".segmented__option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.value!;
      applyActive(value);
      onChange(value);
    });
  });

  return { setValue: applyActive, setDisabled };
}
