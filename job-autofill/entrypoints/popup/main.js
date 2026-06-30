/**
 * Popup entry aggregator (W0.2). Side-effect imports build window.JAF in declaration
 * order (matching the legacy popup.html <script> chain), then popup.js runs its init().
 * mammoth is loaded separately as a classic public script in index.html (global usage).
 */
import "../../src/lib/schema.js";
import "../../src/lib/storage.js";
import "../../src/lib/tracking.js";
import "../../src/lib/sync.js";
import "../../src/lib/parser-core.js";
import "../../src/lib/parser.js";
import "../../src/popup/popup.js";
