package com.dossier.api.service.ent.resumes;

import com.dossier.api.service.dto.ent.ResumeBoardDTO;
import java.util.Locale;

/**
 * Renders the structured resume (headline, summary, skills, experience) as a plain-text file or a self-contained printable HTML page. There is no
 * stored file: the export is generated from the same fields as the on-screen preview. The HTML has no script and escapes every value.
 */
final class ResumeExportRenderer {

    private ResumeExportRenderer() {}

    /** A file name stem: the plain file name the record carries (without extension), else the resume name; letters, digits, dot, dash only. */
    static String baseName(ResumeBoardDTO.Row row) {
        String stem = row.fileName() != null && !row.fileName().isBlank() ? row.fileName() : row.name();
        int dot = stem.lastIndexOf('.');
        if (dot > 0 && stem.length() - dot <= 5) stem = stem.substring(0, dot);
        String safe = stem.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "_").replaceAll("^_+|_+$", "");
        return safe.isEmpty() ? "resume" : safe.length() > 80 ? safe.substring(0, 80) : safe;
    }

    private static String years(ResumeBoardDTO.Experience e) {
        return e.startYear() + " - " + (e.endYear() == null ? "Present" : String.valueOf(e.endYear()));
    }

    static String text(ResumeBoardDTO.Detail d) {
        ResumeBoardDTO.Row r = d.row();
        ResumeBoardDTO.Preview p = d.preview();
        StringBuilder b = new StringBuilder();
        b.append(r.consultant().name()).append('\n');
        if (p.headline() != null && !p.headline().isBlank()) b.append(p.headline()).append('\n');
        StringBuilder contact = new StringBuilder();
        if (r.consultant().email() != null) contact.append(r.consultant().email());
        if (r.consultant().location() != null && !r.consultant().location().isBlank()) contact.append(contact.length() > 0 ? "  |  " : "").append(r.consultant().location());
        if (contact.length() > 0) b.append(contact).append('\n');
        b.append('\n');
        if (p.summary() != null && !p.summary().isBlank()) b.append("PROFESSIONAL SUMMARY\n").append(p.summary()).append("\n\n");
        if (!p.skills().isEmpty()) b.append("KEY SKILLS\n").append(String.join(", ", p.skills())).append("\n\n");
        if (!p.experience().isEmpty()) {
            b.append("EXPERIENCE\n");
            for (ResumeBoardDTO.Experience e : p.experience()) b.append(e.title()).append(", ").append(e.employer()).append(" (").append(years(e)).append(")\n");
            b.append('\n');
        }
        b.append("Resume: ").append(r.name()).append("  |  Version ").append(r.version()).append("  |  Generated from the structured resume record.\n");
        return b.toString();
    }

    static String esc(String s) {
        if (s == null) return "";
        StringBuilder b = new StringBuilder(s.length() + 8);
        for (char c : s.toCharArray()) {
            switch (c) {
                case '&' -> b.append("&amp;");
                case '<' -> b.append("&lt;");
                case '>' -> b.append("&gt;");
                case '"' -> b.append("&quot;");
                case '\'' -> b.append("&#39;");
                default -> b.append(c);
            }
        }
        return b.toString();
    }

    static String html(ResumeBoardDTO.Detail d) {
        ResumeBoardDTO.Row r = d.row();
        ResumeBoardDTO.Preview p = d.preview();
        StringBuilder b = new StringBuilder(2048);
        b.append("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
        b.append("<title>").append(esc(r.name())).append("</title><style>");
        b.append("body{font:14px/1.5 Helvetica,Arial,sans-serif;color:#1c2430;margin:0;padding:32px;max-width:760px}");
        b.append("h1{font-size:26px;margin:0}h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid #cbd2dc;padding-bottom:4px;margin:22px 0 8px}");
        b.append(".sub{color:#4a5565;margin:2px 0}.skills span{display:inline-block;border:1px solid #cbd2dc;border-radius:999px;padding:2px 10px;margin:0 6px 6px 0;font-size:12px}");
        b.append(".job{display:flex;justify-content:space-between;gap:16px;margin:6px 0}.job small{color:#4a5565;display:block}.foot{margin-top:28px;color:#6b7686;font-size:11px}");
        b.append("@media print{body{padding:0}}</style></head><body>");
        b.append("<h1>").append(esc(r.consultant().name())).append("</h1>");
        if (p.headline() != null && !p.headline().isBlank()) b.append("<p class=\"sub\"><strong>").append(esc(p.headline())).append("</strong></p>");
        StringBuilder contact = new StringBuilder();
        if (r.consultant().email() != null) contact.append(esc(r.consultant().email()));
        if (r.consultant().location() != null && !r.consultant().location().isBlank()) contact.append(contact.length() > 0 ? " &middot; " : "").append(esc(r.consultant().location()));
        if (contact.length() > 0) b.append("<p class=\"sub\">").append(contact).append("</p>");
        if (p.summary() != null && !p.summary().isBlank()) b.append("<h2>Professional summary</h2><p>").append(esc(p.summary())).append("</p>");
        if (!p.skills().isEmpty()) {
            b.append("<h2>Key skills</h2><div class=\"skills\">");
            for (String s : p.skills()) b.append("<span>").append(esc(s)).append("</span>");
            b.append("</div>");
        }
        if (!p.experience().isEmpty()) {
            b.append("<h2>Experience</h2>");
            for (ResumeBoardDTO.Experience e : p.experience()) {
                b.append("<div class=\"job\"><div><strong>").append(esc(e.title())).append("</strong><small>").append(esc(e.employer())).append("</small></div><div>").append(esc(years(e))).append("</div></div>");
            }
        }
        b.append("<p class=\"foot\">").append(esc(r.name())).append(" &middot; version ").append(r.version()).append(" &middot; generated from the structured resume record.</p>");
        b.append("</body></html>");
        return b.toString();
    }
}
