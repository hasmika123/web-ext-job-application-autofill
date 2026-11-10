/**
 * Server-side helpers of the resume photo upload BFF route (R7.4). Kept out of the route file because a Next route
 * module may export nothing but its handlers.
 */

/**
 * The most a photo upload request may carry, whatever `resume.photo.maxBytes` says: that setting is bounded at 10 MiB
 * (the API's multipart limit), plus a little room for the multipart framing. The API applies the exact admin cap (413
 * `PHOTO_TOO_LARGE`); this is the BFF's own bound, so a hostile or runaway upload is cut off here instead of being
 * buffered or relayed in full (Option A: the browser talks to Next, Next streams to Spring).
 */
export const PHOTO_REQUEST_CAP_BYTES = 10 * 1024 * 1024 + 64 * 1024;

/** `body` passed through unchanged until it has carried more than `max` bytes, then errored (which aborts the upstream request). */
export function capStream(body: ReadableStream<Uint8Array>, max: number, onExceed: () => void): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > max) {
          onExceed();
          controller.error(new Error("photo upload over the cap"));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}
