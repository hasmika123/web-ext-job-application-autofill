package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.org.OrgException;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Random;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

/** T54: raster only, magic bytes decide, re-encoded, size and dimension rules per kind. */
class BrandingAssetProcessorTest {

    private final BrandingAssetProcessor processor = new BrandingAssetProcessor();

    private static byte[] png(int w, int h) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(15, 95, 196));
        g.fillRect(0, 0, w, h);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private static byte[] noisyPng(int w, int h) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Random r = new Random(1);
        for (int x = 0; x < w; x++) for (int y = 0; y < h; y++) img.setRGB(x, y, r.nextInt(0xffffff));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private static byte[] jpg(int w, int h) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", out);
        return out.toByteArray();
    }

    private static void assertRejected(Runnable r, int status, String code) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(status);
            assertThat(e.getCode()).isEqualTo(code);
        });
    }

    @Test
    void aValidPngLogoIsReEncodedAndKeepsItsSize() throws Exception {
        byte[] in = png(200, 80);
        BrandingAssetProcessor.Processed p = processor.process("logo", in);
        assertThat(p.ext()).isEqualTo("png");
        assertThat(p.contentType()).isEqualTo("image/png");
        assertThat(p.width()).isEqualTo(200);
        assertThat(p.height()).isEqualTo(80);
        assertThat(ImageIO.read(new ByteArrayInputStream(p.bytes()))).isNotNull();
    }

    @Test
    void aTallLogoIsScaledDownTo256() throws Exception {
        BrandingAssetProcessor.Processed p = processor.process("logo", png(600, 512));
        assertThat(p.height()).isEqualTo(256);
        assertThat(p.width()).isEqualTo(300);
    }

    @Test
    void aJpegIsReEncodedAsJpeg() throws Exception {
        BrandingAssetProcessor.Processed p = processor.process("logo", jpg(160, 100));
        assertThat(p.ext()).isEqualTo("jpg");
        assertThat(p.contentType()).isEqualTo("image/jpeg");
    }

    @Test
    void svgIsUnsupported415EvenWithAPngNameOrContentType() {
        byte[] svg = "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'><script>1</script></svg>".getBytes(StandardCharsets.UTF_8);
        assertRejected(() -> processor.process("logo", svg), 415, BrandingAssetProcessor.UNSUPPORTED_TYPE);
        assertRejected(() -> processor.process("favicon", "<?xml version='1.0'?><svg/>".getBytes(StandardCharsets.UTF_8)), 415, BrandingAssetProcessor.UNSUPPORTED_TYPE);
    }

    @Test
    void gifHtmlAndEmptyAreRefused() {
        assertRejected(() -> processor.process("logo", "GIF89a....".getBytes(StandardCharsets.UTF_8)), 415, BrandingAssetProcessor.UNSUPPORTED_TYPE);
        assertRejected(() -> processor.process("logo", "<html><script>x</script></html>".getBytes(StandardCharsets.UTF_8)), 415, BrandingAssetProcessor.UNSUPPORTED_TYPE);
        assertRejected(() -> processor.process("logo", new byte[0]), 422, BrandingAssetProcessor.INVALID);
    }

    @Test
    void aPngHeaderFollowedByScriptIsNotAnImage() {
        byte[] polyglot = new byte[64];
        byte[] head = {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a};
        System.arraycopy(head, 0, polyglot, 0, 8);
        byte[] script = "<script>alert(document.cookie)</script>".getBytes(StandardCharsets.UTF_8);
        System.arraycopy(script, 0, polyglot, 8, script.length);
        assertRejected(() -> processor.process("logo", polyglot), 422, BrandingAssetProcessor.INVALID);
    }

    @Test
    void scriptAppendedAfterAValidPngIsDroppedByTheReEncode() throws Exception {
        byte[] valid = png(120, 80);
        byte[] script = "<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8);
        byte[] both = new byte[valid.length + script.length];
        System.arraycopy(valid, 0, both, 0, valid.length);
        System.arraycopy(script, 0, both, valid.length, script.length);
        BrandingAssetProcessor.Processed p = processor.process("logo", both);
        assertThat(new String(p.bytes(), StandardCharsets.ISO_8859_1)).doesNotContain("<script");
    }

    @Test
    void tooSmallLogoFavicon_andBannerAre422TooSmall() throws Exception {
        assertRejected(() -> processor.process("logo", sqr(160, 40)), 422, BrandingAssetProcessor.TOO_SMALL);
        assertRejected(() -> processor.process("favicon", sq(32)), 422, BrandingAssetProcessor.TOO_SMALL);
        assertRejected(() -> processor.process("banner", sqr(800, 300)), 422, BrandingAssetProcessor.TOO_SMALL);
    }

    private static byte[] sq(int n) {
        try {
            return png(n, n);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void faviconMustBeSquare() throws Exception {
        assertRejected(() -> processor.process("favicon", sqr(128, 64)), 422, BrandingAssetProcessor.NOT_SQUARE);
        assertThat(processor.process("favicon", sq(128)).width()).isEqualTo(128);
    }

    private static byte[] sqr(int w, int h) {
        try {
            return png(w, h);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void oversizeIs413() throws Exception {
        byte[] big = noisyPng(700, 700); // incompressible: well over 512 KB
        assertThat(big.length).isGreaterThan(512 * 1024);
        assertRejected(() -> processor.process("logo", big), 413, BrandingAssetProcessor.TOO_LARGE);
    }

    @Test
    void aDecompressionBombIsRefusedBeforeItIsInflated() {
        // a PNG whose IHDR claims 60000 x 60000: the header check refuses it without allocating the pixels
        byte[] bomb = {
            (byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a,
            0, 0, 0, 13, 'I', 'H', 'D', 'R', 0, 0, (byte) 0xEA, 0x60, 0, 0, (byte) 0xEA, 0x60, 8, 6, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 'I', 'E', 'N', 'D', (byte) 0xAE, 0x42, 0x60, (byte) 0x82
        };
        assertThatThrownBy(() -> processor.process("logo", bomb)).isInstanceOf(OrgException.class);
    }

    @Test
    void webpWithAnExactContainerIsKeptAndOneWithAppendedMarkupIsRefused() {
        byte[] ok = webp(300, 100, "");
        BrandingAssetProcessor.Processed p = processor.process("logo", webp(300, 100, ""));
        assertThat(p.ext()).isEqualTo("webp");
        assertThat(p.width()).isEqualTo(300);
        assertThat(p.height()).isEqualTo(100);
        assertThat(ok).isNotEmpty();
        assertRejected(() -> processor.process("logo", webp(300, 100, "<script>x</script>")), 422, BrandingAssetProcessor.INVALID);
    }

    /** A minimal lossy WebP (RIFF, VP8 chunk with a valid frame header); {@code extra} is appended inside the chunk. */
    private static byte[] webp(int w, int h, String extra) {
        byte[] x = extra.getBytes(StandardCharsets.UTF_8);
        int chunkLen = 10 + x.length;
        int pad = chunkLen % 2;
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        int riff = 4 + 8 + chunkLen + pad;
        o.writeBytes(new byte[] {'R', 'I', 'F', 'F', (byte) riff, (byte) (riff >> 8), (byte) (riff >> 16), (byte) (riff >> 24), 'W', 'E', 'B', 'P'});
        o.writeBytes(new byte[] {'V', 'P', '8', ' ', (byte) chunkLen, (byte) (chunkLen >> 8), (byte) (chunkLen >> 16), (byte) (chunkLen >> 24)});
        o.writeBytes(new byte[] {0, 0, 0, (byte) 0x9d, 0x01, 0x2a, (byte) w, (byte) (w >> 8), (byte) h, (byte) (h >> 8)});
        o.writeBytes(x);
        if (pad == 1) o.write(0);
        return o.toByteArray();
    }
}
