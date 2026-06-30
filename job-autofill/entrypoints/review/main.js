/**
 * Review-page entry aggregator (W0.2). Side-effect imports build window.JAF in declaration
 * order (matching the legacy review.html <script> chain), then review.js runs its init().
 */
import "../../src/lib/storage.js";
import "../../src/lib/schema.js";
import "../../src/lib/tracking.js";
import "../../src/lib/sync.js";
import "../../src/lib/app-tracking.js";
import "../../src/review/review.js";
