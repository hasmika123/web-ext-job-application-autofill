package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * Where one connected folder's sync stands (Phase 14.3): the folder's UIDVALIDITY and the highest
 * UID already read. A changed UIDVALIDITY means the server renumbered the folder, so the poller
 * reads it again from the backfill window. See the changelog.
 */
@Entity
@Table(name = "inbox_folder_state")
public class InboxFolderState implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "folder", nullable = false, length = 200)
    private String folder;

    @Column(name = "uid_validity", nullable = false)
    private long uidValidity;

    @Column(name = "last_uid", nullable = false)
    private long lastUid;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public InboxFolderState() {}

    public InboxFolderState(Long userId, String folder) {
        this.userId = userId;
        this.folder = folder;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getFolder() {
        return folder;
    }

    public long getUidValidity() {
        return uidValidity;
    }

    public void setUidValidity(long uidValidity) {
        this.uidValidity = uidValidity;
    }

    public long getLastUid() {
        return lastUid;
    }

    public void setLastUid(long lastUid) {
        this.lastUid = lastUid;
        this.updatedAt = Instant.now();
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
