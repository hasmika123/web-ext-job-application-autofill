package com.dossier.api.service.storage;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * {@link FileStorage} on a local directory (the default driver). A key maps to
 * {@code <root>/<key>}; a {@code <key>.meta} JSON sidecar holds the content type, size, sha256
 * and creation time (no xattrs, so it survives any filesystem / rsync backup).
 *
 * <ul>
 *   <li><b>Safe paths</b>: keys with {@code ..}, absolute or drive-prefixed forms, backslashes,
 *       NUL, encoded dots/slashes, or the reserved {@code .tmp} / {@code .meta} names are rejected
 *       with {@link IllegalArgumentException}, and the resolved path is asserted to stay under the root.</li>
 *   <li><b>Atomic writes</b>: bytes go to {@code <root>/.tmp/<uuid>}, are fsync'd, then moved into
 *       place. The sidecar is moved first, the data file last, so an object only "exists" once
 *       its data is complete; a crash leaves only {@code .tmp} litter.</li>
 *   <li>The root directory is created owner-only (0700) on POSIX filesystems.</li>
 * </ul>
 */
public class LocalFileStorage implements FileStorage {

    private static final Logger LOG = LoggerFactory.getLogger(LocalFileStorage.class);
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";
    private static final String TMP_DIR = ".tmp";
    private static final String META_SUFFIX = ".meta";
    private static final int MAX_KEY_LENGTH = 512;
    private static final int LIST_PAGE_SIZE = 1000;
    private static final ObjectMapper JSON = new ObjectMapper();

    private final Path root;
    private final Path tmp;

    public LocalFileStorage(Path root) {
        this.root = root.toAbsolutePath().normalize();
        this.tmp = this.root.resolve(TMP_DIR);
        try {
            createPrivateDir(this.root);
            createPrivateDir(this.tmp);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot create local storage root " + this.root, e);
        }
        LOG.info("Local file storage rooted at {}", this.root);
    }

    // --- FileStorage -------------------------------------------------------------------

    @Override
    public String store(String key, InputStream in, long declaredLength, String contentType) {
        Path target = resolve(key);
        String type = contentType == null || contentType.isBlank() ? DEFAULT_CONTENT_TYPE : contentType;
        String id = UUID.randomUUID().toString();
        Path tmpData = tmp.resolve(id);
        Path tmpMeta = tmp.resolve(id + META_SUFFIX);
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            long written;
            try (
                DigestInputStream din = new DigestInputStream(in, sha);
                FileChannel ch = FileChannel.open(tmpData, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)
            ) {
                written = copyAndSync(din, ch);
            }
            if (declaredLength >= 0 && written != declaredLength) {
                throw new IOException("Declared " + declaredLength + " bytes but received " + written);
            }
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("contentType", type);
            meta.put("size", written);
            meta.put("sha256", HexFormat.of().formatHex(sha.digest()));
            meta.put("createdAt", Instant.now().toString());
            Files.write(tmpMeta, JSON.writeValueAsBytes(meta));

            Files.createDirectories(target.getParent());
            move(tmpMeta, metaPath(target));
            move(tmpData, target);
            LOG.debug("Stored {} ({} bytes) under {}", key, written, root);
            return key;
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to store " + key, e);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        } finally {
            deleteQuietly(tmpData);
            deleteQuietly(tmpMeta);
        }
    }

    @Override
    public StoredFile load(String key) {
        Path path = resolve(key);
        try {
            byte[] bytes = Files.readAllBytes(path);
            return new StoredFile(bytes, readMeta(path).map(m -> (String) m.get("contentType")).orElse(null));
        } catch (NoSuchFileException e) {
            throw new StorageObjectNotFoundException(key, e);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to read " + key, e);
        }
    }

    @Override
    public InputStream open(String key) {
        try {
            return Files.newInputStream(resolve(key));
        } catch (NoSuchFileException e) {
            throw new StorageObjectNotFoundException(key, e);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to open " + key, e);
        }
    }

    @Override
    public Optional<ObjectStat> stat(String key) {
        Path path = resolve(key);
        if (!Files.isRegularFile(path)) {
            return Optional.empty();
        }
        try {
            long size = Files.size(path);
            Instant modified = Files.getLastModifiedTime(path).toInstant();
            Optional<Map<String, Object>> meta = readMeta(path);
            String type = meta.map(m -> (String) m.get("contentType")).orElseGet(() -> probeContentType(path));
            String etag = meta.map(m -> (String) m.get("sha256")).orElse(Long.toHexString(size) + "-" + Long.toHexString(modified.toEpochMilli()));
            return Optional.of(new ObjectStat(size, type, etag, modified));
        } catch (NoSuchFileException e) {
            return Optional.empty();
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to stat " + key, e);
        }
    }

    @Override
    public boolean exists(String key) {
        return Files.isRegularFile(resolve(key));
    }

    @Override
    public void delete(String key) {
        Path path = resolve(key);
        try {
            Files.deleteIfExists(path);
            Files.deleteIfExists(metaPath(path));
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to delete " + key, e);
        }
    }

    @Override
    public KeyPage list(String prefix, String continuationToken) {
        String p = prefix == null ? "" : prefix;
        if (!p.isEmpty()) {
            validateKey(p); // a prefix is held to the same rules as a key
        }
        int slash = p.lastIndexOf('/');
        Path start = slash < 0 ? root : root.resolve(p.substring(0, slash)).normalize();
        if (!start.startsWith(root) || !Files.isDirectory(start)) {
            return new KeyPage(List.of(), null);
        }
        try (Stream<Path> walk = Files.walk(start)) {
            List<String> keys = walk
                .filter(Files::isRegularFile)
                .map(f -> root.relativize(f).toString().replace('\\', '/'))
                .filter(k -> !k.startsWith(TMP_DIR + "/") && !k.endsWith(META_SUFFIX) && k.startsWith(p))
                .filter(k -> continuationToken == null || k.compareTo(continuationToken) > 0)
                .sorted()
                .limit(LIST_PAGE_SIZE + 1L)
                .toList();
            if (keys.size() > LIST_PAGE_SIZE) {
                List<String> page = keys.subList(0, LIST_PAGE_SIZE);
                return new KeyPage(List.copyOf(page), page.get(LIST_PAGE_SIZE - 1));
            }
            return new KeyPage(keys, null);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to list " + prefix, e);
        }
    }

    // --- internals ---------------------------------------------------------------------

    /** Resolve a key to a path strictly inside the root, or throw {@link IllegalArgumentException}. */
    Path resolve(String key) {
        validateKey(key);
        if (key.endsWith("/")) {
            throw new IllegalArgumentException("Invalid storage key");
        }
        Path resolved = root.resolve(key).normalize();
        if (!resolved.startsWith(root) || resolved.equals(root)) {
            throw new IllegalArgumentException("Storage key escapes the storage root");
        }
        return resolved;
    }

    private static void validateKey(String key) {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("Storage key must not be blank");
        }
        if (key.length() > MAX_KEY_LENGTH) {
            throw new IllegalArgumentException("Storage key is too long");
        }
        String lower = key.toLowerCase(Locale.ROOT);
        if (
            key.startsWith("/") ||
            key.indexOf('\\') >= 0 ||
            key.indexOf('\0') >= 0 ||
            key.indexOf(':') >= 0 ||
            lower.contains("%2e") ||
            lower.contains("%2f") ||
            lower.contains("%5c") ||
            lower.contains("%00")
        ) {
            throw new IllegalArgumentException("Invalid storage key");
        }
        for (String segment : key.split("/", -1)) {
            if (segment.equals("..") || segment.equals(".") || (segment.isEmpty() && !key.endsWith("/"))) {
                throw new IllegalArgumentException("Invalid storage key segment");
            }
        }
        if (key.equals(TMP_DIR) || key.startsWith(TMP_DIR + "/") || key.endsWith(META_SUFFIX)) {
            throw new IllegalArgumentException("Reserved storage key");
        }
    }

    private static Path metaPath(Path data) {
        return data.resolveSibling(data.getFileName() + META_SUFFIX);
    }

    @SuppressWarnings("unchecked")
    private static Optional<Map<String, Object>> readMeta(Path data) {
        try {
            return Optional.of(JSON.readValue(Files.readAllBytes(metaPath(data)), Map.class));
        } catch (IOException e) {
            return Optional.empty(); // missing or unreadable sidecar: callers fall back
        }
    }

    private static String probeContentType(Path path) {
        try {
            return Files.probeContentType(path);
        } catch (IOException e) {
            return null;
        }
    }

    private static long copyAndSync(InputStream in, FileChannel ch) throws IOException {
        byte[] buf = new byte[64 * 1024];
        long total = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            ch.write(ByteBuffer.wrap(buf, 0, n));
            total += n;
        }
        ch.force(true);
        return total;
    }

    private static void move(Path from, Path to) throws IOException {
        try {
            Files.move(from, to, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(from, to, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static void createPrivateDir(Path dir) throws IOException {
        try {
            Files.createDirectories(dir, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        } catch (UnsupportedOperationException e) {
            Files.createDirectories(dir); // non-POSIX filesystem (Windows dev)
        }
    }

    private static void deleteQuietly(Path p) {
        try {
            Files.deleteIfExists(p);
        } catch (IOException ignored) {
            // temp litter is harmless; the P5.5 sweep removes it
        }
    }
}
