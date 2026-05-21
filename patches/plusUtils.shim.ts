/**
 * plusUtils shim — fork/self-hosted build override.
 *
 * Drop this shim in via the esbuild plugin in esbuild.config.mjs so that all
 * imports of `@/plusUtils` resolve here instead of the real src/plusUtils.ts.
 * No source files are modified; pulling upstream changes only requires
 * rebuilding — the shim stays in place automatically.
 *
 * Strategy:
 *  - All gate checks return `true` unconditionally.
 *  - `settings.isPlusUser` is kept in sync so direct raw-setting reads also pass.
 *  - Utility functions (`applyPlusSettings`, `createPlusPageUrl`, etc.) are
 *    fully implemented so Plus features work correctly once unlocked.
 *  - Validation/refresh lifecycle functions are no-ops.
 */

import { setChainType, setModelKey } from "@/aiParams";
import { ChainType } from "@/chainType";
import {
  ChatModelProviders,
  ChatModels,
  EmbeddingModelProviders,
  EmbeddingModels,
  PlusUtmMedium,
} from "@/constants";
import { logError, logInfo } from "@/logger";
import { getSettings, setSettings, updateSetting } from "@/settings/model";

// ---------------------------------------------------------------------------
// Constants (mirrors the real plusUtils.ts values)
// ---------------------------------------------------------------------------

export const DEFAULT_COPILOT_PLUS_CHAT_MODEL = ChatModels.COPILOT_PLUS_FLASH;
const DEFAULT_COPILOT_PLUS_CHAT_MODEL_KEY =
  DEFAULT_COPILOT_PLUS_CHAT_MODEL + "|" + ChatModelProviders.COPILOT_PLUS;
export const DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL = EmbeddingModels.COPILOT_PLUS_SMALL;
export const DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL_KEY =
  DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL + "|" + EmbeddingModelProviders.COPILOT_PLUS;

// ---------------------------------------------------------------------------
// Access checks — always granted
// ---------------------------------------------------------------------------

export function isSelfHostAccessValid(): boolean {
  return true;
}

export function isSelfHostModeValid(): boolean {
  return true;
}

export function isPlusModel(_modelKey: string): boolean {
  return true;
}

export function isPlusEnabled(): boolean {
  return true;
}

/** React hook — always returns true so UI renders Plus state immediately. */
export function useIsPlusUser(): boolean {
  return true;
}

export async function checkIsPlusUser(_context?: Record<string, unknown>): Promise<boolean> {
  // Keep the persisted setting in sync so raw reads of settings.isPlusUser pass too.
  updateSetting("isPlusUser", true);
  return true;
}

/** React hook — always returns true (no loading state needed). */
export function useIsSelfHostEligible(): boolean {
  return true;
}

// ---------------------------------------------------------------------------
// Validation lifecycle — no-ops
// ---------------------------------------------------------------------------

export async function validateSelfHostMode(): Promise<boolean> {
  return true;
}

export async function refreshSelfHostModeValidation(): Promise<void> {
  // no-op
}

// ---------------------------------------------------------------------------
// Plus on/off — keep isPlusUser setting accurate; never turn it off
// ---------------------------------------------------------------------------

export function turnOnPlus(): void {
  updateSetting("isPlusUser", true);
}

export function turnOffPlus(): void {
  // Intentional no-op: this build always treats the user as a Plus subscriber.
}

// ---------------------------------------------------------------------------
// Functional utilities — preserved from the real implementation
// ---------------------------------------------------------------------------

export function applyPlusSettings(): void {
  const defaultModelKey = DEFAULT_COPILOT_PLUS_CHAT_MODEL_KEY;
  const embeddingModelKey = DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL_KEY;
  const previousEmbeddingModelKey = getSettings().embeddingModelKey;

  logInfo("applyPlusSettings: Changing embedding model", {
    from: previousEmbeddingModelKey,
    to: embeddingModelKey,
    changed: previousEmbeddingModelKey !== embeddingModelKey,
  });

  setModelKey(defaultModelKey);
  setChainType(ChainType.COPILOT_PLUS_CHAIN);
  setSettings({
    defaultModelKey,
    embeddingModelKey,
    defaultChainType: ChainType.COPILOT_PLUS_CHAIN,
  });

  if (previousEmbeddingModelKey !== embeddingModelKey) {
    logInfo("applyPlusSettings: Embedding model changed, triggering indexing");
    import("@/search/vectorStoreManager")
      .then(async (module) => {
        await module.default.getInstance().indexVaultToVectorStore();
      })
      .catch((error) => {
        logError("Failed to trigger indexing after Plus settings applied:", error);
      });
  } else {
    logInfo("applyPlusSettings: No embedding model change, skipping indexing");
  }
}

export function createPlusPageUrl(medium: PlusUtmMedium): string {
  return `https://www.obsidiancopilot.com?utm_source=obsidian&utm_medium=${medium}`;
}

export function navigateToPlusPage(medium: PlusUtmMedium): void {
  window.open(createPlusPageUrl(medium), "_blank");
}
