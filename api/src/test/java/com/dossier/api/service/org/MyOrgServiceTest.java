package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.ShareScope;
import java.util.List;
import org.junit.jupiter.api.Test;

/** O6.2: the member-facing words are generated from the visibility matrix, so a new field cannot be shown without a sentence. */
class MyOrgServiceTest {

    @Test
    void everyFieldSomeScopeShowsHasASentenceInTheMembersWords() {
        for (ShareField f : ShareField.values()) {
            if (f.minScope() == null) continue; // PRIVATE_DATA: no scope shows it
            assertThat(MyOrgService.words()).as("a member-facing sentence for " + f).containsKey(f);
        }
    }

    @Test
    void whatTheOrgSeesGrowsWithTheScopeAndNeverNamesEmployersBeforeFull() {
        List<String> none = MyOrgService.sees(ShareScope.NONE);
        List<String> summary = MyOrgService.sees(ShareScope.SUMMARY);
        List<String> full = MyOrgService.sees(ShareScope.FULL);
        assertThat(none).hasSize(2);
        assertThat(summary).containsAll(none).hasSize(7);
        assertThat(full).containsAll(summary).hasSize(12);
        assertThat(String.join(" ", summary)).doesNotContain("Company names").doesNotContain("resumes").doesNotContain("calendar");
        assertThat(String.join(" ", full)).contains("Company names").contains("Your resumes");
    }

    @Test
    void whatNoScopeEverShowsIsNeverInAnyList() {
        String everything = String.join(" ", MyOrgService.sees(ShareScope.FULL)).toLowerCase();
        for (String never : MyOrgService.NEVER) assertThat(everything).doesNotContain(never.toLowerCase());
        assertThat(MyOrgService.NEVER).contains("Your saved answers", "Your inbox", "Private notes");
    }
}
