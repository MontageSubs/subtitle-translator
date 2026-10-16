import { t, LocaleCode } from "../../i18n";
import { renderTranslatorHeader, renderTranslatorUploadStep, renderTranslatorFeatures } from "./intro";
import { renderSettingsStep, SettingsStepInput } from "./settingsStep";
import { renderActionConsole } from "./actionConsole";

export interface WorkspaceMarkupInput extends Omit<SettingsStepInput, "visible"> {
  locale: LocaleCode;
  workspaceVisible: boolean;
  hasQueue: boolean;
  headerLabel: string;
}

export function renderWorkspace(input: WorkspaceMarkupInput): string {
  return `
    <p class="sr-only" id="workspace-live" role="status" aria-live="polite"></p>
    ${renderTranslatorHeader(t)}
    ${renderTranslatorUploadStep(t, input.hasQueue)}
    ${renderTranslatorFeatures(t, input.workspaceVisible)}
    ${renderSettingsStep({ ...input, visible: input.workspaceVisible })}
    ${renderActionConsole({ locale: input.locale, visible: input.workspaceVisible, headerLabel: input.headerLabel })}
  `;
}
