package com.dossier.api.repository;

import com.dossier.api.domain.AppSettingHistory;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

/** Runtime-setting change history (AI admin config), newest first. */
@Repository
public interface AppSettingHistoryRepository extends JpaRepository<AppSettingHistory, Long> {
    List<AppSettingHistory> findAllByOrderByIdDesc(Pageable pageable);

    List<AppSettingHistory> findByKeyOrderByIdDesc(String key, Pageable pageable);

    /** Every key starting with {@code prefix} (the AI page's history), newest first. */
    List<AppSettingHistory> findByKeyStartingWithOrderByIdDesc(String prefix, Pageable pageable);

    /** The newest change of every key (the settings list shows each stored row's last reason). */
    @Query("select h from AppSettingHistory h where h.id in (select max(x.id) from AppSettingHistory x group by x.key)")
    List<AppSettingHistory> findLatestPerKey();
}
