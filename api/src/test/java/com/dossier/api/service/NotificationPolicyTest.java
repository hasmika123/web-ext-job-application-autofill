package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.service.NotificationPolicy.Decision;
import com.dossier.api.service.NotificationPolicy.Entry;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.EnumSet;
import org.junit.jupiter.api.Test;

/** The pure rules (E2E-U7.0): switches x locked kinds x quiet hours, including a daylight-saving jump. */
class NotificationPolicyTest {

    private static final ZoneId UTC = ZoneId.of("UTC");
    private static final ZoneId NY = ZoneId.of("America/New_York");
    private static final LocalTime TEN_PM = LocalTime.of(22, 0);
    private static final LocalTime EIGHT_AM = LocalTime.of(8, 0);
    private static final Instant NOON = Instant.parse("2026-10-13T12:00:00Z");
    private static final Instant MIDNIGHT = Instant.parse("2026-10-13T00:00:00Z");

    private static Decision decide(NotificationKind kind, Entry e, boolean emailEnabled, Instant now, ZoneId tz, LocalTime s, LocalTime end) {
        return NotificationPolicy.decide(kind, e, emailEnabled, now, tz, s, end);
    }

    @Test
    void emailGoesOutOnlyWhenTheSwitchSaysNow() {
        assertThat(decide(NotificationKind.APP_STATUS, new Entry(true, "now"), true, NOON, UTC, null, null)).isEqualTo(new Decision(true, true));
        assertThat(decide(NotificationKind.APP_STATUS, new Entry(true, "off"), true, NOON, UTC, null, null)).isEqualTo(new Decision(true, false));
    }

    @Test
    void inAppFollowsItsOwnSwitch() {
        assertThat(decide(NotificationKind.SYSTEM, new Entry(false, "now"), true, NOON, UTC, null, null)).isEqualTo(new Decision(false, true));
    }

    @Test
    void anUnknownEmailValueMeansOff() {
        assertThat(new Entry(true, "digest").email()).isEqualTo("off");
        assertThat(new Entry(true, null).email()).isEqualTo("off");
    }

    @Test
    void lockedKindsAreAlwaysOnWhateverIsSent() {
        for (NotificationKind kind : EnumSet.of(NotificationKind.BILLING, NotificationKind.SECURITY)) {
            assertThat(kind.locked()).isTrue();
            assertThat(decide(kind, new Entry(false, "off"), true, NOON, UTC, null, null)).isEqualTo(new Decision(true, true));
            // ...and quiet hours never hold them back
            assertThat(decide(kind, new Entry(false, "off"), true, MIDNIGHT, UTC, TEN_PM, EIGHT_AM)).isEqualTo(new Decision(true, true));
        }
    }

    @Test
    void everyOtherKindCanBeSwitchedOff() {
        for (NotificationKind kind : NotificationKind.values()) {
            if (kind.locked()) continue;
            assertThat(decide(kind, new Entry(false, "off"), true, NOON, UTC, null, null)).isEqualTo(new Decision(false, false));
        }
    }

    @Test
    void quietHoursHoldBackAnEmailButNotTheInAppNotice() {
        Decision quiet = decide(NotificationKind.APP_STATUS, new Entry(true, "now"), true, MIDNIGHT, UTC, TEN_PM, EIGHT_AM);
        assertThat(quiet).isEqualTo(new Decision(true, false));
        Decision awake = decide(NotificationKind.APP_STATUS, new Entry(true, "now"), true, NOON, UTC, TEN_PM, EIGHT_AM);
        assertThat(awake).isEqualTo(new Decision(true, true));
    }

    @Test
    void theAdminKillSwitchSilencesEveryEmail() {
        assertThat(decide(NotificationKind.APP_STATUS, new Entry(true, "now"), false, NOON, UTC, null, null)).isEqualTo(new Decision(true, false));
        assertThat(decide(NotificationKind.SECURITY, new Entry(true, "now"), false, NOON, UTC, null, null)).isEqualTo(new Decision(true, false));
    }

    @Test
    void aWindowAcrossMidnightIsOneWindow() {
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-10-13T22:00:00Z"), UTC, TEN_PM, EIGHT_AM)).isTrue(); // start is inside
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-10-13T23:59:00Z"), UTC, TEN_PM, EIGHT_AM)).isTrue();
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-10-13T03:00:00Z"), UTC, TEN_PM, EIGHT_AM)).isTrue();
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-10-13T08:00:00Z"), UTC, TEN_PM, EIGHT_AM)).isFalse(); // end is outside
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-10-13T15:00:00Z"), UTC, TEN_PM, EIGHT_AM)).isFalse();
    }

    @Test
    void aWindowWithinOneDay() {
        LocalTime one = LocalTime.of(13, 0);
        LocalTime two = LocalTime.of(14, 0);
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-10-13T13:30:00Z"), UTC, one, two)).isTrue();
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-10-13T14:00:00Z"), UTC, one, two)).isFalse();
    }

    @Test
    void noWindowMeansNoQuietHours() {
        assertThat(NotificationPolicy.inQuietHours(MIDNIGHT, UTC, null, null)).isFalse();
        assertThat(NotificationPolicy.inQuietHours(MIDNIGHT, UTC, TEN_PM, null)).isFalse();
        assertThat(NotificationPolicy.inQuietHours(MIDNIGHT, UTC, TEN_PM, TEN_PM)).isFalse();
    }

    @Test
    void theWindowIsReadOnTheUsersOwnClock() {
        // 03:00Z is 23:00 the evening before in New York (EDT, UTC-4): inside 22:00-08:00 there, and for a Tokyo user
        // (UTC+9) it is noon: outside.
        Instant t = Instant.parse("2026-10-13T03:00:00Z");
        assertThat(NotificationPolicy.inQuietHours(t, NY, TEN_PM, EIGHT_AM)).isTrue();
        assertThat(NotificationPolicy.inQuietHours(t, ZoneId.of("Asia/Tokyo"), TEN_PM, EIGHT_AM)).isFalse();
    }

    @Test
    void springForwardMovesTheWindowWithTheWallClock() {
        // New York, Sunday 2026-03-08: 02:00 EST jumps to 03:00 EDT. A 01:30-03:30 window is read on the wall clock.
        LocalTime from = LocalTime.of(1, 30);
        LocalTime to = LocalTime.of(3, 30);
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-03-08T06:29:00Z"), NY, from, to)).isFalse(); // 01:29 EST
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-03-08T06:45:00Z"), NY, from, to)).isTrue(); // 01:45 EST
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-03-08T07:00:00Z"), NY, from, to)).isTrue(); // 03:00 EDT, the skipped hour is gone
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-03-08T07:29:00Z"), NY, from, to)).isTrue(); // 03:29 EDT
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-03-08T07:30:00Z"), NY, from, to)).isFalse(); // 03:30 EDT
    }

    @Test
    void fallBackRepeatsTheHourAndBothPassesAreQuiet() {
        // New York, Sunday 2026-11-01: 02:00 EDT falls back to 01:00 EST, so 01:30 happens twice.
        LocalTime from = LocalTime.of(1, 0);
        LocalTime to = LocalTime.of(2, 0);
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-11-01T05:30:00Z"), NY, from, to)).isTrue(); // 01:30 EDT
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-11-01T06:30:00Z"), NY, from, to)).isTrue(); // 01:30 EST
        assertThat(NotificationPolicy.inQuietHours(Instant.parse("2026-11-01T07:00:00Z"), NY, from, to)).isFalse(); // 02:00 EST
    }

    @Test
    void theOldStoredNameIsTheNewAppStatusKind() {
        assertThat(NotificationKind.parse("STATUS_FROM_MAIL")).contains(NotificationKind.APP_STATUS);
        assertThat(NotificationKind.parse("APP_STATUS")).contains(NotificationKind.APP_STATUS);
        assertThat(NotificationKind.parse("NOPE")).isEmpty();
        assertThat(NotificationKind.parse(null)).isEmpty();
    }
}
