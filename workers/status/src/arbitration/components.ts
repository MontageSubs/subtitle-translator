import { ComponentGroup } from "../types";
import { ALL_STATUS_PROVIDERS } from "../providers/index";

export interface ComponentDefinition {
  id: string;
  name: string;
  group: ComponentGroup;
}

export const STATUS_PAGE_VERSION = "1.0.0";

export const COMPONENT_DEFINITIONS: ComponentDefinition[] = [
  { id: "service_availability", name: "Subtitle Translation Service", group: "core_services" },
  { id: "core_infrastructure", name: "Core Infrastructure & Edge Delivery", group: "core_services" },
  { id: "status_system", name: "Status & Health Monitoring", group: "core_services" },
  ...ALL_STATUS_PROVIDERS.map(({ id, name, group }) => ({ id, name, group })),
];

export const componentNameOf = (componentId: string): string =>
  COMPONENT_DEFINITIONS.find((c) => c.id === componentId)?.name ?? componentId;
