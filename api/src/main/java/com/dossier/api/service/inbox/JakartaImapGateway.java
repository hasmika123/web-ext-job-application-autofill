package com.dossier.api.service.inbox;

import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.Folder;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.Store;
import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import org.eclipse.angus.mail.imap.IMAPFolder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * {@link ImapGateway} over Jakarta Mail (Angus), which ships with {@code spring-boot-starter-mail}.
 *
 * <p>Gmail's refusals come back as an {@code AuthenticationFailedException} whose text says which
 * one it is — "Invalid credentials", "Application-specific password required", "Please log in via
 * your web browser", "not enabled for IMAP use" — and each needs a different fix, so they're told
 * apart here rather than all read as "wrong password" (Sales-App's one message for all of them was
 * the thing its users got stuck on).
 *
 * <p>The Sent folder is found by its RFC 6154 {@code \Sent} flag, which Gmail sets whatever the
 * account's language ("[Gmail]/Gesendet"); the English names are a fallback for servers that don't
 * flag it. Everything is opened read-only; the session is always closed.
 */
@Component
public class JakartaImapGateway implements ImapGateway {

    private static final Logger LOG = LoggerFactory.getLogger(JakartaImapGateway.class);
    private static final List<String> SENT_NAMES = List.of("[Gmail]/Sent Mail", "[Google Mail]/Sent Mail", "Sent", "Sent Items");

    private final InboxProperties props;

    public JakartaImapGateway(InboxProperties props) {
        this.props = props;
    }

    @Override
    public Probe probe(String address, String password) {
        Store store = null;
        try {
            store = connect(address, password);
            Folder inbox = store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);
            inbox.close(false);
            return new Probe(Outcome.OK, sentFolder(store));
        } catch (AuthenticationFailedException e) {
            return new Probe(classifyAuth(e.getMessage()), null);
        } catch (MessagingException e) {
            return new Probe(classifyOther(e), null);
        } catch (RuntimeException e) {
            LOG.warn("IMAP probe failed: {}", e.getClass().getSimpleName());
            return new Probe(Outcome.FAILED, null);
        } finally {
            closeQuietly(store);
        }
    }

    /** A signed-in store; the caller closes it. */
    Store connect(String address, String password) throws MessagingException {
        String protocol = props.isImapSsl() ? "imaps" : "imap";
        Properties p = new Properties();
        String t = String.valueOf(props.getTimeoutMs());
        p.put("mail.store.protocol", protocol);
        p.put("mail." + protocol + ".connectiontimeout", t);
        p.put("mail." + protocol + ".timeout", t);
        p.put("mail." + protocol + ".writetimeout", t);
        if (props.isImapSsl()) p.put("mail.imaps.ssl.checkserveridentity", "true");
        Store store = Session.getInstance(p).getStore(protocol);
        store.connect(props.getImapHost(), props.getImapPort(), address, password);
        return store;
    }

    static String sentFolder(Store store) throws MessagingException {
        Folder[] all = store.getDefaultFolder().list("*");
        for (Folder f : all) {
            if (f instanceof IMAPFolder imap) {
                for (String attr : imap.getAttributes()) if ("\\Sent".equalsIgnoreCase(attr)) return f.getFullName();
            }
        }
        for (String name : SENT_NAMES) {
            for (Folder f : all) if (f.getFullName().equalsIgnoreCase(name)) return f.getFullName();
        }
        return null;
    }

    static Outcome classifyAuth(String message) {
        String m = message == null ? "" : message.toLowerCase(Locale.ROOT);
        if (m.contains("application-specific password")) return Outcome.APP_PASSWORD_REQUIRED;
        if (m.contains("web browser") || m.contains("web login")) return Outcome.WEB_LOGIN_REQUIRED;
        if (m.contains("not enabled for imap")) return Outcome.IMAP_DISABLED;
        return Outcome.BAD_CREDENTIALS;
    }

    static Outcome classifyOther(MessagingException e) {
        String m = e.getMessage() == null ? "" : e.getMessage().toLowerCase(Locale.ROOT);
        if (m.contains("not enabled for imap")) return Outcome.IMAP_DISABLED;
        for (Throwable c = e; c != null; c = c.getCause()) {
            if (c instanceof UnknownHostException || c instanceof ConnectException || c instanceof SocketTimeoutException) return Outcome.UNREACHABLE;
            if (c instanceof IOException && c != e) return Outcome.UNREACHABLE;
        }
        LOG.warn("IMAP probe failed: {}", e.getClass().getSimpleName());
        return Outcome.FAILED;
    }

    static void closeQuietly(Store store) {
        if (store == null) return;
        try {
            store.close();
        } catch (MessagingException | RuntimeException e) {
            // already gone
        }
    }
}
