"use client";

import type { ComponentType } from "react";
import { GlobeIcon, LinkIcon, LinkedInIcon, MailIcon, MapPinIcon, PhoneIcon, PlusIcon, Tooltip, XIcon, cn, iconButtonClass } from "@kiwiply/ui";
import type { IconProps, ResumeDocBasics, ResumeDocLink } from "@kiwiply/ui";
import { useCanvas, useField } from "./canvasContext";
import { GHOST, PILL_BUTTON } from "./canvasStyles";
import PhotoSlot from "./photo/PhotoSlot";
import { BASICS_BLOCK_ID } from "./sectionTitle";
import { nowMs } from "./state/clock";
import { BASICS_MAX, MAX_LINKS, MAX_URL_CHARS } from "./state/reducer";
import type { BasicsField } from "./state/types";

/** The icon in front of a link: LinkedIn, a globe for a website, a generic link for everything else. */
function LinkGlyph({ link }: { link: ResumeDocLink }) {
  const text = `${link.label ?? ""} ${link.url ?? ""}`.toLowerCase();
  const className = "h-4 w-4 flex-none";
  if (text.includes("linkedin")) return <LinkedInIcon className={className} aria-hidden />;
  if (/\b(website|portfolio|web|site)\b/.test(text)) return <GlobeIcon className={className} aria-hidden />;
  return <LinkIcon className={className} aria-hidden />;
}

function BasicsInput({
  name,
  label,
  placeholder,
  value,
  className,
  inputMode,
}: {
  name: BasicsField;
  label: string;
  placeholder: string;
  value: string;
  className?: string;
  inputMode?: "email" | "tel" | "text";
}) {
  const { dispatch } = useCanvas();
  const f = useField(`basics.${name}`);
  return (
    <input
      {...f}
      aria-label={label}
      value={value}
      maxLength={BASICS_MAX[name]}
      placeholder={placeholder}
      inputMode={inputMode}
      autoComplete="off"
      onChange={(e) => dispatch({ type: "basics/field", field: name, value: e.target.value, at: nowMs() })}
      className={cn(GHOST, className)}
    />
  );
}

function ContactField({
  icon: Icon,
  ...input
}: {
  icon: ComponentType<IconProps>;
  name: BasicsField;
  label: string;
  placeholder: string;
  value: string;
  inputMode?: "email" | "tel" | "text";
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-ink-soft">
      <Icon className="h-4 w-4 flex-none" aria-hidden />
      <BasicsInput {...input} className="min-w-0 text-[13.5px]" />
    </div>
  );
}

function LinkField({ link, index }: { link: ResumeDocLink; index: number }) {
  const { dispatch } = useCanvas();
  const f = useField(`basics.link.${index}.url`);
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-ink-soft">
      <LinkGlyph link={link} />
      <input
        {...f}
        aria-label={`Link ${index + 1}`}
        value={link.url ?? ""}
        maxLength={MAX_URL_CHARS}
        placeholder="linkedin.com/in/you"
        inputMode="url"
        autoComplete="off"
        title={link.label ?? undefined}
        onChange={(e) => dispatch({ type: "basics/link.edit", index, field: "url", value: e.target.value, at: nowMs() })}
        className={cn(GHOST, "min-w-0 text-[13.5px]")}
      />
      <Tooltip content={`Remove link ${index + 1}`} className="flex-none">
        <button
          type="button"
          aria-label={`Remove link ${index + 1}`}
          onClick={() => dispatch({ type: "basics/link.remove", index, at: nowMs() })}
          className={cn(iconButtonClass, "max-sm:h-11 max-sm:w-11")}
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}

/**
 * The personal-information block (DESIGN 10.5): the name in large type, the headline, a contact row
 * with its icons, the links (at most `MAX_LINKS`), and the photo slot when the template draws a photo
 * (`photo/PhotoSlot`, R7.4). Icons are decorative; every input has an accessible label.
 */
export default function HeaderBlock({ basics }: { basics: ResumeDocBasics }) {
  const { dispatch, controls } = useCanvas();
  const links = basics.links ?? [];

  return (
    <section id={BASICS_BLOCK_ID} aria-label="Personal info" className="rb-block scroll-mt-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <BasicsInput name="name" label="Name" placeholder="Your name" value={basics.name ?? ""} className="font-display text-[34px] font-extrabold leading-tight tracking-tight max-sm:text-[28px]" />
          <BasicsInput name="headline" label="Headline" placeholder="Job title" value={basics.headline ?? ""} className="text-[19px] text-ink-soft max-sm:text-[17px]" />

          <div className="mt-2 grid gap-x-4 gap-y-0.5 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
            <ContactField icon={MapPinIcon} name="location" label="Location" placeholder="City, Country" value={basics.location ?? ""} />
            <ContactField icon={PhoneIcon} name="phone" label="Phone" placeholder="(555) 123-4567" value={basics.phone ?? ""} inputMode="tel" />
            <ContactField icon={MailIcon} name="email" label="Email" placeholder="you@example.com" value={basics.email ?? ""} inputMode="email" />
          </div>

          <div className="mt-0.5 grid gap-x-4 gap-y-0.5 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
            {links.map((link, i) => (
              <LinkField key={i} link={link} index={i} />
            ))}
          </div>
          <div className="mt-1.5">
            <button
              type="button"
              disabled={links.length >= MAX_LINKS}
              title={links.length >= MAX_LINKS ? `At most ${MAX_LINKS} links` : undefined}
              onClick={() => dispatch({ type: "basics/link.add", at: nowMs() })}
              className={cn(PILL_BUTTON, "min-h-7 px-2.5 text-[12.5px]")}
            >
              <PlusIcon className="h-3 w-3" /> Add link
            </button>
          </div>
        </div>

        {controls.photoSlot && <PhotoSlot basics={basics} />}
      </div>
    </section>
  );
}
