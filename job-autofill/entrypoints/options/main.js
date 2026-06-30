/**
 * Options entry aggregator (W0.2). Side-effect imports build window.JAF in declaration
 * order (matching the legacy options.html <script> chain), then options.js runs.
 */
import "../../src/lib/storage.js";
import "../../src/lib/tracking.js";
import "../../src/options/options.js";
