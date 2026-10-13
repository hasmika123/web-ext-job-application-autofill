package com.dossier.api.service.ent;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Colour rules for organization branding (11-branding-and-login.md section 4, WCAG 2.1). An organization picks a PRIMARY
 * and a SECONDARY colour; the tenant UI puts WHITE text on them (buttons, chips, badges, the nav band), so a colour is
 * accepted only when white on it reaches the AA body-text ratio. A colour that fails is refused with the nearest
 * acceptable colour (same hue and saturation, lower lightness) so the editor can offer it in one click. The web derives the
 * full 50..900 shade scales from the two accepted colours (packages/ui {@code brandScale}); those derivations are tested for
 * contrast there, and this class is the server-side gate that nobody can store an unreadable base colour.
 *
 * <p>Pure functions, no state. The math is the WCAG 2.1 relative-luminance definition; the golden values in
 * {@code BrandingColorsTest} are shared with {@code packages/ui/src/color/contrast.test.ts}.
 */
public final class BrandingColors {

    /** WCAG AA for body text. */
    public static final double AA_BODY = 4.5;
    /** WCAG AA for large text and UI components. */
    public static final double AA_LARGE = 3.0;

    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final String WHITE = "#ffffff";

    private BrandingColors() {}

    public static boolean isHex(String value) {
        return value != null && HEX.matcher(value).matches();
    }

    /** Lower-case {@code #rrggbb}. The caller has already checked {@link #isHex}. */
    public static String normalise(String hex) {
        return hex.toLowerCase(Locale.ROOT);
    }

    /** WCAG relative luminance of {@code #rrggbb}. */
    public static double luminance(String hex) {
        int rgb = Integer.parseInt(hex.substring(1), 16);
        return 0.2126 * channel((rgb >> 16) & 0xff) + 0.7152 * channel((rgb >> 8) & 0xff) + 0.0722 * channel(rgb & 0xff);
    }

    private static double channel(int c8) {
        double c = c8 / 255.0;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    /** WCAG contrast ratio of two colours, 1 to 21. */
    public static double contrast(String a, String b) {
        double la = luminance(a);
        double lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    /** Contrast of white text on {@code hex}. */
    public static double onWhite(String hex) {
        return contrast(hex, WHITE);
    }

    /** True when white text on {@code hex} meets AA body text (4.5:1). */
    public static boolean allowsWhiteText(String hex) {
        return onWhite(hex) >= AA_BODY;
    }

    /**
     * The nearest colour that allows white text: the same hue and saturation with the lightness lowered one percent at a
     * time until white on it reaches {@link #AA_BODY}. Returns {@code hex} unchanged when it already qualifies.
     */
    public static String suggestForWhiteText(String hex) {
        String h = normalise(hex);
        if (allowsWhiteText(h)) return h;
        int rgb = Integer.parseInt(h.substring(1), 16);
        double[] hsl = toHsl((rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff);
        for (double l = hsl[2]; l >= 0; l -= 0.005) {
            String candidate = fromHsl(hsl[0], hsl[1], l);
            if (allowsWhiteText(candidate)) return candidate;
        }
        return "#000000";
    }

    private static double[] toHsl(int r8, int g8, int b8) {
        double r = r8 / 255.0;
        double g = g8 / 255.0;
        double b = b8 / 255.0;
        double max = Math.max(r, Math.max(g, b));
        double min = Math.min(r, Math.min(g, b));
        double l = (max + min) / 2;
        double h = 0;
        double s = 0;
        double d = max - min;
        if (d != 0) {
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max == r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max == g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
        }
        return new double[] {h, s, l};
    }

    private static String fromHsl(double h, double s, double l) {
        double r;
        double g;
        double b;
        if (s == 0) {
            r = l;
            g = l;
            b = l;
        } else {
            double q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            double p = 2 * l - q;
            r = hue(p, q, h + 1.0 / 3);
            g = hue(p, q, h);
            b = hue(p, q, h - 1.0 / 3);
        }
        return String.format(Locale.ROOT, "#%02x%02x%02x", Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
    }

    private static double hue(double p, double q, double t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1.0 / 6) return p + (q - p) * 6 * t;
        if (t < 1.0 / 2) return q;
        if (t < 2.0 / 3) return p + (q - p) * (2.0 / 3 - t) * 6;
        return p;
    }
}
