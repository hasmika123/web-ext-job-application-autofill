package com.dossier.api.service.tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.ApplicationEvent;
import com.dossier.api.domain.User;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.ApplicationEventRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberDirectoryRepository;
import com.dossier.api.service.dto.ChangeActorDTO;
import com.dossier.api.service.dto.TrackerDTOs.EventDTO;
import com.dossier.api.service.tracker.ChangeActors.Context;
import com.dossier.api.service.tracker.ChangeActors.Ref;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The words: name, seat label, personal login, "a member" for an enterprise login, "a former member" / "a deleted account"; one lookup per page. */
class ChangeActorsTest {

    private UserRepository users;
    private OrgMemberDirectoryRepository directory;
    private ApplicationEventRepository events;
    private ChangeActors actors;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        directory = mock(OrgMemberDirectoryRepository.class);
        events = mock(ApplicationEventRepository.class);
        actors = new ChangeActors(users, directory, events);
    }

    private static User user(long id, String login, String first, String last, Long orgId) {
        User u = new User();
        u.setId(id);
        u.setLogin(login);
        u.setFirstName(first);
        u.setLastName(last);
        u.setOrgId(orgId);
        return u;
    }

    private ChangeActorDTO one(long userId, Context ctx) {
        return actors.of(Ref.person(userId, null), ctx);
    }

    @Test
    void anAccountWithANameIsLabelledByIt() {
        when(users.findAllById(any(Collection.class))).thenReturn(List.of(user(7, "anika", "Anika", "Shah", null)));
        ChangeActorDTO a = one(7, Context.PERSONAL);
        assertThat(a.label()).isEqualTo("Anika Shah");
        assertThat(a.userId()).isEqualTo(7L);
        assertThat(a.kind()).isEqualTo("PERSON");
        assertThat(a.relation()).as("no relation in the personal context").isNull();
    }

    @Test
    void aPersonalLoginWithoutANameIsLabelledByTheLogin() {
        when(users.findAllById(any(Collection.class))).thenReturn(List.of(user(7, "anika.shah", null, " ", null)));
        assertThat(one(7, Context.PERSONAL).label()).isEqualTo("anika.shah");
    }

    @Test
    void anEnterpriseAccountUsesTheSeatLabelAndNeverItsLogin() {
        User sarah = user(99, "ent#5#sarah.chen@x.com", null, null, 5L);
        when(users.findAllById(any(Collection.class))).thenReturn(List.of(sarah));
        OrgMember seat = new OrgMember();
        seat.setUserId(99L);
        seat.setDisplayLabel("Sarah Chen");
        when(directory.findByOrgIdAndUserIdIn(5L, java.util.Set.of(99L))).thenReturn(List.of(seat));

        ChangeActorDTO a = one(99, Context.PERSONAL);
        assertThat(a.label()).isEqualTo("Sarah Chen");
        assertThat(a.userId()).as("an enterprise account's id is not shown to a personal viewer").isNull();
    }

    @Test
    void anEnterpriseLoginWithNoNameAndNoSeatLabelIsAMemberNeverTheLogin() {
        when(users.findAllById(any(Collection.class))).thenReturn(List.of(user(99, "ent#5#sarah.chen@x.com", null, null, 5L)));
        when(directory.findByOrgIdAndUserIdIn(any(), any())).thenReturn(List.of());
        ChangeActorDTO a = one(99, Context.PERSONAL);
        assertThat(a.label()).isEqualTo("a member");
        assertThat(a.label()).doesNotContain("ent#");
    }

    @Test
    void aDeletedActorIsAFormerMemberInAnOrganizationAndADeletedAccountInThePersonalContext() {
        when(users.findAllById(any(Collection.class))).thenReturn(List.of());
        assertThat(one(404, Context.ORG).label()).isEqualTo("a former member");
        assertThat(one(404, Context.PERSONAL).label()).isEqualTo("a deleted account");
    }

    @Test
    void aDeletedMarketerIsAFormerMemberEvenInAPersonalTracker() {
        when(users.findAllByLoginIn(any(Collection.class))).thenReturn(List.of());
        ChangeActorDTO a = actors.of(Ref.person(null, "ent#5#gone"), Context.PERSONAL);
        assertThat(a.label()).isEqualTo("a former member");
    }

    @Test
    void anErasedSeatIsAFormerMember() {
        OrgMember erased = new OrgMember();
        erased.setStatus(com.dossier.api.domain.enumeration.OrgMemberStatus.ERASED);
        assertThat(ChangeActors.label(null, erased, Context.ORG)).isEqualTo("a former member");
        assertThat(ChangeActors.label(user(1, "x", "A", "B", null), erased, Context.ORG)).isEqualTo("a former member");
    }

    @Test
    void aWholePageIsOneUserQueryAndNoLoginQuery() {
        when(users.findAllById(any(Collection.class))).thenReturn(List.of(user(7, "anika", "Anika", "Shah", null), user(8, "dev", "Dev", "Patel", null)));
        List<Ref> refs = new ArrayList<>();
        for (int i = 0; i < 50; i++) refs.add(Ref.person(i % 2 == 0 ? 7L : 8L, i % 2 == 0 ? "anika" : "dev"));
        refs.add(new Ref("EXTENSION", null, null));

        Map<Ref, ChangeActorDTO> out = actors.resolve(refs, Context.PERSONAL);

        verify(users, times(1)).findAllById(any(Collection.class));
        verify(users, never()).findAllByLoginIn(any(Collection.class));
        assertThat(out.get(Ref.person(7L, "anika")).label()).isEqualTo("Anika Shah");
        assertThat(out.get(new Ref("EXTENSION", null, null))).isEqualTo(ChangeActorDTO.nonPerson("EXTENSION"));
    }

    @Test
    void nonPersonKindsResolveWithoutAnyLookup() {
        Map<Ref, ChangeActorDTO> out = actors.resolve(List.of(new Ref("MAIL", null, null), new Ref("SYSTEM", null, null), new Ref("ASSISTANT", null, null)), Context.PERSONAL);
        verify(users, never()).findAllById(any(Collection.class));
        assertThat(out.values()).extracting(ChangeActorDTO::label).containsOnly("Kiwiply");
        assertThat(out.values()).extracting(ChangeActorDTO::userId).containsOnlyNulls();
    }

    @Test
    void anApplicationWhoseLastWriterWasTheExtensionReadsThatKindFromItsNewestEvent() {
        Application byPerson = new Application();
        byPerson.setId(1L);
        byPerson.setUpdatedByUserId(7L);
        byPerson.setUpdatedByLogin("anika");
        Application byExtension = new Application();
        byExtension.setId(2L);
        ApplicationEvent newest = new ApplicationEvent();
        newest.setApplicationId(2L);
        newest.setActorKind(ApplicationEvent.ACTOR_EXTENSION);
        when(events.newestFor(any(Collection.class))).thenReturn(List.of(newest));
        when(users.findAllById(any(Collection.class))).thenReturn(List.of(user(7, "anika", "Anika", "Shah", null)));

        Map<Long, ChangeActorDTO> out = actors.updatedBy(List.of(byPerson, byExtension));

        assertThat(out.get(1L).label()).isEqualTo("Anika Shah");
        assertThat(out.get(2L).kind()).isEqualTo("EXTENSION");
        assertThat(out.get(2L).label()).isEqualTo("Kiwiply");
    }

    @Test
    void eventsCarryTheirActorTheOwnerTheyActedForAndTheirChanges() {
        when(users.findAllById(any(Collection.class))).thenReturn(List.of(user(99, "ent#5#sarah", "Sarah", "Chen", 5L), user(7, "anika", "Anika", "Shah", null)));
        ApplicationEvent e = new ApplicationEvent();
        e.setApplicationId(1L);
        e.setKind(ApplicationEvent.STATUS);
        e.setSource("WEB");
        e.setActorKind(ApplicationEvent.ACTOR_PERSON);
        e.setActorUserId(99L);
        e.setActorLogin("ent#5#sarah");
        e.setOnBehalfOfUserId(7L);
        e.setChanges("[{\"f\":\"status\",\"from\":\"APPLIED\",\"to\":\"INTERVIEW\"}]");

        EventDTO dto = actors.events(List.of(e)).get(0);

        assertThat(dto.actor().label()).isEqualTo("Sarah Chen");
        assertThat(dto.actorKind()).isEqualTo("PERSON");
        assertThat(dto.onBehalfOf().label()).isEqualTo("Anika Shah");
        assertThat(dto.changes()).hasSize(1);
        assertThat(dto.toString()).doesNotContain("ent#");
    }
}
