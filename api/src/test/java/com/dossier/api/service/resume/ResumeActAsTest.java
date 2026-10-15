package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.domain.User;
import com.dossier.api.security.SecurityUtils;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/** "Act for" swaps the authenticated user for exactly the duration of the body, names the actor as the author, and always undoes itself. */
class ResumeActAsTest {

    private static User user(String login) {
        User u = new User();
        u.setLogin(login);
        return u;
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static void signIn(String login) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(login, "x", List.of()));
    }

    @Test
    void runsAsTheOwnerWhileTheActorIsTheAuthorAndRestoresEverythingAfterwards() {
        signIn("marketer");
        ResumeActAs.Scope scope = new ResumeActAs.Scope(7L, "marketer", 11L);

        String seen = ResumeActAs.run(user("consultant"), scope, () -> {
            assertThat(SecurityUtils.getCurrentUserLogin()).contains("consultant");
            assertThat(ResumeActAs.current()).contains(scope);
            return ResumeActAs.authorOr(SecurityUtils.getCurrentUserLogin().orElseThrow());
        });

        assertThat(seen).as("the author is the marketer, never the owner").isEqualTo("marketer");
        assertThat(SecurityUtils.getCurrentUserLogin()).contains("marketer");
        assertThat(ResumeActAs.current()).isEmpty();
        assertThat(ResumeActAs.authorOr("consultant")).isEqualTo("consultant");
    }

    @Test
    void anExceptionStillRestoresTheCallerAndTheScope() {
        signIn("marketer");
        assertThatThrownBy(() ->
            ResumeActAs.run(user("consultant"), new ResumeActAs.Scope(7L, "marketer", 11L), () -> {
                throw new IllegalStateException("boom");
            })
        ).isInstanceOf(IllegalStateException.class);
        assertThat(SecurityUtils.getCurrentUserLogin()).contains("marketer");
        assertThat(ResumeActAs.current()).isEmpty();
    }

    @Test
    void actingForSomeoneWhileActingForSomeoneElseIsRefused() {
        signIn("marketer");
        ResumeActAs.Scope scope = new ResumeActAs.Scope(7L, "marketer", 11L);
        assertThatThrownBy(() -> ResumeActAs.run(user("one"), scope, () -> ResumeActAs.run(user("two"), scope, () -> "x"))).isInstanceOf(IllegalStateException.class);
        assertThat(SecurityUtils.getCurrentUserLogin()).as("the outer call restored the caller").contains("marketer");
        assertThat(ResumeActAs.current()).isEmpty();
    }

    @Test
    void anOwnerAndAnActorAreBothRequired() {
        assertThatThrownBy(() -> ResumeActAs.run(null, new ResumeActAs.Scope(1L, "a", 1L), () -> "x")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ResumeActAs.run(user("o"), new ResumeActAs.Scope(1L, null, 1L), () -> "x")).isInstanceOf(IllegalArgumentException.class);
    }
}
