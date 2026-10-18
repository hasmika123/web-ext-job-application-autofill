package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.ProfileService;
import com.dossier.api.service.ProfileVersion;
import com.dossier.api.service.dto.PlanDTO;
import com.dossier.api.service.ent.consultant.ProfileWorkspaces;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * {@code GET /api/profile/version} gains {@code workspaces[]} (doc 60 section 4) without touching {@code version}: the hash stays "what a bio and resume
 * pull returns" (so a membership change never forces a mirror re-pull), the extension reads {@code workspaces} on every poll, and a failure to build the
 * list never fails the poll.
 */
class ProfileVersionWorkspacesTest {

    ProfileService profileService = mock(ProfileService.class);
    EntitlementService entitlements = mock(EntitlementService.class);
    ProfileWorkspaces workspaces = mock(ProfileWorkspaces.class);
    MockMvc mvc = MockMvcBuilders.standaloneSetup(new ProfileResource(profileService, entitlements, workspaces)).build();

    private void plan() {
        when(profileService.profileVersion()).thenReturn("0123456789abcdef");
        when(entitlements.currentUserPlan()).thenReturn(new PlanDTO("FREE", "NONE", null, false, false, false));
    }

    @Test
    void theVersionResponseListsTheWorkspacesAndKeepsVersionAndPlan() throws Exception {
        plan();
        when(workspaces.ofCurrentUser()).thenReturn(List.of(new ProfileWorkspaces.Workspace(3L, "Acme Staffing", true, false), new ProfileWorkspaces.Workspace(4L, "Globex", false, true)));
        mvc.perform(get("/api/profile/version"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.version").value("0123456789abcdef"))
            .andExpect(jsonPath("$.plan").value("FREE"))
            .andExpect(jsonPath("$.workspaces.length()").value(2))
            .andExpect(jsonPath("$.workspaces[0].orgId").value(3))
            .andExpect(jsonPath("$.workspaces[0].name").value("Acme Staffing"))
            .andExpect(jsonPath("$.workspaces[0].consultant").value(true))
            .andExpect(jsonPath("$.workspaces[0].marketer").value(false))
            .andExpect(jsonPath("$.workspaces[1].marketer").value(true));
    }

    @Test
    void aPersonWithNoSeatGetsAnEmptyList() throws Exception {
        plan();
        when(workspaces.ofCurrentUser()).thenReturn(List.of());
        mvc.perform(get("/api/profile/version")).andExpect(status().isOk()).andExpect(jsonPath("$.workspaces.length()").value(0));
    }

    @Test
    void aFailureBuildingTheListNeverFailsThePoll() throws Exception {
        plan();
        when(workspaces.ofCurrentUser()).thenThrow(new IllegalStateException("db down"));
        mvc.perform(get("/api/profile/version"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.version").value("0123456789abcdef"))
            .andExpect(jsonPath("$.workspaces.length()").value(0));
    }

    @Test
    void theVersionHashDoesNotTakeTheWorkspacesAsInput() throws Exception {
        // by construction: compute() sees the bio and the resumes only, so a change of workspaces can not move the version
        var compute = java.util.Arrays.stream(ProfileVersion.class.getDeclaredMethods()).filter(m -> m.getName().equals("compute")).toList();
        assertThat(compute).hasSize(1);
        assertThat(compute.get(0).getParameterTypes()).containsExactly(java.util.Optional.class, java.util.List.class);
    }

    // ---- decision O4 (doc 19 section 6.2): account {kind, orgId, name, consultant, marketer} ------------------------------------

    @Test
    void anEnterpriseAccountIsNamedWithItsOrganizationAndRolesAndListsItsOneWorkspace() throws Exception {
        plan();
        when(workspaces.accountOfCurrentUser()).thenReturn(new ProfileWorkspaces.Account("ENTERPRISE", 3L, "Acme Staffing", true, false));
        when(workspaces.ofCurrentUser()).thenReturn(List.of(new ProfileWorkspaces.Workspace(3L, "Acme Staffing", true, false)));
        mvc.perform(get("/api/profile/version"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.version").value("0123456789abcdef"))
            .andExpect(jsonPath("$.plan").value("FREE"))
            .andExpect(jsonPath("$.account.kind").value("ENTERPRISE"))
            .andExpect(jsonPath("$.account.orgId").value(3))
            .andExpect(jsonPath("$.account.name").value("Acme Staffing"))
            .andExpect(jsonPath("$.account.consultant").value(true))
            .andExpect(jsonPath("$.account.marketer").value(false))
            .andExpect(jsonPath("$.workspaces.length()").value(1));
    }

    @Test
    void aPersonalAccountHasNoOrganizationAndNoWorkspaces() throws Exception {
        plan();
        when(workspaces.accountOfCurrentUser()).thenReturn(ProfileWorkspaces.Account.PERSONAL);
        when(workspaces.ofCurrentUser()).thenReturn(List.of());
        mvc.perform(get("/api/profile/version"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.account.kind").value("PERSONAL"))
            .andExpect(jsonPath("$.account.orgId").doesNotExist())
            .andExpect(jsonPath("$.account.name").doesNotExist())
            .andExpect(jsonPath("$.account.consultant").value(false))
            .andExpect(jsonPath("$.account.marketer").value(false))
            .andExpect(jsonPath("$.workspaces.length()").value(0));
    }

    @Test
    void anUnresolvableAccountNeverFailsThePollAndReadsAsPersonal() throws Exception {
        plan();
        when(workspaces.accountOfCurrentUser()).thenThrow(new IllegalStateException("db down"));
        when(workspaces.ofCurrentUser()).thenReturn(List.of());
        mvc.perform(get("/api/profile/version")).andExpect(status().isOk()).andExpect(jsonPath("$.account.kind").value("PERSONAL"));
        org.mockito.Mockito.doReturn(null).when(workspaces).accountOfCurrentUser();
        mvc.perform(get("/api/profile/version")).andExpect(status().isOk()).andExpect(jsonPath("$.account.kind").value("PERSONAL"));
    }

    @Test
    void theAccountIsNotPartOfTheVersionHash() {
        // by construction (see theVersionHashDoesNotTakeTheWorkspacesAsInput): compute() takes the bio and the resumes only
        assertThat(java.util.Arrays.stream(ProfileVersion.class.getDeclaredMethods()).filter(m -> m.getName().equals("compute")).findFirst().orElseThrow().getParameterCount()).isEqualTo(2);
    }
}
