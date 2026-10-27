let pendingModelId: string | null = null;

export const deferRecognitionUntilModelReady = (modelId: string): void => {
  pendingModelId = modelId;
};

export const pendingRecognitionModel = (): string | null => pendingModelId;

export const clearPendingRecognition = (): void => {
  pendingModelId = null;
};
