package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentApplicationNote;
import org.springframework.data.repository.Repository;

/** Marketing-workspace writes to {@code talent_application_note}. Reads of notes stay in the talent repository. */
public interface MktApplicationNoteRepository extends Repository<TalentApplicationNote, Long> {
    <S extends TalentApplicationNote> S save(S entity);
}
