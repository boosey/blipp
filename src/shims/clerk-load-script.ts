/**
 * Shim for @clerk/shared/loadClerkJsScript.
 *
 * @clerk/react@5.54.0 imports `loadClerkUiScript` which doesn't exist in
 * @clerk/shared@3.47.1. This shim re-exports everything from the real module
 * (using the direct file path to avoid circular alias) and adds the missing export.
 */

// Import from the actual file path to avoid the Vite alias loop
export {
  buildClerkJsScriptAttributes,
  clerkJsScriptUrl,
  loadClerkJsScript,
  setClerkJsLoadingErrorPackageName,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
} from "../../node_modules/@clerk/shared/dist/runtime/loadClerkJsScript.mjs";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
import { loadClerkJsScript } from "../../node_modules/@clerk/shared/dist/runtime/loadClerkJsScript.mjs";

/** Alias for loadClerkJsScript — missing from @clerk/shared@3.47.1, expected by @clerk/react@5.54.0 */
export const loadClerkUiScript = loadClerkJsScript;
