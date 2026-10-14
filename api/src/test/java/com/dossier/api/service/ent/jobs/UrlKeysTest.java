package com.dossier.api.service.ent.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.org.OrgException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Golden cases of the job identity key (doc 60 section 2). The same rules feed {@code url_key_hash}, so a change here is a data migration. */
class UrlKeysTest {

    private static final String LI_ID = "3912345678";

    @Test
    void schemeHostCaseWwwFragmentAndTrailingSlashAreNormalized() {
        assertThat(UrlKeys.normalize("HTTPS://WWW.Example.COM/Jobs/123/#apply")).isEqualTo("https://example.com/Jobs/123");
        assertThat(UrlKeys.normalize("  https://example.com/a/b///  ")).isEqualTo("https://example.com/a/b");
        assertThat(UrlKeys.normalize("HTTP://Example.com/A")).as("path case is kept, scheme lower-cased").isEqualTo("http://example.com/A");
        assertThat(UrlKeys.normalize("https://example.com")).isEqualTo("https://example.com");
        assertThat(UrlKeys.normalize("https://example.com/")).isEqualTo("https://example.com");
    }

    @Test
    void trackingParametersAreDroppedAndTheRestKeepsItsOrder() {
        assertThat(UrlKeys.normalize("https://example.com/jobs/1?utm_source=x&ref=y&utm_campaign=z&source=li&trk=a&from=b")).isEqualTo("https://example.com/jobs/1");
        assertThat(UrlKeys.normalize("https://boards.greenhouse.io/acme/jobs/456?gh_jid=456&gh_src=abc")).isEqualTo("https://boards.greenhouse.io/acme/jobs/456?gh_jid=456");
        assertThat(UrlKeys.normalize("https://jobs.lever.co/acme/1?lever-source=x&team=Eng&lever-origin=y")).isEqualTo("https://jobs.lever.co/acme/1?team=Eng");
        assertThat(UrlKeys.normalize("https://x.com/p?b=2&a=1")).as("order is kept, as ApplicationKeys.url does").isEqualTo("https://x.com/p?b=2&a=1");
    }

    @Test
    void twoLinksToTheSamePostingShareOneKeyAndOneHash() {
        String a = UrlKeys.normalize("https://www.example.com/careers/42/?utm_medium=email#top");
        String b = UrlKeys.normalize("https://example.com/careers/42");
        assertThat(a).isEqualTo(b);
        assertThat(UrlKeys.hash(a)).isEqualTo(UrlKeys.hash(b)).hasSize(64).matches("[0-9a-f]{64}");
        assertThat(UrlKeys.hash(UrlKeys.normalize("https://example.com/careers/43"))).isNotEqualTo(UrlKeys.hash(a));
    }

    @Test
    void linkedinCollectionSearchAndPostingLinksOfOneJobAreOneKeyWhenCurrentJobIdIsTheExternalId() {
        String canonical = "https://linkedin.com/jobs/view/" + LI_ID;
        assertThat(UrlKeys.normalize("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=" + LI_ID + "&utm_source=a", LI_ID)).isEqualTo(canonical);
        assertThat(UrlKeys.normalize("https://www.linkedin.com/jobs/search/?currentJobId=" + LI_ID + "&keywords=java&location=Austin", LI_ID)).isEqualTo(canonical);
        assertThat(UrlKeys.normalize("https://www.linkedin.com/jobs/view/senior-java-developer-at-acme-" + LI_ID + "/?trackingId=abc&refId=x", LI_ID)).isEqualTo(canonical);
        assertThat(UrlKeys.normalize("https://www.linkedin.com/jobs/view/" + LI_ID + "/", LI_ID)).isEqualTo(canonical);
        assertThat(UrlKeys.normalize("https://www.linkedin.com/jobs/view/" + LI_ID + "/")).as("no external id given: just the normal rules").isEqualTo(canonical);
    }

    @Test
    void twoJobsOpenedFromOneLinkedinListNeverCollide() {
        String list = "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=";
        assertThat(UrlKeys.normalize(list + "111111111", "111111111")).isNotEqualTo(UrlKeys.normalize(list + "222222222", "222222222"));
        // without an external id (or with a different one) the parameter stays, so the two list URLs still differ
        assertThat(UrlKeys.normalize(list + "111111111")).isEqualTo("https://linkedin.com/jobs/collections/recommended?currentJobId=111111111");
        assertThat(UrlKeys.normalize(list + "111111111", "999999999")).isEqualTo("https://linkedin.com/jobs/collections/recommended?currentJobId=111111111");
    }

    @Test
    void currentJobIdOnAnotherHostIsDroppedOnlyWhenItWasTheExternalId() {
        assertThat(UrlKeys.normalize("https://careers.example.com/search?currentJobId=77&q=java", "77")).isEqualTo("https://careers.example.com/search?q=java");
        assertThat(UrlKeys.normalize("https://careers.example.com/search?currentJobId=77&q=java", "88")).isEqualTo("https://careers.example.com/search?currentJobId=77&q=java");
        assertThat(UrlKeys.normalize("https://careers.example.com/search?currentJobId=77&q=java")).isEqualTo("https://careers.example.com/search?currentJobId=77&q=java");
    }

    @Test
    void anUnparseableOrNonWebValueHasNoKey() {
        assertThat(UrlKeys.normalize(null)).isNull();
        assertThat(UrlKeys.normalize("")).isNull();
        assertThat(UrlKeys.normalize("   ")).isNull();
        assertThat(UrlKeys.normalize("not a url")).isNull();
        assertThat(UrlKeys.normalize("/relative/path")).isNull();
        assertThat(UrlKeys.normalize("ftp://example.com/a")).isNull();
        assertThat(UrlKeys.normalize("mailto:a@example.com")).isNull();
        assertThat(UrlKeys.normalize("javascript:alert(1)")).isNull();
        assertThat(UrlKeys.hash(null)).isNull();
        assertThat(UrlKeys.of("nope", null)).isNull();
    }

    @Test
    void theKeyIsCappedAtOneThousandCharactersAndStillHashes() {
        String longUrl = "https://example.com/p?q=" + "a".repeat(1500);
        String key = UrlKeys.normalize(longUrl);
        assertThat(key).hasSize(UrlKeys.MAX_KEY).startsWith("https://example.com/p?q=aaa");
        assertThat(UrlKeys.hash(key)).hasSize(64);
    }

    @Test
    void theHashIsPlainSha256Hex() {
        assertThat(UrlKeys.hash("abc")).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        UrlKeys.Key k = UrlKeys.of("https://www.example.com/a/?utm_source=x", null);
        assertThat(k.key()).isEqualTo("https://example.com/a");
        assertThat(k.hash()).isEqualTo(UrlKeys.hash("https://example.com/a")).isEqualTo(UrlKeys.keyHash("https://www.example.com/a/", null));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "https://example.com/jobs/1",
        "https://www.linkedin.com/jobs/view/3912345678/",
        "https://boards.greenhouse.io/acme/jobs/456?gh_jid=456",
        "https://acme.wd5.myworkdayjobs.com/en-US/External/job/Austin-TX/Engineer_R-1234",
        "HTTPS://Jobs.Example.com/A",
        "https://example.com:443/jobs/1",
        "https://example.com./jobs/1",
        "https://xn--bcher-kva.de/jobs/1",
    })
    void realPostingLinksAreAllowed(String url) {
        assertThat(UrlKeys.isAllowed(url)).as(url).isTrue();
        UrlKeys.requireAllowed(url); // does not throw
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "http://example.com/jobs/1",
        "ftp://example.com/jobs/1",
        "javascript:alert(1)",
        "data:text/html,<b>x</b>",
        "//example.com/jobs/1",
        "example.com/jobs/1",
        "https://127.0.0.1/jobs/1",
        "https://0.0.0.0/jobs/1",
        "https://10.0.0.5/jobs/1",
        "https://192.168.1.10/jobs/1",
        "https://169.254.169.254/latest/meta-data",
        "https://2130706433/jobs/1",
        "https://0x7f.0.0.1/jobs/1",
        "https://[::1]/jobs/1",
        "https://[2001:db8::1]/jobs/1",
        "https://localhost/jobs/1",
        "https://app.localhost/jobs/1",
        "https://intranet/jobs/1",
        "https://printer.local/jobs/1",
        "https://jira.internal/jobs/1",
        "https://user:pw@example.com/jobs/1",
        "https://user@example.com/jobs/1",
        "https://example.com:8443/jobs/1",
        "https://example.com/has space",
        "https://exa mple.com/jobs/1",
        "https://-bad-.example.com/jobs/1",
        "https://example.c/jobs/1",
        "https://evil..com/jobs/1",
        "https:///jobs/1",
        "",
        "   ",
    })
    void unsafeOrUselessLinksAreRefused(String url) {
        assertThat(UrlKeys.isAllowed(url)).as(url).isFalse();
        assertThatThrownBy(() -> UrlKeys.requireAllowed(url))
            .isInstanceOfSatisfying(OrgException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(400);
                assertThat(e.getCode()).isEqualTo("VALIDATION");
                assertThat(e.getExtra()).containsEntry("field", "jobUrl");
            });
    }

    @Test
    void nullAndOverlongLinksAreRefused() {
        assertThat(UrlKeys.isAllowed(null)).isFalse();
        String max = "https://example.com/" + "a".repeat(UrlKeys.MAX_URL - "https://example.com/".length());
        assertThat(max).hasSize(UrlKeys.MAX_URL);
        assertThat(UrlKeys.isAllowed(max)).isTrue();
        assertThat(UrlKeys.isAllowed(max + "a")).isFalse();
        assertThatThrownBy(() -> UrlKeys.requireAllowed(null)).isInstanceOf(OrgException.class);
    }
}
