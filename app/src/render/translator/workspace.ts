import { t, LocaleCode } from "../../i18n";
import { renderTranslatorHeader, renderTranslatorUploadStep, renderTranslatorFeatures } from "./intro";
import { renderSettingsStep, SettingsStepInput } from "./settingsStep";
import { renderActionConsole } from "./actionConsole";

export interface WorkspaceMarkupInput extends Omit<SettingsStepInput, "visible"> {
  locale: LocaleCode;
  hasFiles: boolean;
  headerLabel: string;
}

export function renderWorkspace(input: WorkspaceMarkupInput): string {
  return `
    ${renderTranslatorHeader(t)}
    ${renderTranslatorUploadStep(t, input.hasFiles)}
    ${renderTranslatorFeatures(t, input.hasFiles)}
    ${renderSettingsStep({ ...input, visible: input.hasFiles })}
    ${renderActionConsole({ locale: input.locale, visible: input.hasFiles, headerLabel: input.headerLabel })}
  `;
}
