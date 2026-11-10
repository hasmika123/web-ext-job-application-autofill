/**
 * The engine the options page needs on window.JAF (side-effect imports): storage (settings) +
 * tracking (chromeTokenStore + createKiwiplyProvider for sign-out / bug report). No schema/sync/
 * parser here.
 */
import "../../src/lib/storage.js";
import "../../src/lib/tracking.js";
import "../../src/lib/workspace.js"; // pure: accountChip (the account label, never the login)
