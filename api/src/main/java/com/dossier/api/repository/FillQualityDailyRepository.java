package com.dossier.api.repository;

import com.dossier.api.domain.FillQualityDaily;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface FillQualityDailyRepository extends JpaRepository<FillQualityDaily, Long> {
    Optional<FillQualityDaily> findOneByDayAndAtsAndAdapterAndExtVersion(LocalDate day, String ats, String adapter, String extVersion);
}
