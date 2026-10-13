/**
 * The `kiwiply` ESLint plugin (E2E-U0.0): house rules for the web app.
 *
 * `kiwiply/icon-button-needs-label` - an icon-only control must have an accessible name (DECISIONS #32: every
 * icon-only control has a tooltip + `aria-label`, APP-E2E-PLAN section 7.3). It reports
 *
 *   - `<IconButton ...>` without `aria-label` / `aria-labelledby`, and
 *   - `<button ...>` whose only children are icons (`<XIcon />`, `<svg>`) without one.
 *
 * Elements with a spread (`{...props}`) are skipped: the label may arrive through it. The tooltip half of the
 * rule is the `@kiwiply/ui` `Tooltip` wrapper, whose own tests pin it; a name is what a linter can see.
 */

const ICON_NAME = /Icon$/;

function attrName(attr) {
  return attr.type === "JSXAttribute" && attr.name.type === "JSXIdentifier" ? attr.name.name : null;
}

function hasNameAttr(opening) {
  return opening.attributes.some((a) => a.type === "JSXAttribute" && ["aria-label", "aria-labelledby"].includes(attrName(a)));
}

function hasSpread(opening) {
  return opening.attributes.some((a) => a.type === "JSXSpreadAttribute");
}

function isIconElement(node) {
  if (node.type !== "JSXElement") return false;
  const n = node.openingElement.name;
  return n.type === "JSXIdentifier" && (n.name === "svg" || ICON_NAME.test(n.name));
}

/** True when every child is an icon (whitespace text allowed) and there is at least one. */
function isIconOnly(children) {
  let icons = 0;
  for (const child of children) {
    if (child.type === "JSXText" && child.value.trim() === "") continue;
    if (isIconElement(child)) {
      icons += 1;
      continue;
    }
    return false;
  }
  return icons > 0;
}

const iconButtonNeedsLabel = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      label:
        "Icon-only control without an accessible name: add aria-label (and wrap it in <Tooltip content=...> from @kiwiply/ui so hover and keyboard focus say what it does).",
    },
  },
  create(context) {
    return {
      JSXElement(node) {
        const opening = node.openingElement;
        const name = opening.name.type === "JSXIdentifier" ? opening.name.name : null;
        if (name !== "IconButton" && name !== "button") return;
        if (hasSpread(opening) || hasNameAttr(opening)) return;
        if (name === "button" && !isIconOnly(node.children)) return;
        context.report({ node: opening, messageId: "label" });
      },
    };
  },
};

/**
 * `kiwiply/one-mascot-per-file` (X2.8): the enterprise bee is compact and contextual, at most ONE per viewport (doc 11 s6).
 * A page component file that renders `<MascotPose>` / `<EnterpriseMascot>` more than once is almost certainly breaking that
 * cap, so every one after the first is reported (warn). `mascotPose=` props on EmptyState / ErrorState count too.
 */
const MASCOT_ELEMENTS = new Set(["MascotPose", "EnterpriseMascot"]);
const oneMascotPerFile = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: { many: "More than one enterprise mascot in this file. Doc 11 s6 caps it at one per viewport: keep a single MascotPose (or a single mascotPose prop) per page component." },
  },
  create(context) {
    let seen = 0;
    const count = (node) => {
      seen += 1;
      if (seen > 1) context.report({ node, messageId: "many" });
    };
    return {
      JSXOpeningElement(node) {
        if (node.name.type === "JSXIdentifier" && MASCOT_ELEMENTS.has(node.name.name)) count(node);
      },
      JSXAttribute(node) {
        if (node.name.type === "JSXIdentifier" && node.name.name === "mascotPose") count(node);
      },
    };
  },
};

const plugin = { rules: { "icon-button-needs-label": iconButtonNeedsLabel, "one-mascot-per-file": oneMascotPerFile } };

export default plugin;
