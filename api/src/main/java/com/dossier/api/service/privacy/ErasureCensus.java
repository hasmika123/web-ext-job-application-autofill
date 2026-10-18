package com.dossier.api.service.privacy;

import com.dossier.api.service.storage.FileStorage;
import com.dossier.api.service.storage.StorageKeys;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Counts what an account still has, per table of the {@link DataMap} and per stored-file prefix. It runs before an erasure (the purge report says
 * what was there) and after it (anything still counted is residue, and the report says so). The table and column names come only from the
 * {@code DataMap} constants, never from a request, so the statements are built by concatenation safely.
 */
@Component
public class ErasureCensus {

    private final JdbcTemplate jdbc;
    private final FileStorage storage;

    public ErasureCensus(JdbcTemplate jdbc, FileStorage storage) {
        this.jdbc = jdbc;
        this.storage = storage;
    }

    /** Table to number of rows that name this account (only tables with a count above zero), plus {@code files} for stored objects. */
    public Map<String, Long> take(Long userId, String login) {
        Map<String, Long> out = new LinkedHashMap<>();
        Long account = userId == null ? 0L : jdbc.queryForObject("select count(*) from jhi_user where id = ?", Long.class, userId);
        if (account != null && account > 0) out.put("jhi_user", account);
        for (DataMap.Entry entry : DataMap.countable()) {
            long n = 0;
            for (DataMap.Col col : entry.cols()) {
                Object arg = col.key() == DataMap.Key.USER_ID ? userId : login;
                if (arg == null) continue;
                Long c = jdbc.queryForObject("select count(*) from " + entry.table() + " where " + col.name() + " = ?", Long.class, arg);
                n += c == null ? 0 : c;
            }
            if (n > 0) out.put(entry.table(), n);
        }
        long files = files(userId);
        if (files > 0) out.put("files", files);
        return out;
    }

    /** Stored objects under the account's prefixes (resume files, originals, photos, thumbnails, attachments, export ZIPs). */
    public long files(Long userId) {
        if (userId == null) return 0;
        long n = 0;
        for (String prefix : StorageKeys.userPrefixes(userId)) {
            String token = null;
            do {
                FileStorage.KeyPage page = storage.list(prefix, token);
                n += page.keys().size();
                token = page.nextToken();
            } while (token != null);
        }
        return n;
    }
}
