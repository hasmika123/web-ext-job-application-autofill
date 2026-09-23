package com.dossier.api.service.inbox;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.InboxConnection;
import com.dossier.api.domain.InboxFolderState;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.InboxFolderStateRepository;
import com.dossier.api.repository.InboxMessageRepository;
import jakarta.mail.Address;
import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.FetchProfile;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Store;
import jakarta.mail.UIDFolder;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.search.ComparisonTerm;
import jakarta.mail.search.ReceivedDateTerm;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Date;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.eclipse.angus.mail.imap.IMAPFolder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Reads one connected inbox (Phase 14.3): the Inbox and the Sent folder, in one IMAP session.
 *
 * <p>Each folder is read by UID, not by date (Sales-App's date-based sync re-read and relied on
 * dedup): the highest UID read is kept with the folder's UIDVALIDITY, and the next read asks only
 * for what came after it. The first read — or any read after the server renumbered the folder
 * (a new UIDVALIDITY) — is a backfill: the last {@code backfill-days} (60), newest
 * {@code max-per-folder} (500) first; after that the position jumps to the folder's current end,
 * so older mail is never pulled in later. An ordinary read takes up to 500 new messages, oldest
 * first; any more wait for the next read.
 *
 * <p>Every message keeps its headers. Its body text is kept only when {@link JobMailRules} says it's
 * job mail, and never its attachments ({@link MailText}). The same message in Inbox and Sent is kept
 * once (by Message-ID). Everything is opened read-only; nothing is ever sent, moved, flagged or
 * deleted.
 *
 * <p>A rejected password marks the connection NEEDS_RECONNECT — no more reads until the user
 * reconnects (it was deleted in Google, or the account changed). Other failures count up; three in a
 * row mark it ERROR, and {@link InboxPoller} backs off.
 */
@Service
public class InboxSyncService {

    private static final Logger LOG = LoggerFactory.getLogger(InboxSyncService.class);
    static final int ERROR_AFTER = 3;

    public enum Result {
        OK,
        NEEDS_RECONNECT,
        FAILED,
        SKIPPED,
    }

    private final InboxConnectionRepository connections;
    private final InboxFolderStateRepository states;
    private final InboxMessageRepository messages;
    private final ApplicationRepository applications;
    private final ImapGateway imap;
    private final SecretBox box;
    private final InboxProperties props;

    public InboxSyncService(
        InboxConnectionRepository connections,
        InboxFolderStateRepository states,
        InboxMessageRepository messages,
        ApplicationRepository applications,
        ImapGateway imap,
        SecretBox box,
        InboxProperties props
    ) {
        this.connections = connections;
        this.states = states;
        this.messages = messages;
        this.applications = applications;
        this.imap = imap;
        this.box = box;
        this.props = props;
    }

    /** Read one user's inbox now. */
    public Result sync(Long userId) {
        Optional<InboxConnection> maybe = connections.findById(userId);
        if (maybe.isEmpty() || !box.usable() || InboxConnection.NEEDS_RECONNECT.equals(maybe.get().getStatus())) return Result.SKIPPED;
        InboxConnection c = maybe.get();
        String context = InboxService.context(userId);
        Instant now = Instant.now();
        Store store = null;
        try {
            String password = box.decrypt(c.getPasswordEnc(), context);
            if (box.needsRotation(c.getPasswordEnc())) c.setPasswordEnc(box.encrypt(password, context)); // key rotated: move it forward
            store = imap.open(c.getAddress(), password);
            List<String> companies = applications.findByUserId(userId).stream().map(Application::getCompany).toList();
            readFolder(store, userId, "INBOX", InboxMessage.IN, companies, now);
            String sent = c.getSentFolder() != null ? c.getSentFolder() : imap.sentFolder(store);
            if (sent != null) {
                c.setSentFolder(sent);
                readFolder(store, userId, sent, InboxMessage.OUT, companies, now);
            }
            if (!stillConnected(userId)) return Result.SKIPPED;
            c.setStatus(InboxConnection.CONNECTED);
            c.setLastError(null);
            c.setConsecutiveFailures(0);
            c.setLastCheckedAt(now);
            connections.save(c);
            return Result.OK;
        } catch (AuthenticationFailedException e) {
            if (!stillConnected(userId)) return Result.SKIPPED;
            c.setStatus(InboxConnection.NEEDS_RECONNECT);
            c.setLastError("Gmail stopped accepting the app password.");
            c.setLastCheckedAt(now);
            connections.save(c);
            return Result.NEEDS_RECONNECT;
        } catch (MessagingException | RuntimeException e) {
            if (!stillConnected(userId)) return Result.SKIPPED;
            int failures = c.getConsecutiveFailures() + 1;
            c.setConsecutiveFailures(failures);
            c.setLastCheckedAt(now);
            c.setLastError(e instanceof MessagingException me && JakartaImapGateway.classifyOther(me) == ImapGateway.Outcome.UNREACHABLE
                ? "Couldn't reach Gmail."
                : "Reading the inbox didn't finish.");
            if (failures >= ERROR_AFTER) c.setStatus(InboxConnection.ERROR);
            connections.save(c);
            LOG.warn("Inbox sync failed for a user ({} in a row): {}", failures, e.getClass().getSimpleName());
            return Result.FAILED;
        } finally {
            JakartaImapGateway.closeQuietly(store);
        }
    }

    /**
     * The user may disconnect while their inbox is being read. Saving the connection then would bring
     * it back, so check first — and drop anything this read wrote after they left.
     */
    private boolean stillConnected(Long userId) {
        if (connections.existsById(userId)) return true;
        messages.deleteByUser(userId);
        states.deleteByUser(userId);
        return false;
    }

    void readFolder(Store store, Long userId, String name, String direction, List<String> companies, Instant now) throws MessagingException {
        Folder f = store.getFolder(name);
        if (!f.exists()) return;
        f.open(Folder.READ_ONLY);
        try {
            UIDFolder uf = (UIDFolder) f;
            long validity = uf.getUIDValidity();
            Optional<InboxFolderState> found = states.findOneByUserIdAndFolder(userId, name);
            InboxFolderState state = found.orElseGet(() -> new InboxFolderState(userId, name));
            boolean backfill = found.isEmpty() || state.getUidValidity() != validity;

            Message[] batch;
            if (backfill) {
                Date since = Date.from(now.minus(Duration.ofDays(props.getBackfillDays())));
                batch = f.search(new ReceivedDateTerm(ComparisonTerm.GE, since));
            } else {
                batch = uf.getMessagesByUID(state.getLastUid() + 1, UIDFolder.LASTUID);
            }
            FetchProfile fp = new FetchProfile();
            fp.add(FetchProfile.Item.ENVELOPE);
            fp.add(UIDFolder.FetchProfileItem.UID);
            fp.add("Message-ID");
            fp.add("In-Reply-To");
            f.fetch(batch, fp);

            List<Message> list = new ArrayList<>(Arrays.asList(batch));
            list.removeIf(m -> uid(uf, m) <= (backfill ? 0 : state.getLastUid())); // "n:*" returns the last message even when n is past it
            list.sort(Comparator.comparingLong(m -> uid(uf, m)));
            int max = props.getMaxPerFolder();
            if (list.size() > max) list = backfill ? list.subList(list.size() - max, list.size()) : list.subList(0, max);

            long highest = backfill ? 0 : state.getLastUid();
            for (Message m : list) {
                long u = uid(uf, m);
                store(userId, name, direction, validity, u, m, companies);
                highest = Math.max(highest, u);
            }
            if (backfill) {
                // Start the next read at the folder's current end, so mail older than the window is never pulled in.
                long next = uidNext(f, uf);
                highest = Math.max(highest, next > 0 ? next - 1 : highest);
            }
            state.setUidValidity(validity);
            state.setLastUid(highest);
            states.save(state);
        } finally {
            if (f.isOpen()) f.close(false);
        }
    }

    private void store(Long userId, String folder, String direction, long validity, long uid, Message m, List<String> companies)
        throws MessagingException {
        String messageId = header(m, "Message-ID");
        String key = sha256(messageId != null ? "mid:" + messageId.toLowerCase(Locale.ROOT) : "uid:" + folder + ":" + validity + ":" + uid);
        if (messages.existsByUserIdAndDedupKey(userId, key)) return;

        InternetAddress from = first(m.getFrom());
        List<String> recipients = new ArrayList<>();
        addAll(recipients, m.getRecipients(Message.RecipientType.TO));
        addAll(recipients, m.getRecipients(Message.RecipientType.CC));
        String subject = m.getSubject();

        List<String> counterparties = InboxMessage.IN.equals(direction)
            ? (from == null ? List.of() : List.of(from.getAddress()))
            : recipients;
        boolean job = JobMailRules.isJobMail(counterparties, from == null ? null : from.getPersonal(), subject, companies);

        InboxMessage row = new InboxMessage();
        row.setUserId(userId);
        row.setFolder(folder);
        row.setDirection(direction);
        row.setUid(uid);
        row.setDedupKey(key);
        row.setMessageId(cap(messageId, 500));
        row.setInReplyTo(cap(header(m, "In-Reply-To"), 500));
        row.setFromAddress(from == null ? null : cap(from.getAddress(), 254));
        row.setFromName(from == null ? null : cap(from.getPersonal(), 200));
        row.setToAddresses(cap(String.join(", ", recipients), 2000));
        row.setSubject(cap(subject, 500));
        Date when = InboxMessage.IN.equals(direction) ? firstNonNull(m.getReceivedDate(), m.getSentDate()) : firstNonNull(m.getSentDate(), m.getReceivedDate());
        row.setSentAt(when == null ? null : when.toInstant());
        row.setJobMail(job);
        if (job) {
            String text = MailText.of(m);
            row.setBodyText(text.isBlank() ? null : text);
        }
        messages.save(row);
    }

    private static long uid(UIDFolder f, Message m) {
        try {
            return f.getUID(m);
        } catch (MessagingException e) {
            return -1;
        }
    }

    private static long uidNext(Folder f, UIDFolder uf) {
        try {
            if (uf instanceof IMAPFolder imap) {
                long n = imap.getUIDNext();
                if (n > 0) return n;
            }
            int count = f.getMessageCount();
            return count > 0 ? uf.getUID(f.getMessage(count)) + 1 : -1;
        } catch (MessagingException e) {
            return -1;
        }
    }

    private static String header(Message m, String name) {
        try {
            String[] v = m.getHeader(name);
            return v == null || v.length == 0 || v[0] == null ? null : v[0].trim();
        } catch (MessagingException e) {
            return null;
        }
    }

    private static InternetAddress first(Address[] a) {
        if (a == null) return null;
        for (Address x : a) if (x instanceof InternetAddress ia) return ia;
        return null;
    }

    private static void addAll(List<String> out, Address[] a) {
        if (a == null) return;
        for (Address x : a) if (x instanceof InternetAddress ia && ia.getAddress() != null && out.size() < 50) out.add(ia.getAddress());
    }

    private static Date firstNonNull(Date a, Date b) {
        return a != null ? a : b;
    }

    private static String cap(String s, int n) {
        if (s == null) return null;
        String t = s.trim();
        return t.length() > n ? t.substring(0, n) : t;
    }

    static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
