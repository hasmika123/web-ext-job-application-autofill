/**
 * Testimonials. Intentionally EMPTY (landing v2 spec section 1): no named quotes, star ratings or
 * stats until real, permissioned ones exist. Nothing on the landing page renders from this array;
 * when real entries are added, add the section component and compose it in `(marketing)/page.tsx`.
 */
export interface Testimonial {
  quote: string;
  name: string;
  /** e.g. "Recent graduate". Only what the person agreed to be shown. */
  role: string;
}

export const TESTIMONIALS: Testimonial[] = [];
