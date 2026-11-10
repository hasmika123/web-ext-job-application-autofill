package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import java.util.Properties;
import org.junit.jupiter.api.Test;

/** The calendar side of a mail: the part is read for its few fields and never kept; the Date header's zone is read. */
class MailCalendarTest {

    private static final String ICS = "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:u1\r\nSEQUENCE:2\r\nDTSTART;TZID=Europe/London:20261112T160000\r\n" +
        "DTEND;TZID=Europe/London:20261112T163000\r\nSUMMARY:Phone screen\r\nURL:https://acme.zoom.us/j/9\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    private static MimeMessage withCalendar(boolean asAttachment) throws Exception {
        MimeMessage m = new MimeMessage(Session.getInstance(new Properties()));
        MimeMultipart mp = new MimeMultipart("mixed");
        MimeBodyPart text = new MimeBodyPart();
        text.setText("Your phone screen is on the calendar.");
        MimeBodyPart cal = new MimeBodyPart();
        cal.setContent(ICS, "text/calendar; charset=UTF-8; method=REQUEST");
        cal.setHeader("Content-Type", "text/calendar; charset=UTF-8; method=REQUEST");
        if (asAttachment) {
            cal.setFileName("invite.ics");
            cal.setDisposition("attachment");
        }
        mp.addBodyPart(text);
        mp.addBodyPart(cal);
        m.setContent(mp);
        m.saveChanges();
        return m;
    }

    @Test
    void anInlineCalendarPartGivesItsFieldsAsSmallJson() throws Exception {
        String json = MailCalendar.eventJson(withCalendar(false));
        assertThat(json).isNotNull().doesNotContain("BEGIN:VCALENDAR").hasSizeLessThan(600);
        IcsEvent e = MailCalendar.parse(json);
        assertThat(e.uid()).isEqualTo("u1");
        assertThat(e.sequence()).isEqualTo(2);
        assertThat(e.start()).isEqualTo("2026-11-12T16:00:00");
        assertThat(e.tz()).isEqualTo("Europe/London");
        assertThat(e.link()).isEqualTo("https://acme.zoom.us/j/9");
    }

    @Test
    void anInviteIcsAttachmentIsReadTheSameWayAndTheTextStillExcludesIt() throws Exception {
        MimeMessage m = withCalendar(true);
        assertThat(MailCalendar.eventJson(m)).isNotNull();
        assertThat(MailText.of(m)).isEqualTo("Your phone screen is on the calendar.").doesNotContain("VCALENDAR");
    }

    @Test
    void noCalendarPartGivesNothing() throws Exception {
        MimeMessage m = new MimeMessage(Session.getInstance(new Properties()));
        m.setText("hello");
        m.saveChanges();
        assertThat(MailCalendar.eventJson(m)).isNull();
        assertThat(MailCalendar.parse(null)).isNull();
        assertThat(MailCalendar.parse("not json")).isNull();
    }

    @Test
    void theDateHeaderZoneIsRead() {
        assertThat(MailCalendar.offsetOf("Mon, 12 Oct 2026 09:30:00 -0700 (PDT)")).isEqualTo("-07:00");
        assertThat(MailCalendar.offsetOf("Mon, 12 Oct 2026 09:30:00 +0530")).isEqualTo("+05:30");
        assertThat(MailCalendar.offsetOf("Mon, 12 Oct 2026 16:30:00 +0000")).as("UTC says nothing about where the sender was").isNull();
        assertThat(MailCalendar.offsetOf("Mon, 12 Oct 2026 16:30:00 GMT")).isNull();
        assertThat(MailCalendar.offsetOf(null)).isNull();
    }
}
