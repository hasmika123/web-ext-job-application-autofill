package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.dto.ResumeActorDTO;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** "Last modified by": always a name a person can read, and never the synthetic enterprise login. */
class ResumeActorsTest {

    private static User user(String login, String first, String last, String email) {
        User u = new User();
        u.setLogin(login);
        u.setFirstName(first);
        u.setLastName(last);
        u.setEmail(email);
        return u;
    }

    @Test
    void aNameIsTheLabelAndAPersonalAccountWithoutOneFallsBackToItsLoginAsAlways() {
        UserRepository repo = mock(UserRepository.class);
        when(repo.findAllByLoginIn(anyCollection())).thenReturn(List.of(user("sarah", "Sarah", "Chen", "s@x.org"), user("plainuser", null, null, "p@x.org")));
        Map<String, ResumeActorDTO> out = new ResumeActors(repo).resolve(Set.of("sarah", "plainuser"));
        assertThat(out.get("sarah").label()).isEqualTo("Sarah Chen");
        assertThat(out.get("plainuser").label()).isEqualTo("plainuser");
    }

    @Test
    void anEnterpriseAccountIsNeverShownByItsSyntheticLogin() {
        UserRepository repo = mock(UserRepository.class);
        when(repo.findAllByLoginIn(anyCollection())).thenReturn(List.of(user("ent#5#nameless@acme.org", null, null, "nameless@acme.org"), user("ent#5#nobody", null, null, null)));
        Map<String, ResumeActorDTO> out = new ResumeActors(repo).resolve(Set.of("ent#5#nameless@acme.org", "ent#5#nobody", "ent#5#deleted"));
        assertThat(out.get("ent#5#nameless@acme.org").label()).isEqualTo("nameless@acme.org");
        assertThat(out.get("ent#5#nobody").label()).isEqualTo("Team member");
        assertThat(out.get("ent#5#deleted").label()).as("an account that no longer exists").isEqualTo("Team member");
        for (ResumeActorDTO a : out.values()) assertThat(a.label()).doesNotContain("ent#");
    }
}
