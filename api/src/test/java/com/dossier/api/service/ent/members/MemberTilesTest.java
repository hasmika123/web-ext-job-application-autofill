package com.dossier.api.service.ent.members;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.dto.ent.MemberDTO;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The arithmetic of a KPI tile and the names the board shows: pure functions, so the edge cases are pinned without a database. */
class MemberTilesTest {

    @Test
    void aTileWithAMonthOldFigureHasADeltaAndAPercentage() {
        MemberDTO.Tile up = MemberDTO.Tile.of(186, 172L);
        assertThat(up.delta()).isEqualTo(14L);
        assertThat(up.deltaPercent()).isEqualTo(8.1);
        MemberDTO.Tile down = MemberDTO.Tile.of(9, 12L);
        assertThat(down.delta()).isEqualTo(-3L);
        assertThat(down.deltaPercent()).isEqualTo(-25.0);
        MemberDTO.Tile flat = MemberDTO.Tile.of(6, 6L);
        assertThat(flat.delta()).isZero();
        assertThat(flat.deltaPercent()).isZero();
    }

    @Test
    void aMonthOldZeroHasAnAbsoluteDeltaButNoPercentage() {
        MemberDTO.Tile t = MemberDTO.Tile.of(3, 0L);
        assertThat(t.previous()).isZero();
        assertThat(t.delta()).isEqualTo(3L);
        assertThat(t.deltaPercent()).as("a percentage against zero is undefined, not 100 or infinity").isNull();
    }

    @Test
    void noHistoryMeansNoDeltaAtAll() {
        MemberDTO.Tile t = MemberDTO.Tile.of(42, null);
        assertThat(t.value()).isEqualTo(42);
        assertThat(t.previous()).isNull();
        assertThat(t.delta()).isNull();
        assertThat(t.deltaPercent()).isNull();
    }

    @Test
    void theNameShownIsTheAccountNameElseTheLabelElseTheEmailsLocalPart() {
        com.dossier.api.domain.User u = new com.dossier.api.domain.User();
        u.setFirstName(" Priya ");
        u.setLastName("Sharma");
        u.setEmail("priya@acme.example");
        com.dossier.api.domain.org.OrgMember seat = new com.dossier.api.domain.org.OrgMember();
        seat.setId(5L);
        assertThat(OrgMemberQueryService.personName(u, seat)).isEqualTo("Priya Sharma");
        u.setFirstName(null);
        u.setLastName(null);
        seat.setDisplayLabel("Cohort 2026-B");
        assertThat(OrgMemberQueryService.personName(u, seat)).isEqualTo("Cohort 2026-B");
        seat.setDisplayLabel(null);
        assertThat(OrgMemberQueryService.personName(u, seat)).as("never the login").isEqualTo("priya");
        seat.setInviteEmail("new.hire@acme.example");
        assertThat(OrgMemberQueryService.personName(null, seat)).isEqualTo("new.hire");
        seat.setInviteEmail(null);
        assertThat(OrgMemberQueryService.personName(null, seat)).isEqualTo("Member 5");
    }

    @Test
    void initialsAreTheFirstAndLastWord() {
        assertThat(OrgMemberQueryService.initials("Priya Sharma")).isEqualTo("PS");
        assertThat(OrgMemberQueryService.initials("Mary Jane van der Berg")).isEqualTo("MB");
        assertThat(OrgMemberQueryService.initials("priya")).isEqualTo("PR");
        assertThat(OrgMemberQueryService.initials("  ")).isEqualTo("?");
        assertThat(OrgMemberQueryService.initials(null)).isEqualTo("?");
    }

    @Test
    void theVersionOfASeatChangesWithAnythingTheBoardCanEdit() {
        com.dossier.api.domain.org.OrgMember seat = new com.dossier.api.domain.org.OrgMember();
        seat.setId(7L);
        seat.setStatus(com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE);
        List<MemberDTO.RoleRef> roles = List.of(new MemberDTO.RoleRef(1L, "MEMBER", "Member", true));
        String base = OrgMemberQueryService.version(seat, roles);
        assertThat(base).startsWith("W/\"").endsWith("\"");
        assertThat(OrgMemberQueryService.version(seat, roles)).isEqualTo(base);
        seat.setTitle("Lead");
        assertThat(OrgMemberQueryService.version(seat, roles)).isNotEqualTo(base);
        seat.setTitle(null);
        seat.setManagerMemberId(3L);
        assertThat(OrgMemberQueryService.version(seat, roles)).isNotEqualTo(base);
        seat.setManagerMemberId(null);
        assertThat(OrgMemberQueryService.version(seat, List.of(new MemberDTO.RoleRef(2L, "OTHER", "Other", true)))).isNotEqualTo(base);
        seat.setStatus(com.dossier.api.domain.enumeration.OrgMemberStatus.SUSPENDED);
        assertThat(OrgMemberQueryService.version(seat, roles)).isNotEqualTo(base);
    }
}
