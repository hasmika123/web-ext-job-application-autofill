package com.dossier.api.service.ent;

import com.dossier.api.service.org.OrgException;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.springframework.stereotype.Component;

/**
 * Validates and re-encodes an uploaded branding image (X2.5, threat T54). RASTER ONLY: PNG, JPEG, WebP, found by their
 * magic bytes (the file name and the declared content type are never believed). SVG, ICO, GIF, PDF, HTML and anything else
 * is a 415. For PNG and JPEG the pixels are decoded (after the header says the dimensions are sane, so a decompression
 * bomb is refused before it is inflated) and written again, which strips every chunk and EXIF block and drops anything a
 * polyglot file appended; a file that does not decode is a 422. WebP has no encoder in the JDK: it is accepted only when
 * the RIFF container is exactly as long as it says (nothing appended), its header parses, and it contains no markup, and it
 * is then stored unchanged (recorded as a deviation from "always re-encode").
 *
 * <p>Limits per kind: logo at most 512 KB and at least 64 px tall; favicon at most 256 KB, square, 64 to 512 px; banner at
 * most 2 MB, landscape, at least 1200 px wide. Logos taller than 256 px and banners wider than 2400 px are scaled down.
 */
@Component
public class BrandingAssetProcessor {

    public static final String UNSUPPORTED_TYPE = "BRANDING_ASSET_UNSUPPORTED_TYPE";
    public static final String TOO_LARGE = "BRANDING_ASSET_TOO_LARGE";
    public static final String TOO_SMALL = "BRANDING_ASSET_TOO_SMALL";
    public static final String INVALID = "BRANDING_ASSET_INVALID";
    public static final String NOT_SQUARE = "BRANDING_ASSET_NOT_SQUARE";

    static final int MAX_SIDE = 4096;
    static final long MAX_PIXELS = 16_000_000L;

    /** A validated, re-encoded asset ready to be stored. */
    public record Processed(byte[] bytes, String ext, String contentType, int width, int height) {}

    private enum Type { PNG, JPEG, WEBP }

    public Processed process(String kind, byte[] input) {
        long max = maxBytes(kind);
        if (input == null || input.length == 0) throw invalid("The file is empty.");
        Type type = sniff(input);
        if (type == null) {
            throw OrgException.coded(415, UNSUPPORTED_TYPE, "Upload a PNG, JPEG or WebP image. SVG and other formats are not accepted.", Map.of("kind", kind, "accepted", "png,jpg,webp"));
        }
        if (input.length > max) {
            throw OrgException.coded(413, TOO_LARGE, "The image is larger than " + (max / 1024) + " KB.", Map.of("kind", kind, "maxBytes", max));
        }
        return switch (type) {
            case WEBP -> webp(kind, input);
            default -> raster(kind, input, type);
        };
    }

    static long maxBytes(String kind) {
        return switch (kind) {
            case "favicon" -> 256L * 1024;
            case "banner" -> 2L * 1024 * 1024;
            default -> 512L * 1024;
        };
    }

    private static Type sniff(byte[] b) {
        if (b.length >= 8 && (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G' && b[4] == 0x0d && b[5] == 0x0a && b[6] == 0x1a && b[7] == 0x0a) return Type.PNG;
        if (b.length >= 3 && (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8 && (b[2] & 0xff) == 0xff) return Type.JPEG;
        if (b.length >= 16 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return Type.WEBP;
        return null;
    }

    // ---- PNG / JPEG ------------------------------------------------------------------------------------------------

    private Processed raster(String kind, byte[] input, Type type) {
        BufferedImage img;
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
            Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(type == Type.PNG ? "png" : "jpeg");
            if (!readers.hasNext()) throw invalid("This image type can not be read on this server.");
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                int w = reader.getWidth(0);
                int h = reader.getHeight(0);
                if (w <= 0 || h <= 0 || w > MAX_SIDE || h > MAX_SIDE || (long) w * h > MAX_PIXELS) {
                    throw OrgException.coded(422, INVALID, "The image is too large to process (at most " + MAX_SIDE + " px on a side).", Map.of("kind", kind));
                }
                checkDimensions(kind, w, h);
                img = reader.read(0);
            } finally {
                reader.dispose();
            }
        } catch (OrgException e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            throw invalid("The file is not a valid image.");
        }
        if (img == null) throw invalid("The file is not a valid image.");

        img = scaleDown(kind, img, type == Type.PNG);
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (type == Type.PNG) {
                if (!ImageIO.write(img, "png", out)) throw invalid("The image could not be processed.");
                return new Processed(out.toByteArray(), "png", "image/png", img.getWidth(), img.getHeight());
            }
            writeJpeg(img, out);
            return new Processed(out.toByteArray(), "jpg", "image/jpeg", img.getWidth(), img.getHeight());
        } catch (IOException e) {
            throw invalid("The image could not be processed.");
        }
    }

    private static void writeJpeg(BufferedImage src, ByteArrayOutputStream out) throws IOException {
        BufferedImage rgb = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D g = rgb.createGraphics();
        g.setColor(java.awt.Color.WHITE);
        g.fillRect(0, 0, rgb.getWidth(), rgb.getHeight());
        g.drawImage(src, 0, 0, null);
        g.dispose();
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        try (MemoryCacheImageOutputStream ios = new MemoryCacheImageOutputStream(out)) {
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(0.9f);
            writer.setOutput(ios);
            writer.write(null, new IIOImage(rgb, null, null), param);
        } finally {
            writer.dispose();
        }
    }

    private static BufferedImage scaleDown(String kind, BufferedImage img, boolean alpha) {
        int w = img.getWidth();
        int h = img.getHeight();
        double factor = 1;
        if ("logo".equals(kind) && h > 256) factor = 256.0 / h;
        else if ("banner".equals(kind) && w > 2400) factor = 2400.0 / w;
        BufferedImage target = img;
        if (factor < 1) {
            int nw = Math.max(1, (int) Math.round(w * factor));
            int nh = Math.max(1, (int) Math.round(h * factor));
            target = new BufferedImage(nw, nh, alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
            Graphics2D g = target.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.drawImage(img, 0, 0, nw, nh, null);
            g.dispose();
        } else if (alpha && img.getType() != BufferedImage.TYPE_INT_ARGB) {
            target = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = target.createGraphics();
            g.drawImage(img, 0, 0, null);
            g.dispose();
        }
        return target;
    }

    // ---- WebP ------------------------------------------------------------------------------------------------------

    private Processed webp(String kind, byte[] b) {
        long riff = (b[4] & 0xffL) | ((b[5] & 0xffL) << 8) | ((b[6] & 0xffL) << 16) | ((b[7] & 0xffL) << 24);
        if (riff + 8 != b.length) throw invalid("The file is not a valid WebP image.");
        String text = new String(b, StandardCharsets.ISO_8859_1).toLowerCase(Locale.ROOT);
        if (text.contains("<script") || text.contains("<svg") || text.contains("<?xml") || text.contains("<html") || text.contains("javascript:")) {
            throw invalid("The file is not a valid WebP image.");
        }
        int[] dim = webpSize(b);
        if (dim == null) throw invalid("The file is not a valid WebP image.");
        if (dim[0] > MAX_SIDE || dim[1] > MAX_SIDE) throw invalid("The image is too large to process (at most " + MAX_SIDE + " px on a side).");
        checkDimensions(kind, dim[0], dim[1]);
        if (("logo".equals(kind) && dim[1] > 256) || ("banner".equals(kind) && dim[0] > 2400)) {
            throw OrgException.coded(422, INVALID, "WebP " + kind + " images must be at most " + ("logo".equals(kind) ? "256 px tall" : "2400 px wide") + " (PNG and JPEG are resized for you).", Map.of("kind", kind));
        }
        return new Processed(b.clone(), "webp", "image/webp", dim[0], dim[1]);
    }

    /** Width and height from the first WebP chunk (VP8, VP8L or VP8X); null when it does not parse. */
    static int[] webpSize(byte[] b) {
        if (b.length < 30) return null;
        String chunk = new String(b, 12, 4, StandardCharsets.ISO_8859_1);
        switch (chunk) {
            case "VP8 ": {
                if ((b[23] & 0xff) != 0x9d || (b[24] & 0xff) != 0x01 || (b[25] & 0xff) != 0x2a) return null;
                int w = ((b[26] & 0xff) | ((b[27] & 0xff) << 8)) & 0x3fff;
                int h = ((b[28] & 0xff) | ((b[29] & 0xff) << 8)) & 0x3fff;
                return new int[] {w, h};
            }
            case "VP8L": {
                if ((b[20] & 0xff) != 0x2f) return null;
                int b1 = b[21] & 0xff;
                int b2 = b[22] & 0xff;
                int b3 = b[23] & 0xff;
                int b4 = b[24] & 0xff;
                int w = 1 + (((b2 & 0x3f) << 8) | b1);
                int h = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
                return new int[] {w, h};
            }
            case "VP8X": {
                int w = 1 + ((b[24] & 0xff) | ((b[25] & 0xff) << 8) | ((b[26] & 0xff) << 16));
                int h = 1 + ((b[27] & 0xff) | ((b[28] & 0xff) << 8) | ((b[29] & 0xff) << 16));
                return new int[] {w, h};
            }
            default:
                return null;
        }
    }

    // ---- shared ----------------------------------------------------------------------------------------------------

    private static void checkDimensions(String kind, int w, int h) {
        switch (kind) {
            case "logo" -> {
                if (h < 64 || w < 16) throw tooSmall(kind, "A logo must be at least 64 px tall (yours is " + w + " x " + h + ").", w, h);
            }
            case "favicon" -> {
                if (w != h) throw OrgException.coded(422, NOT_SQUARE, "A favicon must be square (yours is " + w + " x " + h + ").", Map.of("kind", kind, "width", w, "height", h));
                if (w < 64) throw tooSmall(kind, "A favicon must be at least 64 x 64 px.", w, h);
                if (w > 512) throw OrgException.coded(422, INVALID, "A favicon must be at most 512 x 512 px.", Map.of("kind", kind, "width", w, "height", h));
            }
            case "banner" -> {
                if (w < 1200) throw tooSmall(kind, "A banner must be at least 1200 px wide (yours is " + w + ").", w, h);
                if (w <= h) throw invalid("A banner must be landscape.");
            }
            default -> throw invalid("Unknown asset kind.");
        }
    }

    private static OrgException tooSmall(String kind, String message, int w, int h) {
        return OrgException.coded(422, TOO_SMALL, message, Map.of("kind", kind, "width", w, "height", h));
    }

    private static OrgException invalid(String message) {
        return OrgException.coded(422, INVALID, message, Map.of());
    }
}
