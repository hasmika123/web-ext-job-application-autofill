package com.dossier.api.service.ent.applications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberDirectoryRepository;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** X9.13: the words for a person on an organization record are the change-audit words: never an enterprise login, "a former member", "a member". */
class ApplicationNamesTest {

    private static OrgMember seat(OrgMemberStatus status, String label, String inviteEmail) {
        OrgMember m = new OrgMember();
        m.setId(9L);
        m.setStatus(status);
        m.setDisplayLabel(label);
        m.setInviteEmail(inviteEmail);
        return m;
    }

    private static User user(String login, String first, String last, String email) {
        User u = new User();
        u.setLogin(login);
        u.setFirstName(first);
        u.setLastName(last);
        u.setEmail(email);
        return u;
    }

    @Test
    void aNameWins() {
        assertThat(ApplicationNames.personName(user("ent#1#a@x.com", "Sarah", "Chen", null), seat(OrgMemberStatus.ACTIVE, "Label", null))).isEqualTo("Sarah Chen");
    }

    @Test
    void theSeatLabelIsNext() {
        assertThat(ApplicationNames.personName(user("ent#1#a@x.com", null, null, null), seat(OrgMemberStatus.ACTIVE, "Priya R.", null))).isEqualTo("Priya R.");
    }

    @Test
    void anEnterpriseLoginIsNeverTheFallback() {
        String name = ApplicationNames.personName(user("ent#1#a@x.com", null, null, null), seat(OrgMemberStatus.ACTIVE, null, null));
        assertThat(name).isEqualTo("a member");
        assertThat(name).doesNotContain("ent#");
    }

    @Test
    void theAccountsEmailFirstPartStillStandsInBeforeAMember() {
        assertThat(ApplicationNames.personName(user("ent#1#a@x.com", null, null, "dana.k@example.org"), seat(OrgMemberStatus.ACTIVE, null, null))).isEqualTo("dana.k");
    }

    @Test
    void anErasedSeatIsAFormerMemberWhateverElseIsLeft() {
        assertThat(ApplicationNames.personName(user("x", "Gil", "Gone", null), seat(OrgMemberStatus.ERASED, "Old label", null))).isEqualTo("a former member");
        assertThat(ApplicationNames.personName(null, seat(OrgMemberStatus.ERASED, null, null))).isEqualTo("a former member");
    }

    @Test
    void noUserBehindALiveSeatIsAFormerMemberAnInvitedSeatIsAMember() {
        assertThat(ApplicationNames.personName(null, seat(OrgMemberStatus.ACTIVE, null, null))).isEqualTo("a former member");
        assertThat(ApplicationNames.personName(null, seat(OrgMemberStatus.INVITED, null, null))).isEqualTo("a member");
    }

    @Test
    void aMemberIdOfAnotherOrganizationYieldsNoNameAndTheCardSaysAMember() {
        OrgMemberDirectoryRepository directory = mock(OrgMemberDirectoryRepository.class);
        UserRepository users = mock(UserRepository.class);
        when(directory.findByOrgIdAndIdIn(any(), any(Collection.class))).thenReturn(List.of());
        ApplicationNames names = new ApplicationNames(directory, users);

        Map<Long, String> who = names.memberNames(5L, List.of(77L));

        assertThat(who).isEmpty();
        assertThat(names.marketer(77L, who).name()).isEqualTo("a member");
    }
}
