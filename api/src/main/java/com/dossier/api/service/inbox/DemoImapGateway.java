package com.dossier.api.service.inbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.Flags;
import jakarta.mail.Folder;
import jakarta.mail.FolderNotFoundException;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.Store;
import jakarta.mail.UIDFolder;
import jakarta.mail.URLName;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeBodyPart;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/**
 * The sample mailbox of the DEMO STACK (ent-inbox, docs/enterprise-v2/18-consultant-inbox.md section 7): an {@link ImapGateway} that serves a few
 * seeded job mails (an application received, an interview invite, a rejection, a suggestion or two and a newsletter) for the demo consultant, so QA
 * and the recorded stories can "connect a Gmail" without a real mailbox.
 *
 * <p><b>It can never be live.</b> It exists only when {@code dossier.demo.enabled} is true AND the {@code prod} profile is not active
 * ({@code @ConditionalOnProperty} + {@code @Profile("!prod")}), and its constructor refuses to start under prod anyway (belt and braces). It opens no
 * socket and contacts no server. The fixed demo address and the code rules are test values read from {@code demo/inbox-demo.json}: ANY 16-letter code
 * connects the demo address; a code beginning with the file's wrong-code prefix is refused as a wrong password; every other address is refused.
 *
 * <p>The mail goes through the real {@code InboxSyncService}, parser and board: this class only stands in for Google's server (as a Jakarta Mail
 * {@link Store}), it does not shortcut the sync.
 */
@Component
@Primary
@Profile("!prod")
@ConditionalOnProperty(prefix = "dossier.demo", name = "enabled", havingValue = "true")
public class DemoImapGateway implements ImapGateway {

    private static final Logger LOG = LoggerFactory.getLogger(DemoImapGateway.class);
    static final String RESOURCE = "demo/inbox-demo.json";
    static final String INBOX = "INBOX";

    private final JsonNode fixture;
    private final Session session = Session.getInstance(new Properties());

    @Autowired
    public DemoImapGateway(Environment environment) {
        if (environment.acceptsProfiles(Profiles.of("prod"))) throw new IllegalStateException("The demo mailbox must never run under the prod profile");
        this.fixture = load(RESOURCE);
        LOG.warn("DEMO inbox sandbox is active: connecting uses a built-in sample mailbox, no real Gmail is contacted");
    }

    /** For tests that build one without a Spring context. */
    DemoImapGateway(JsonNode fixture) {
        this.fixture = fixture;
    }

    static JsonNode load(String resource) {
        try (InputStream in = DemoImapGateway.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) throw new IllegalStateException("Missing " + resource);
            return new ObjectMapper().readTree(in);
        } catch (IOException e) {
            throw new IllegalStateException("Unreadable " + resource, e);
        }
    }

    @Override
    public boolean isDemoSandbox() {
        return true;
    }

    @Override
    public String sandboxAddress() {
        return demoAddress();
    }

    public String demoAddress() {
        return fixture.path("address").asText();
    }

    @Override
    public Probe probe(String address, String password) {
        Outcome o = outcomeFor(address, password);
        return new Probe(o, o == Outcome.OK ? sentFolderName() : null);
    }

    Outcome outcomeFor(String address, String password) {
        if (address == null || !address.trim().equalsIgnoreCase(demoAddress())) return Outcome.BAD_CREDENTIALS;
        String p = password == null ? "" : password.toLowerCase(Locale.ROOT);
        if (p.startsWith(fixture.path("wrongCodePrefix").asText("zzzz"))) return Outcome.BAD_CREDENTIALS;
        if (p.startsWith(fixture.path("appPasswordRequiredPrefix").asText("yyyy"))) return Outcome.APP_PASSWORD_REQUIRED;
        return Outcome.OK;
    }

    @Override
    public Store open(String address, String password) throws MessagingException {
        Outcome o = outcomeFor(address, password);
        if (o != Outcome.OK) throw new AuthenticationFailedException(o == Outcome.APP_PASSWORD_REQUIRED ? "Application-specific password required" : "Invalid credentials");
        try {
            return new DemoStore(session, mailbox(Instant.now()));
        } catch (java.io.UnsupportedEncodingException e) {
            throw new MessagingException("The sample mailbox could not be built", e);
        }
    }

    @Override
    public String sentFolder(Store store) {
        return sentFolderName();
    }

    private String sentFolderName() {
        return fixture.path("sentFolder").asText("[Gmail]/Sent Mail");
    }

    // ---- the sample mailbox ---------------------------------------------------------------------------------------------------------

    private record Sample(String folder, long uid, MimeMessage message) {}

    private List<Sample> mailbox(Instant now) throws MessagingException, java.io.UnsupportedEncodingException {
        List<Sample> out = new ArrayList<>();
        long inboxUid = 100;
        long sentUid = 100;
        int n = 0;
        for (JsonNode m : fixture.path("mails")) {
            boolean sent = "Sent".equalsIgnoreCase(m.path("folder").asText());
            Instant at = now.minus(Duration.ofDays(m.path("daysAgo").asLong(1)));
            String id = "<demo-" + (++n) + "@demo.kiwiply.invalid>";
            DemoMessage msg = new DemoMessage(session, Date.from(at));
            msg.setFrom(new InternetAddress(m.path("fromAddress").asText(), m.path("fromName").asText()));
            msg.setRecipient(Message.RecipientType.TO, new InternetAddress(sent ? m.path("to").asText() : demoAddress()));
            msg.setSubject(dates(m.path("subject").asText(), now));
            msg.setSentDate(Date.from(at));
            if (m.hasNonNull("ics")) {
                // A mail with a calendar invitation: text and text/calendar as alternatives, like Google Calendar and Outlook send them.
                MimeMultipart alternatives = new MimeMultipart("alternative");
                MimeBodyPart text = new MimeBodyPart();
                text.setText(dates(m.path("body").asText(), now), "UTF-8");
                MimeBodyPart cal = new MimeBodyPart();
                cal.setContent(dates(m.path("ics").asText(), now), "text/calendar; charset=UTF-8; method=REQUEST");
                cal.setHeader("Content-Type", "text/calendar; charset=UTF-8; method=REQUEST");
                alternatives.addBodyPart(text);
                alternatives.addBodyPart(cal);
                msg.setContent(alternatives);
            } else {
                msg.setText(dates(m.path("body").asText(), now));
            }
            msg.setHeader("Message-ID", id);
            msg.saveChanges();
            out.add(new Sample(sent ? sentFolderName() : INBOX, sent ? sentUid++ : inboxUid++, msg));
        }
        return out;
    }

    private static final java.util.regex.Pattern TOKEN = java.util.regex.Pattern.compile("\\{(date|ymd)\\+(\\d{1,3})}");

    /** {date+N} becomes "Tuesday, October 27" and {ymd+N} "20261027", N days from {@code now} (UTC), so the sample's interviews are always ahead with the right weekday. */
    static String dates(String text, Instant now) {
        java.util.regex.Matcher m = TOKEN.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            java.time.LocalDate d = now.atZone(java.time.ZoneOffset.UTC).toLocalDate().plusDays(Long.parseLong(m.group(2)));
            String v = "date".equals(m.group(1))
                ? d.format(java.time.format.DateTimeFormatter.ofPattern("EEEE, MMMM d", Locale.ENGLISH))
                : d.format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE);
            m.appendReplacement(out, java.util.regex.Matcher.quoteReplacement(v));
        }
        m.appendTail(out);
        return out.toString();
    }

    /** A MimeMessage that reports the date it "arrived" (the real server does; the first read searches by it). */
    static final class DemoMessage extends MimeMessage {
        private final Date received;

        DemoMessage(Session s, Date received) {
            super(s);
            this.received = received;
        }

        @Override
        public Date getReceivedDate() {
            return received;
        }

        @Override
        protected void updateMessageID() {
            // keep the Message-ID set by the sample
        }
    }

    // ---- a minimal read-only Store over the sample ---------------------------------------------------------------------------------------

    static final class DemoStore extends Store {
        private final List<Sample> samples;

        DemoStore(Session session, List<Sample> samples) {
            super(session, new URLName("demo", "localhost", -1, null, null, null));
            this.samples = samples;
        }

        @Override
        public Folder getDefaultFolder() {
            return new DemoFolder(this, "", samples);
        }

        @Override
        public Folder getFolder(String name) {
            return new DemoFolder(this, name, samples);
        }

        @Override
        public Folder getFolder(URLName url) {
            return getFolder(url.getFile());
        }
    }

    /** One folder of the sample: read-only, with stable UIDs and a fixed UIDVALIDITY. */
    static final class DemoFolder extends Folder implements UIDFolder {
        private final String name;
        private final List<Sample> mine = new ArrayList<>();
        private boolean open;

        DemoFolder(Store store, String name, List<Sample> all) {
            super(store);
            this.name = name;
            for (Sample s : all) if (s.folder().equals(name)) mine.add(s);
        }

        private boolean known() {
            return INBOX.equals(name) || name.startsWith("[Gmail]/");
        }

        @Override
        public String getName() {
            int i = name.lastIndexOf('/');
            return i < 0 ? name : name.substring(i + 1);
        }

        @Override
        public String getFullName() {
            return name;
        }

        @Override
        public Folder getParent() {
            return null;
        }

        @Override
        public boolean exists() {
            return known();
        }

        @Override
        public Folder[] list(String pattern) {
            return new Folder[0];
        }

        @Override
        public char getSeparator() {
            return '/';
        }

        @Override
        public int getType() {
            return HOLDS_MESSAGES;
        }

        @Override
        public boolean create(int type) {
            return false;
        }

        @Override
        public boolean hasNewMessages() {
            return false;
        }

        @Override
        public Folder getFolder(String sub) {
            return new DemoFolder(getStore(), sub, List.of());
        }

        @Override
        public boolean delete(boolean recurse) {
            return false;
        }

        @Override
        public boolean renameTo(Folder f) {
            return false;
        }

        @Override
        public void open(int mode) throws MessagingException {
            if (!known()) throw new FolderNotFoundException(this);
            if (mode != READ_ONLY) throw new MessagingException("The demo mailbox is read-only");
            open = true;
        }

        @Override
        public void close(boolean expunge) {
            open = false;
        }

        @Override
        public boolean isOpen() {
            return open;
        }

        @Override
        public Flags getPermanentFlags() {
            return new Flags();
        }

        @Override
        public int getMessageCount() {
            return mine.size();
        }

        @Override
        public Message getMessage(int msgnum) {
            return mine.get(msgnum - 1).message();
        }

        @Override
        public void appendMessages(Message[] msgs) throws MessagingException {
            throw new MessagingException("The demo mailbox is read-only");
        }

        @Override
        public Message[] expunge() throws MessagingException {
            throw new MessagingException("The demo mailbox is read-only");
        }

        // UIDFolder

        @Override
        public long getUIDValidity() {
            return 1L;
        }

        @Override
        public long getUIDNext() {
            return mine.isEmpty() ? 100 : mine.get(mine.size() - 1).uid() + 1;
        }

        @Override
        public Message getMessageByUID(long uid) {
            return mine.stream().filter(s -> s.uid() == uid).map(Sample::message).findFirst().orElse(null);
        }

        @Override
        public Message[] getMessagesByUID(long start, long end) {
            return mine.stream().filter(s -> s.uid() >= start && (end == LASTUID || s.uid() <= end)).map(s -> (Message) s.message()).toArray(Message[]::new);
        }

        @Override
        public Message[] getMessagesByUID(long[] uids) {
            List<Message> out = new ArrayList<>();
            for (long u : uids) out.add(getMessageByUID(u));
            return out.toArray(new Message[0]);
        }

        @Override
        public long getUID(Message message) {
            return mine.stream().filter(s -> s.message() == message).map(Sample::uid).findFirst().orElse(-1L);
        }
    }
}
