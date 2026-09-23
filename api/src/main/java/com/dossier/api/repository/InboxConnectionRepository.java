package com.dossier.api.repository;

import com.dossier.api.domain.InboxConnection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Users' connected inboxes (Phase 14.1), keyed by user id. */
@Repository
public interface InboxConnectionRepository extends JpaRepository<InboxConnection, Long> {}
