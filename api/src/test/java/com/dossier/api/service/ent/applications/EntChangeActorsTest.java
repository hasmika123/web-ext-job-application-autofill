package com.dossier.api.service.ent.applications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.EntChangeActorRepository;
import com.dossier.api.service.dto.ChangeActorDTO;
import com.dossier.api.service.ent.applications.EntChangeActors.Lookup;
import com.dossier.api.service.ent.applications.EntChangeActors.Subject;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** X9.13: the relation words (marketer / admin / consultant / member / system, D6) and the labels, with the organization boundary. */
class EntChangeActorsTest {

    private static final long ORG = 5L;
    private static final long CONSULTANT_PROFILE = 40L;

    private EntChangeActorRepository repo;
    private UserRepository users;
    private EntChangeActors actors;

    @BeforeEach
    void setUp() {
        repo = mock(EntChangeActorRepository.class);
        users = mock(UserRepository.class);
        actors = new EntChangeActors(repo, users);
        // the record's consultant is seat 100; seat 100's marketer by assignment is seat 200
        when(repo.consultantSeats(any(), any())).thenReturn(List.<Object[]>of(new Object[] { CONSULTANT_PROFILE, 100L }));
        when(repo.marketerAssignments(any(), any())).thenReturn(List.<Object[]>of(new Object[] { CONSULTANT_PROFILE, 200L, 201L }));
        when(repo.effectiveAssignees(any(), any(), any(), any())).thenReturn(List.of());
    }

    private static OrgMember seat(long id, OrgRole role, Long userId, String label) {
        OrgMember m = new OrgMember();
        m.setId(id);
        m.setOrgId(ORG);
        m.setRole(role);
        m.setUserId(userId);
        m.setDisplayLabel(label);
        m.setStatus(OrgMemberStatus.ACTIVE);
        return m;
    }

    private static User account(long id, String login, String first, String last) {
        User u = new User();
        u.setId(id);
        u.setLogin(login);
        u.setFirstName(first);
        u.setLastName(last);
        return u;
    }

    private Lookup load(Collection<OrgMember> seats, Collection<User> accounts, Long... actorIds) {
        when(repo.seats(any(), any())).thenReturn(List.copyOf(seats));
        when(users.findAllById(any(Collection.class))).thenReturn(List.copyOf(accounts));
        return actors.load(ORG, List.of(actorIds), List.of(new Subject(CONSULTANT_PROFILE, null)));
    }

    private static final Subject RECORD = new Subject(CONSULTANT_PROFILE, null);

    @Test
    void theFiveRelationWordsPerTheDesign() {
        Lookup l = load(
            List.of(
                seat(100, OrgRole.MEMBER, 1L, null), // the record's own consultant
                seat(200, OrgRole.MARKETER, 2L, null), // its assigned marketer
                seat(300, OrgRole.OWNER, 3L, null),
                seat(301, OrgRole.ADMIN, 4L, null),
                seat(400, OrgRole.STAFF, 5L, null) // any other seat
            ),
            List.of(account(1, "u1", "Anika", "Khan"), account(2, "u2", "Sam", "Spec"), account(3, "u3", "Olivia", "Owner"), account(4, "u4", "Adam", "Admin"), account(5, "u5", "Hannah", "Hart")),
            100L, 200L, 300L, 301L, 400L
        );
        assertThat(l.of(100L, null, RECORD).relation()).isEqualTo("consultant");
        assertThat(l.of(200L, null, RECORD).relation()).isEqualTo("marketer");
        assertThat(l.of(300L, null, RECORD).relation()).isEqualTo("admin");
        assertThat(l.of(301L, null, RECORD).relation()).isEqualTo("admin");
        assertThat(l.of(400L, null, RECORD).relation()).isEqualTo("member");
        assertThat(l.of(null, "SYSTEM", RECORD).relation()).isEqualTo("system");
        assertThat(l.of(200L, "SYSTEM", RECORD).kind()).as("SYSTEM wins even with an id").isEqualTo("SYSTEM");
        assertThat(l.of(200L, null, RECORD).label()).isEqualTo("Sam Spec");
        assertThat(l.of(200L, null, RECORD).memberId()).isEqualTo(200L);
    }

    @Test
    void theRecordsOwnMarketerFieldAndABackupCountAsMarketer() {
        Lookup l = load(List.of(seat(500, OrgRole.STAFF, 6L, null), seat(201, OrgRole.STAFF, 7L, null)), List.of(account(6, "u6", "Rae", "Roe"), account(7, "u7", "Bo", "Backup")), 500L, 201L);
        assertThat(l.of(500L, null, new Subject(CONSULTANT_PROFILE, 500L)).relation()).as("the marketer stored on the record").isEqualTo("marketer");
        assertThat(l.of(201L, null, RECORD).relation()).as("the backup of the assignment").isEqualTo("marketer");
    }

    @Test
    void anEffectiveOrgAssignmentCountsToo() {
        when(repo.effectiveAssignees(any(), any(), any(), any())).thenReturn(List.<Object[]>of(new Object[] { 100L, 600L }));
        Lookup l = load(List.of(seat(600, OrgRole.STAFF, 8L, null)), List.of(account(8, "u8", "Dee", "Delegate")), 600L);
        assertThat(l.of(600L, null, RECORD).relation()).isEqualTo("marketer");
    }

    @Test
    void anEnterpriseLoginWithNoNameAndNoSeatLabelIsAMemberNeverTheLogin() {
        Lookup l = load(List.of(seat(700, OrgRole.MEMBER, 9L, null)), List.of(account(9, "ent#5#ghost@x.com", null, null)), 700L);
        ChangeActorDTO dto = l.of(700L, null, RECORD);
        assertThat(dto.label()).isEqualTo("a member");
        assertThat(dto.toString()).doesNotContain("ent#");
    }

    @Test
    void theSeatLabelIsTheSecondChoice() {
        Lookup l = load(List.of(seat(701, OrgRole.MEMBER, 10L, "Priya R. (Ops)")), List.of(account(10, "ent#5#p@x.com", null, null)), 701L);
        assertThat(l.of(701L, null, RECORD).label()).isEqualTo("Priya R. (Ops)");
    }

    @Test
    void anErasedSeatIsAFormerMember() {
        OrgMember erased = seat(702, OrgRole.MEMBER, null, null);
        erased.setStatus(OrgMemberStatus.ERASED);
        Lookup l = load(List.of(erased), List.of(), 702L);
        assertThat(l.of(702L, null, RECORD).label()).isEqualTo("a former member");
    }

    @Test
    void aSeatWhoseAccountIsGoneIsAFormerMember() {
        Lookup l = load(List.of(seat(703, OrgRole.MEMBER, 11L, null)), List.of(), 703L);
        assertThat(l.of(703L, null, RECORD).label()).isEqualTo("a former member");
    }

    @Test
    void aMemberIdOfAnotherOrganizationIsNotASeatHereSoItIsAMemberWithNoIdAndNoName() {
        Lookup l = load(List.of(), List.of(), 999L);
        ChangeActorDTO dto = l.of(999L, null, RECORD);
        assertThat(dto.label()).isEqualTo("a member");
        assertThat(dto.memberId()).isNull();
        assertThat(dto.relation()).isEqualTo("member");
    }

    @Test
    void aPageIsAFixedNumberOfQueriesWhateverItsSize() {
        Long[] ids = new Long[50];
        for (int i = 0; i < 50; i++) ids[i] = 1000L + i;
        load(List.of(seat(1000, OrgRole.MEMBER, 12L, null)), List.of(account(12, "u12", "A", "B")), ids);
        verify(repo, times(1)).seats(any(), any());
        verify(repo, times(1)).consultantSeats(any(), any());
        verify(repo, times(1)).marketerAssignments(any(), any());
        verify(users, times(1)).findAllById(any(Collection.class));
        verify(users, never()).findAllByLoginIn(any(Collection.class));
    }

    @Test
    void relationOfIsPureAndOrdered() {
        assertThat(EntChangeActors.relationOf(5L, OrgRole.OWNER, 5L, Set.of(5L))).as("the consultant comes first").isEqualTo("consultant");
        assertThat(EntChangeActors.relationOf(5L, OrgRole.OWNER, 6L, Set.of(5L))).as("then the marketer").isEqualTo("marketer");
        assertThat(EntChangeActors.relationOf(5L, OrgRole.ADMIN, 6L, Set.of())).isEqualTo("admin");
        assertThat(EntChangeActors.relationOf(5L, OrgRole.MARKETER, 6L, Set.of())).as("a marketer who is not assigned to this consultant is only a member").isEqualTo("member");
        assertThat(EntChangeActors.relationOf(null, null, null, null)).isEqualTo("member");
    }
}
