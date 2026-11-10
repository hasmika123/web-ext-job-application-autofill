package com.dossier.api.service.retirement;

import jakarta.mail.internet.MimeMessage;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSenderImpl;

/**
 * The mail sender of the retirement tests: it builds real messages (so the template really renders into them) and keeps them instead of talking to an SMTP server. One bean
 * shared by every retirement test (see {@code RecordingStripeGateway.Config}); a test calls {@link #reset()} first and reads {@link #sent}.
 */
public class RecordingMailSender extends JavaMailSenderImpl {

    public final List<MimeMessage> sent = new CopyOnWriteArrayList<>();

    public void reset() {
        sent.clear();
    }

    @Override
    public void send(MimeMessage mimeMessage) throws MailException {
        sent.add(mimeMessage);
    }

    @Override
    public void send(MimeMessage... mimeMessages) throws MailException {
        for (MimeMessage m : mimeMessages) sent.add(m);
    }

    /** The subjects of everything sent, oldest first. */
    public List<String> subjects() {
        return sent
            .stream()
            .map(m -> {
                try {
                    return m.getSubject();
                } catch (jakarta.mail.MessagingException e) {
                    throw new IllegalStateException(e);
                }
            })
            .toList();
    }
}
