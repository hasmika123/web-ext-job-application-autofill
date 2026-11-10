package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.consultantws.CwsProfileDetail;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Marketing "My Assigned Talent" overview: the consultant's stored work authorization LABEL (a status choice, never a document number). Every method takes the organization id first. */
public interface MktTalentProfileDetailRepository extends Repository<CwsProfileDetail, Long> {

    Optional<CwsProfileDetail> findByOrgIdAndConsultantId(Long orgId, Long consultantId);
}
