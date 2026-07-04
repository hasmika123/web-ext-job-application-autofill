/**
 * Re-export the shared custom dropdown from @kiwiply/ui so the web app and the extension use
 * one implementation. (Previously a native `<select>`; the shared one has a fully styled popup.)
 */
export { Select as default, selectClass } from "@kiwiply/ui";
export type { SelectProps, SelectOption } from "@kiwiply/ui";
