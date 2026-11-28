export { completeTranslation } from "./partialRecovery";
export { ALLOWANCE_EXHAUSTED_CODE, formatWorkerError, isBatchBlocking, isCoolingDown, isNetworkFailure, isOutdatedClient, isUnreadableSubtitle, isWorkerLimit, LocalizedError, WORKER_LIMIT_ERROR_CODE, WorkerRequestError } from "./errors";
export { activeCooldownUntil, onCooldownChange, onTranslationSuccess, translationHoldUntil } from "./workerCooldown";
export { isAllowanceExhausted, isRescueSelected, type Channel } from "./channel";
export { claimRescue, isRescueClaimable, selectChannel } from "./rescue";
export { isChallengeGateOpen, subscribeChallengeGate } from "./captcha";
export { isClockHeld, subscribeIdleClock } from "./idleClock";
export type { TranslationResult } from "./types";
