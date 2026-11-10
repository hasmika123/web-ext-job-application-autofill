package com.dossier.api.service;

import com.dossier.api.domain.Bio;
import com.dossier.api.domain.User;
import com.dossier.api.repository.BioRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Get-or-create of a user's {@code bio} row, safe against the first-touch race (a new account's first two profile reads or writes arriving together, the
 * 500 on {@code bio.ux_bio_user} the video run found in Gamma). Creation is serialised per user with a MySQL named lock ({@code GET_LOCK}), so the
 * requests take turns instead of colliding on the unique key (a plain {@code INSERT IGNORE} was tried first and InnoDB deadlocked on it under load, which
 * {@code BioFirstTouchRaceIT} caught). Inside the lock the row is read with a locking read, which sees what another transaction committed even after this
 * transaction's snapshot was taken, and inserted only when still missing; the loser therefore uses the winner's row. No second connection and no
 * exception-driven retry are needed, and the named lock is always released (it is also released with the connection).
 */
@Component
public class BioProvisioner {

    private static final int LOCK_SECONDS = 30;

    private final BioRepository bios;

    @PersistenceContext
    private EntityManager em;

    public BioProvisioner(BioRepository bios) {
        this.bios = bios;
    }

    /** The user's bio, created empty ({@code {}}) when the user has none yet. */
    @Transactional
    public Bio getOrCreate(User user) {
        List<Bio> found = bios.findByUserId(user.getId());
        if (!found.isEmpty()) return found.get(0);
        String name = "kiwiply-bio-" + user.getId();
        em.createNativeQuery("select get_lock(:n, :s)").setParameter("n", name).setParameter("s", LOCK_SECONDS).getSingleResult();
        try {
            List<Bio> current = locked(user.getId());
            if (!current.isEmpty()) return current.get(0);
            em
                .createNativeQuery("insert into bio (user_id, payload, updated_at) values (:u, '{}', :t)")
                .setParameter("u", user.getId())
                .setParameter("t", Instant.now().truncatedTo(ChronoUnit.MILLIS))
                .executeUpdate();
            return locked(user.getId()).get(0);
        } finally {
            em.createNativeQuery("select release_lock(:n)").setParameter("n", name).getSingleResult();
        }
    }

    private List<Bio> locked(Long userId) {
        return em
            .createQuery("select b from Bio b where b.user.id = :u order by b.id", Bio.class)
            .setParameter("u", userId)
            .setLockMode(LockModeType.PESSIMISTIC_WRITE)
            .setMaxResults(1)
            .getResultList();
    }
}
