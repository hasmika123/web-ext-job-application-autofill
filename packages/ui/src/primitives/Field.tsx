import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Field — the standard label + control + hint/error wrapper. Wires the label, hint and
 * error to the control via ids/aria so it stays accessible: pass a single form control as
 * the child and Field clones the id/aria props onto it. When `error` is set the hint is
 * replaced by the error (styled danger) and `aria-invalid` is applied.
 *
 * Usage:
 *   <Field label="Email" hint="We never share it.">
 *     <Input type="email" />
 *   </Field>
 */
export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** A single form control (input/select/textarea). Its id/aria props are managed here. */
  children: ReactNode;
  /** Escape hatch: render-prop form that receives the wiring ids. */
  render?: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

export default function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
  render,
}: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  const invalid = error != null && error !== false;
  const describedBy = (invalid ? error : hint) != null ? msgId : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label != null && (
        <label htmlFor={id} className="text-[13px] font-semibold text-ink-soft">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}

      {render
        ? render({ id, describedBy, invalid })
        : injectControlProps(children, { id, describedBy, invalid })}

      {invalid ? (
        <p id={msgId} className="text-[12px] leading-snug text-danger">
          {error}
        </p>
      ) : hint != null ? (
        <p id={msgId} className="text-[12px] leading-snug text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// Best-effort prop injection onto a single control child. Uses a runtime import of
// cloneElement to keep the component tree simple; if the child is not a valid element we
// render it untouched (the render-prop escape hatch covers exotic cases).
import { cloneElement, isValidElement } from "react";
import type { ReactElement } from "react";

type ControlProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

function injectControlProps(
  child: ReactNode,
  ids: { id: string; describedBy?: string; invalid: boolean },
): ReactNode {
  if (!isValidElement(child)) return child;
  const el = child as ReactElement<ControlProps>;
  return cloneElement(el, {
    id: el.props.id ?? ids.id,
    "aria-describedby": el.props["aria-describedby"] ?? ids.describedBy,
    "aria-invalid": el.props["aria-invalid"] ?? (ids.invalid || undefined),
  });
}
