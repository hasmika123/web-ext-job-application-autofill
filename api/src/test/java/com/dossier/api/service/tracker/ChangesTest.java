package com.dossier.api.service.tracker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.dto.TrackerDTOs.ChangeDTO;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** "What changed": field names and enum / date values only, capped to the column, never free text. */
class ChangesTest {

    @Test
    void nothingChangedIsNoJson() {
        assertThat(new Changes().toJson()).isNull();
        assertThat(Changes.parse(null)).isEmpty();
    }

    @Test
    void anEnumFlagInstantAndTextFieldSerialise() {
        Changes c = new Changes()
            .enumValue("status", ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW)
            .text("nextAction")
            .flag("starred", false, true)
            .instant("nextActionAt", null, Instant.parse("2026-10-17T09:00:00Z"));

        assertThat(c.toJson()).isEqualTo(
            "[{\"f\":\"status\",\"from\":\"APPLIED\",\"to\":\"INTERVIEW\"},{\"f\":\"nextAction\"},{\"f\":\"starred\",\"from\":\"false\",\"to\":\"true\"},{\"f\":\"nextActionAt\",\"to\":\"2026-10-17T09:00:00Z\"}]"
        );
        assertThat(c.fields()).containsExactly("status", "nextAction", "starred", "nextActionAt");
        assertThat(Changes.parse(c.toJson())).first().isEqualTo(new ChangeDTO("status", "APPLIED", "INTERVIEW"));
        assertThat(Changes.parse(c.toJson())).contains(new ChangeDTO("nextAction", null, null));
    }

    @Test
    void freeTextCannotEnterByConstruction() {
        assertThatThrownBy(() -> new Changes().code("outcome", null, "Sarah said she would call back on Tuesday")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Changes().code("outcome", "ACCEPTED", "has spaces")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Changes().text("a field name with spaces")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Changes().text("jobDescription\":\"leak")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void whenTooLongTheTailIsDroppedAndTheHeadlineIsKept() {
        Changes c = new Changes().enumValue("status", ApplicationStatus.APPLIED, ApplicationStatus.INTERVIEW);
        for (int i = 0; i < 200; i++) c.text("field" + i);

        String json = c.toJson();
        assertThat(json.length()).isLessThanOrEqualTo(Changes.MAX_CHARS);
        List<ChangeDTO> back = Changes.parse(json);
        assertThat(back.get(0).f()).isEqualTo("status");
        assertThat(back.size()).isBetween(2, 200);
    }

    @Test
    void aBrokenStoredValueNeverBreaksATimeline() {
        assertThat(Changes.parse("not json")).isEmpty();
        assertThat(Changes.parse("{\"f\":\"x\"}")).isEmpty();
        assertThat(Changes.parse("[{\"nope\":1},{\"f\":\"status\",\"to\":\"OFFER\"}]")).containsExactly(new ChangeDTO("status", null, "OFFER"));
    }
}
