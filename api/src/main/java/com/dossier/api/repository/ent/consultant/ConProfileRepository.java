package com.dossier.api.repository.ent.consultant;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import java.util.List;
import org.springframework.data.repository.Repository;

/**
 * The consultant profile(s) behind a seat. A list, not an Optional: {@code ConScope} must be able to SEE a second profile and refuse it
 * (the caller then gets the generic 404) instead of failing with an incorrect-result-size error.
 */
public interface ConProfileRepository extends Repository<ConsultantProfile, Long> {

    List<ConsultantProfile> findByOrgIdAndMemberId(Long orgId, Long memberId);
}
