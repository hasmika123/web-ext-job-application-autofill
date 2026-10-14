import { SparklineDefaultsProvider, tenantThemeCss } from "@kiwiply/ui";

/**
 * The root of every tenant page (X2.12). It carries `.theme-tenant` (the token remap in
 * `@kiwiply/ui/styles/theme-tenant.css`) and a <style> block holding the organization's colour variables, derived from its
 * PUBLISHED primary and secondary colours by `tenantThemeVars` (a 50..900 scale for each, an on-colour for every shade,
 * solid / hover / active / text / subtle / border / ring). The variables live on this element only: the regular Kiwiply
 * pages never set them, so they are unaffected, and a new colour recolours every tenant page with no deploy.
 *
 * Colours come from validated `#rrggbb` values only (anything else falls back to the board's blue and teal inside
 * `tenantThemeCss`), so the generated CSS text can not carry markup or a declaration of someone else's making.
 * The dark set (`.dark` on the root) exists for the shell story; the login always renders on its light sky surface.
 */
export default function TenantThemeProvider({
  primary,
  secondary,
  children,
}: {
  primary?: string | null;
  secondary?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div data-tenant-root className="theme-tenant">
      <style dangerouslySetInnerHTML={{ __html: tenantThemeCss("[data-tenant-root]", primary, secondary) }} />
      {/* the boards' sparkline: a smooth curve with a soft fill (an explicit `smooth={false}` still draws the straight line) */}
      <SparklineDefaultsProvider smooth>{children}</SparklineDefaultsProvider>
    </div>
  );
}
