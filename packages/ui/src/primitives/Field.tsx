import { useId, cloneElement, isValidElement } from "react";
import type { ReactNode, ReactElement } from "react";
import { cn } from "./cn";

/**
 * Field — label + control + hint/error, styled 1:1 with the web app's `ui/Field` (12.5px
 * semibold label, 15px bottom rhythm). Adds accessible wiring the web version does by hand:
 * pass a single control as the child and Field clones the id/aria props onto it (label
 * `htmlFor`, `aria-describedby`, `aria-invalid`). When `error` is set the hint is replaced.
 *
 *   <Field label="Email" hint="We never share it."><Input type="email" /></Field>
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

export default function Field({ label, hint, error, required, className, children, render }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  const invalid = error != null && error !== false;
  const describedBy = (invalid ? error : hint) != null ? msgId : undefined;

  return (
    <div className={cn("mb-[15px]", className)}>
      {label != null && (
        <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}

      {render
        ? render({ id, describedBy, invalid })
        : injectControlProps(children, { id, describedBy, invalid })}

      {invalid ? (
        <p id={msgId} className="mt-1.5 text-[12.5px] font-medium text-danger">
          {error}
        </p>
      ) : hint != null ? (
        <p id={msgId} className="mt-1.5 text-[12.5px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
