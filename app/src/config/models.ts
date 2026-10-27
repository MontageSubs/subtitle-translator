export const MODEL_HUB_ORIGIN = "https://huggingface.co";

export const modelFileUrl = (repository: string, revision: string, path: string): string => `${MODEL_HUB_ORIGIN}/${repository}/resolve/${revision}/${path}`;
