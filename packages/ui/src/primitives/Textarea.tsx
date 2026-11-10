import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { inputClass } from "./Input";

/** Multi-line sibling of `Input`: the same border, radius, focus ring and invalid state; resizes vertically only. */
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(inputClass, "resize-y leading-snug", className)} {...props} />;
});

export default Textarea;
