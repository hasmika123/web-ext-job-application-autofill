package com.dossier.api.service.resume;

import com.dossier.api.service.ResumeDocException;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
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
 * Validates and rewrites an uploaded profile photo (Resume Builder R7.4, DESIGN 5). RASTER ONLY, found by magic bytes (the
 * file name and the declared content type are never believed): JPEG, PNG and WebP. Anything else is a 415 {@code PHOTO_FORMAT}.
 *
 * <p><b>Nothing the camera wrote survives.</b> JPEG and PNG are decoded to pixels (the header's dimensions are checked first, so
 * a decompression bomb is refused before it is inflated; the JPEG's EXIF orientation is applied to the pixels, then discarded) and
 * written again as a fresh baseline JPEG at quality 85, cropped to a centred square and scaled down to at most 512 x 512. That
 * drops every EXIF / XMP / ICC / maker-note block, including GPS. The JDK has no WebP codec, so a WebP is not decoded: its RIFF
 * container is rebuilt from the image chunks only ({@code VP8 }, {@code VP8L}, {@code ALPH}, and a {@code VP8X} header with its
 * ICC / EXIF / XMP flags cleared); every other chunk is dropped, an animated file is refused, and it must be at most 1024 px on
 * a side (the editor crops and scales a picture before it uploads, so a real client never sends a larger one).
 *
 * <p>The photo is never inspected for anything else: no face detection, no matching, no embedding, nothing is inferred or stored
 * beyond the bytes that are drawn on the resume.
 */
@Component
public class ResumePhotoProcessor {

    public static final String CODE_FORMAT = "PHOTO_FORMAT";
    public static final String CODE_TOO_LARGE = "PHOTO_TOO_LARGE";
    public static final String CODE_INVALID = "PHOTO_INVALID";

    /** The stored photo is at most this many pixels on a side. */
    public static final int OUT_SIDE = 512;
    /** A photo smaller than this on its short side is refused: it would print as a smudge. */
    static final int MIN_SIDE = 64;
    /** Decode ceiling: a header that claims more than this is refused before any pixel is read. */
    static final int MAX_SIDE = 6000;
    static final long MAX_PIXELS = 24_000_000L;
    /** A WebP cannot be resized here, so it must already be this small. */
    static final int MAX_WEBP_SIDE = 1024;
    static final float JPEG_QUALITY = 0.85f;

    /** A processed photo, ready to store: the bytes, the file extension (with dot) and the content type. */
    public record Processed(byte[] bytes, String ext, String contentType, int width, int height) {}

    private enum Type { PNG, JPEG, WEBP }

    /** Rewrites {@code input}; throws a {@link ResumeDocException} (415 / 422) when it is not an acceptable photo. */
    public Processed process(byte[] input) {
        if (input == null || input.length == 0) throw invalid("The file is empty.");
        Type type = sniff(input);
        if (type == null) {
            throw new ResumeDocException(415, CODE_FORMAT, "Upload a JPEG, PNG or WebP picture.", Map.of("accepted", "jpeg,png,webp"));
        }
        return type == Type.WEBP ? webp(input) : raster(input, type);
    }

    // ---- JPEG / PNG ------------------------------------------------------------------------------------------------

    private Processed raster(byte[] input, Type type) {
        BufferedImage img;
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
            Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(type == Type.PNG ? "png" : "jpeg");
            if (!readers.hasNext()) throw invalid("This picture type can not be read on this server.");
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                int w = reader.getWidth(0);
                int h = reader.getHeight(0);
                if (w <= 0 || h <= 0 || w > MAX_SIDE || h > MAX_SIDE || (long) w * h > MAX_PIXELS) {
                    throw invalid("The picture is too large to process (at most " + MAX_SIDE + " px on a side).");
                }
                if (Math.min(w, h) < MIN_SIDE) throw invalid("The picture is too small (at least " + MIN_SIDE + " px on the short side).");
                img = reader.read(0);
            } finally {
                reader.dispose();
            }
        } catch (ResumeDocException e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            throw invalid("The file is not a valid picture.");
        }
        if (img == null) throw invalid("The file is not a valid picture.");

        if (type == Type.JPEG) img = oriented(img, exifOrientation(input));
        BufferedImage square = squareAndScale(img);
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            writeJpeg(square, out);
            return new Processed(out.toByteArray(), ".jpg", "image/jpeg", square.getWidth(), square.getHeight());
        } catch (IOException e) {
            throw invalid("The picture could not be processed.");
        }
    }

    /** A centred square of the picture, scaled down to {@link #OUT_SIDE} (never up), flattened onto white. */
    private static BufferedImage squareAndScale(BufferedImage src) {
        int side = Math.min(src.getWidth(), src.getHeight());
        int x = (src.getWidth() - side) / 2;
        int y = (src.getHeight() - side) / 2;
        int target = Math.min(side, OUT_SIDE);
        BufferedImage out = new BufferedImage(target, target, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, target, target);
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.drawImage(src, 0, 0, target, target, x, y, x + side, y + side, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    private static void writeJpeg(BufferedImage rgb, ByteArrayOutputStream out) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        if (!writers.hasNext()) throw new IOException("no jpeg writer");
        ImageWriter writer = writers.next();
        try (MemoryCacheImageOutputStream ios = new MemoryCacheImageOutputStream(out)) {
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(JPEG_QUALITY);
            writer.setOutput(ios);
            // null metadata = the writer's own default (a bare JFIF header): none of the input's metadata is carried over.
            writer.write(null, new IIOImage(rgb, null, null), param);
        } finally {
            writer.dispose();
        }
    }

    // ---- EXIF orientation (read, applied to the pixels, then dropped with the rest) ----------------------------------

    /** The EXIF orientation (1..8) of a JPEG, or 1 when there is none or it does not parse. */
    static int exifOrientation(byte[] b) {
        try {
            int i = 2; // after SOI
            while (i + 4 <= b.length && (b[i] & 0xff) == 0xff) {
                int marker = b[i + 1] & 0xff;
                if (marker == 0xda || marker == 0xd9) break; // image data
                int len = ((b[i + 2] & 0xff) << 8) | (b[i + 3] & 0xff);
                if (marker == 0xe1 && len >= 14 && b[i + 4] == 'E' && b[i + 5] == 'x' && b[i + 6] == 'i' && b[i + 7] == 'f' && b[i + 8] == 0 && b[i + 9] == 0) {
                    int tiff = i + 10;
                    boolean le = b[tiff] == 'I';
                    int ifd = tiff + (int) u32(b, tiff + 4, le);
                    int entries = u16(b, ifd, le);
                    for (int e = 0; e < entries; e++) {
                        int at = ifd + 2 + e * 12;
                        if (u16(b, at, le) == 0x0112) {
                            int o = u16(b, at + 8, le);
                            return o >= 1 && o <= 8 ? o : 1;
                        }
                    }
                    return 1;
                }
                i += 2 + len;
            }
        } catch (RuntimeException ignored) {
            // a truncated or hostile block: treat as "no orientation"
        }
        return 1;
    }

    private static int u16(byte[] b, int at, boolean le) {
        int a = b[at] & 0xff;
        int c = b[at + 1] & 0xff;
        return le ? (c << 8) | a : (a << 8) | c;
    }

    private static long u32(byte[] b, int at, boolean le) {
        long lo = u16(b, at, le);
        long hi = u16(b, at + 2, le);
        return le ? (hi << 16) | lo : (lo << 16) | hi;
    }

    /** The picture turned upright for EXIF orientation {@code o} (1 = already upright). */
    static BufferedImage oriented(BufferedImage src, int o) {
        if (o <= 1 || o > 8) return src;
        int w = src.getWidth();
        int h = src.getHeight();
        boolean swap = o >= 5;
        // AffineTransform(m00, m10, m01, m11, m02, m12): x' = m00*x + m01*y + m02, y' = m10*x + m11*y + m12.
        AffineTransform t = switch (o) {
            case 2 -> new AffineTransform(-1, 0, 0, 1, w, 0); // mirrored left-right
            case 3 -> new AffineTransform(-1, 0, 0, -1, w, h); // upside down
            case 4 -> new AffineTransform(1, 0, 0, -1, 0, h); // mirrored top-bottom
            case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0); // transposed
            case 6 -> new AffineTransform(0, 1, -1, 0, h, 0); // a quarter turn clockwise to be upright
            case 7 -> new AffineTransform(0, -1, -1, 0, h, w); // transversed
            default -> new AffineTransform(0, -1, 1, 0, 0, w); // 8: a quarter turn counter-clockwise to be upright
        };
        BufferedImage out = new BufferedImage(swap ? h : w, swap ? w : h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, out.getWidth(), out.getHeight());
            g.drawImage(src, t, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    // ---- WebP --------------------------------------------------------------------------------------------------------

    private Processed webp(byte[] b) {
        long riff = (b[4] & 0xffL) | ((b[5] & 0xffL) << 8) | ((b[6] & 0xffL) << 16) | ((b[7] & 0xffL) << 24);
        if (riff + 8 != b.length) throw invalid("The file is not a valid WebP picture.");

        byte[] vp8x = null;
        java.util.List<byte[]> kept = new java.util.ArrayList<>(); // [fourcc(4) | payload]
        boolean image = false;
        int pos = 12;
        while (pos + 8 <= b.length) {
            String id = new String(b, pos, 4, StandardCharsets.ISO_8859_1);
            long size = (b[pos + 4] & 0xffL) | ((b[pos + 5] & 0xffL) << 8) | ((b[pos + 6] & 0xffL) << 16) | ((b[pos + 7] & 0xffL) << 24);
            long end = pos + 8 + size;
            if (end > b.length) throw invalid("The file is not a valid WebP picture.");
            byte[] payload = java.util.Arrays.copyOfRange(b, pos + 8, (int) end);
            switch (id) {
                case "ANIM", "ANMF" -> throw invalid("Animated pictures are not accepted.");
                case "VP8X" -> vp8x = payload;
                case "VP8 ", "VP8L" -> {
                    if (image) throw invalid("The file is not a valid WebP picture.");
                    image = true;
                    kept.add(concat(id.getBytes(StandardCharsets.ISO_8859_1), payload));
                }
                case "ALPH" -> kept.add(concat(id.getBytes(StandardCharsets.ISO_8859_1), payload));
                default -> { /* ICCP, EXIF, XMP and anything unknown are dropped */ }
            }
            pos = (int) (end + (size & 1)); // chunks are padded to an even length
        }
        if (!image) throw invalid("The file is not a valid WebP picture.");

        int[] dim = webpSize(vp8x, kept);
        if (dim == null) throw invalid("The file is not a valid WebP picture.");
        if (Math.min(dim[0], dim[1]) < MIN_SIDE) throw invalid("The picture is too small (at least " + MIN_SIDE + " px on the short side).");
        if (dim[0] > MAX_WEBP_SIDE || dim[1] > MAX_WEBP_SIDE) {
            throw invalid("A WebP picture must be at most " + MAX_WEBP_SIDE + " px on a side (JPEG and PNG are resized for you).");
        }

        ByteArrayOutputStream body = new ByteArrayOutputStream();
        if (vp8x != null) {
            if (vp8x.length < 10) throw invalid("The file is not a valid WebP picture.");
            byte[] header = vp8x.clone();
            header[0] = (byte) (header[0] & 0x10); // keep only the alpha flag: no ICC (0x20), animation (0x02), EXIF (0x08), XMP (0x04)
            writeChunk(body, "VP8X".getBytes(StandardCharsets.ISO_8859_1), java.util.Arrays.copyOfRange(header, 0, 10));
        }
        for (byte[] chunk : kept) writeChunk(body, java.util.Arrays.copyOfRange(chunk, 0, 4), java.util.Arrays.copyOfRange(chunk, 4, chunk.length));
        byte[] chunks = body.toByteArray();

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes("RIFF".getBytes(StandardCharsets.ISO_8859_1));
        writeLe32(out, 4 + chunks.length);
        out.writeBytes("WEBP".getBytes(StandardCharsets.ISO_8859_1));
        out.writeBytes(chunks);
        return new Processed(out.toByteArray(), ".webp", "image/webp", dim[0], dim[1]);
    }

    private static void writeChunk(ByteArrayOutputStream out, byte[] fourcc, byte[] payload) {
        out.writeBytes(fourcc);
        writeLe32(out, payload.length);
        out.writeBytes(payload);
        if ((payload.length & 1) == 1) out.write(0);
    }

    private static void writeLe32(ByteArrayOutputStream out, int v) {
        out.write(v & 0xff);
        out.write((v >> 8) & 0xff);
        out.write((v >> 16) & 0xff);
        out.write((v >> 24) & 0xff);
    }

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] r = java.util.Arrays.copyOf(a, a.length + b.length);
        System.arraycopy(b, 0, r, a.length, b.length);
        return r;
    }

    /** Width and height from the VP8X header, else from the VP8 / VP8L bitstream header; null when it does not parse. */
    static int[] webpSize(byte[] vp8x, java.util.List<byte[]> kept) {
        if (vp8x != null && vp8x.length >= 10) {
            int w = 1 + ((vp8x[4] & 0xff) | ((vp8x[5] & 0xff) << 8) | ((vp8x[6] & 0xff) << 16));
            int h = 1 + ((vp8x[7] & 0xff) | ((vp8x[8] & 0xff) << 8) | ((vp8x[9] & 0xff) << 16));
            return new int[] {w, h};
        }
        for (byte[] c : kept) {
            String id = new String(c, 0, 4, StandardCharsets.ISO_8859_1);
            if (id.equals("VP8 ") && c.length >= 4 + 10 && (c[7] & 0xff) == 0x9d && (c[8] & 0xff) == 0x01 && (c[9] & 0xff) == 0x2a) {
                int w = ((c[10] & 0xff) | ((c[11] & 0xff) << 8)) & 0x3fff;
                int h = ((c[12] & 0xff) | ((c[13] & 0xff) << 8)) & 0x3fff;
                return new int[] {w, h};
            }
            if (id.equals("VP8L") && c.length >= 4 + 5 && (c[4] & 0xff) == 0x2f) {
                int b1 = c[5] & 0xff;
                int b2 = c[6] & 0xff;
                int b3 = c[7] & 0xff;
                int b4 = c[8] & 0xff;
                int w = 1 + (((b2 & 0x3f) << 8) | b1);
                int h = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
                return new int[] {w, h};
            }
        }
        return null;
    }

    // ---- shared ------------------------------------------------------------------------------------------------------

    private static Type sniff(byte[] b) {
        if (b.length >= 8 && (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G' && b[4] == 0x0d && b[5] == 0x0a && b[6] == 0x1a && b[7] == 0x0a) return Type.PNG;
        if (b.length >= 3 && (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8 && (b[2] & 0xff) == 0xff) return Type.JPEG;
        if (b.length >= 16 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return Type.WEBP;
        return null;
    }

    private static ResumeDocException invalid(String message) {
        return new ResumeDocException(422, CODE_INVALID, message, Map.of("message", message));
    }
}
