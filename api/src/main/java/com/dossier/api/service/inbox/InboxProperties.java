package com.dossier.api.service.inbox;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The inbox's encryption key (Phase 14.2), under {@code dossier.inbox.*}.
 *
 * <ul>
 *   <li><b>{@code key}</b> — the current 32-byte AES key, base64 ({@code openssl rand -base64 32}) or
 *       64 hex characters. Set from {@code DOSSIER_INBOX_KEY} on the box; kept in the password
 *       manager. Never in the repo, never in GitHub secrets. Blank = the inbox is off.</li>
 *   <li><b>{@code key-version}</b> — the number stamped on everything the current key encrypts
 *       (default 1). Rotating = new key, version + 1, old key moved to {@code retired-keys}.</li>
 *   <li><b>{@code retired-keys}</b> — version → old key, for reading what older keys wrote until
 *       it's re-encrypted. Decrypt only.</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "dossier.inbox")
public class InboxProperties {

    private String key = "";
    private int keyVersion = 1;
    private Map<Integer, String> retiredKeys = new LinkedHashMap<>();

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public int getKeyVersion() {
        return keyVersion;
    }

    public void setKeyVersion(int keyVersion) {
        this.keyVersion = keyVersion;
    }

    public Map<Integer, String> getRetiredKeys() {
        return retiredKeys;
    }

    public void setRetiredKeys(Map<Integer, String> retiredKeys) {
        this.retiredKeys = retiredKeys;
    }
}
