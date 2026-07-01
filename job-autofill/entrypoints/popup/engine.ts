/**
 * Loads the vanilla engine the popup needs into window.JAF (side-effect imports). The popup no
 * longer parses (the side panel does), so it needs only storage/schema/tracking/sync — no
 * parser/mammoth/pdf.js. Order: tracking before sync (sync uses tracking).
 */
import "../../src/lib/storage.js";
import "../../src/lib/schema.js";
import "../../src/lib/tracking.js";
import "../../src/lib/sync.js";
