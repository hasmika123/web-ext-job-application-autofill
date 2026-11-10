package com.dossier.api.service.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.jobs.JobQueryParser.Parsed;
import org.junit.jupiter.api.Test;

/** What a person types becomes a safe boolean-mode string, word-start LIKEs and exclusions. */
class JobQueryParserTest {

    private static Parsed parse(String q) {
        return JobQueryParser.parse(q, 3);
    }

    @Test
    void wordsAreAndEdWithPrefixes() {
        Parsed p = parse("Senior Designer");
        assertThat(p.booleanQuery()).isEqualTo("+senior* +designer*");
        assertThat(p.likeIncludes()).isEmpty();
        assertThat(p.hasPositive()).isTrue();
    }

    @Test
    void aQuotedPhraseStaysTogether() {
        assertThat(parse("\"product designer\" remote").booleanQuery()).isEqualTo("+\"product designer\" +remote*");
    }

    @Test
    void aDashExcludesAndNeedsSomethingToFind() {
        assertThat(parse("designer -manager").booleanQuery()).isEqualTo("+designer* -manager");
        Parsed only = parse("-manager");
        assertThat(only.booleanQuery()).isNull();
        assertThat(only.likeExcludes()).containsExactly("manager");
        assertThat(only.hasPositive()).isFalse();
    }

    @Test
    void shortWordsAndStopWordsGoToTheLikeFallback() {
        Parsed p = parse("ux the c++ designer");
        assertThat(p.booleanQuery()).isEqualTo("+designer*");
        assertThat(p.likeIncludes()).containsExactly("ux", "the", "c++");
    }

    @Test
    void anExcludedShortWordIsLeftOutWithLike() {
        Parsed p = parse("designer -ux");
        assertThat(p.booleanQuery()).isEqualTo("+designer*");
        assertThat(p.likeExcludes()).containsExactly("ux");
    }

    @Test
    void punctuationInsideAWordBecomesAPhraseOfItsLettersWhenTheIndexCanServeThem() {
        assertThat(parse("front-end").booleanQuery()).isEqualTo("+\"front end\"");
        // node.js: "js" is too short for the index, so the word is matched as written
        Parsed p = parse("node.js");
        assertThat(p.booleanQuery()).isNull();
        assertThat(p.likeIncludes()).containsExactly("node.js");
    }

    @Test
    void mysqlOperatorsNeverReachTheQuery() {
        Parsed p = parse("+designer <ux> (lead) ~senior @home *x* \"unterminated");
        assertThat(p.booleanQuery()).doesNotContain("<", ">", "(", ")", "~", "@");
        assertThat(p.booleanQuery()).matches("[a-z0-9+*\" -]+");
    }

    @Test
    void nothingTypedIsNothingToSearchFor() {
        assertThat(parse(null).isEmpty()).isTrue();
        assertThat(parse("   ").isEmpty()).isTrue();
        assertThat(parse("+++ ---").isEmpty()).isTrue();
    }

    @Test
    void theFewerWordsRelaxationDropsTheLastWordToFind() {
        assertThat(parse("senior product designer").withoutLastTerm()).isEqualTo("senior product");
        assertThat(parse("senior designer -manager").withoutLastTerm()).isEqualTo("senior -manager");
        assertThat(parse("designer").withoutLastTerm()).isNull();
        assertThat(parse("designer -manager").withoutLastTerm()).isNull();
        assertThat(parse("\"product designer\" remote").withoutLastTerm()).isEqualTo("\"product designer\"");
    }
}
