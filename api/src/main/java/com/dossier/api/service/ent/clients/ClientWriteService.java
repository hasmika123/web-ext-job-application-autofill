package com.dossier.api.service.ent.clients;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ClientNote;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.ClientNoteRepository;
import com.dossier.api.service.dto.ent.ClientDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The write side of the Clients page: add a client, edit one (autosave, one field family at a time), add a contact, mark a contact as
 * having left (or back), and add a relationship note. Order of refusals, in every method: (1) the permission and the organization's
 * state (404), (2) the row inside this organization (404), (3) the version ({@code If-Match}: 428, 412), (4) validation (422),
 * (5) state (409). Free text is checked by the sensitive-data scanner; nothing here stores an identity document, bank, tax or birth
 * value, a phone number or a private mailbox. Every change writes one audit row ({@code CLIENT_*}, target type {@code CLIENT}); an
 * audit row never carries a note's text.
 */
@Service
public class ClientWriteService {

    public static final String CLIENT_CREATE = "CLIENT_CREATE";
    public static final String CLIENT_UPDATE = "CLIENT_UPDATE";
    public static final String CLIENT_STATUS = "CLIENT_STATUS";
    public static final String CLIENT_CONTACT_ADD = "CLIENT_CONTACT_ADD";
    public static final String CLIENT_CONTACT_UPDATE = "CLIENT_CONTACT_UPDATE";
    public static final String CLIENT_NOTE_ADD = "CLIENT_NOTE_ADD";
    public static final String TARGET = "CLIENT";

    public static final String CODE_PRECONDITION_REQUIRED = "PRECONDITION_REQUIRED";
    public static final String CODE_PRECONDITION_FAILED = "PRECONDITION_FAILED";
    public static final String CODE_DUPLICATE_CLIENT = "DUPLICATE_CLIENT";
    public static final String CODE_DUPLICATE_CONTACT = "DUPLICATE_CONTACT";
    public static final String CODE_WORK_EMAIL_REQUIRED = "WORK_EMAIL_REQUIRED";

    static final int NAME_MAX = 200;
    static final int INDUSTRY_MAX = 80;
    static final int WEBSITE_MAX = 300;
    static final int LOCATION_MAX = 120;
    static final int ABOUT_MAX = 1000;
    static final int CONTACT_NAME_MAX = 120;
    static final int TITLE_MAX = 80;
    static final int CONTACT_NOTES_MAX = 500;
    static final int EMAIL_MAX = 254;
    static final int NOTE_MAX = 1000;

    /** The only keys a PATCH accepts: anything else (orgId, createdAt...) is refused, never bound. */
    public static final Set<String> EDITABLE = Set.of("name", "industry", "website", "location", "sizeBand", "clientSince", "about", "status", "ownerMemberId");
    static final Set<String> CREATE_STATUSES = Set.of("ACTIVE", "PROSPECT");
    public static final List<String> CONTACT_ROLES = List.of("HIRING_MANAGER", "RECRUITER", "VMS_ADMIN", "AP", "OTHER");
    static final Set<String> CONTACT_STATUSES = Set.of("ACTIVE", "LEFT");
    private static final Pattern EMAIL = Pattern.compile("^[A-Za-z0-9._%+'-]+@([A-Za-z0-9-]+\\.)+[A-Za-z]{2,}$");
    private static final Pattern SITE = Pattern.compile("^https?://[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+(:\\d{1,5})?(/[^\\s<>\"]*)?$");

    private final ClientAccountRepository clients;
    private final ClientContactRepository contacts;
    private final ClientNoteRepository notes;
    private final OrgAuditService audit;
    private final ClientAccess access;
    private final ClientsSettings settings;
    private final ClientBoardService board;

    @PersistenceContext
    private EntityManager em;

    public ClientWriteService(
        ClientAccountRepository clients,
        ClientContactRepository contacts,
        ClientNoteRepository notes,
        OrgAuditService audit,
        ClientAccess access,
        ClientsSettings settings,
        ClientBoardService board
    ) {
        this.clients = clients;
        this.contacts = contacts;
        this.notes = notes;
        this.audit = audit;
        this.access = access;
        this.settings = settings;
        this.board = board;
    }

    // ---- create -------------------------------------------------------------------------------------------------------------------

    @Transactional
    public ClientDTO.Detail create(OrgMembership me, ClientDTO.CreateRequest req) {
        access.requireManage(me);
        Long orgId = me.orgId();
        if (req == null) throw OrgException.invalid("body", "send a client");
        String name = text("name", req.name(), NAME_MAX, true);
        if (name.length() < 2) throw OrgException.invalid("name", "at least 2 characters");
        if (clients.findByOrgIdAndNameIgnoreCase(orgId, name).isPresent()) throw OrgException.coded(409, CODE_DUPLICATE_CLIENT, "You already have a client called " + name, Map.of("field", "name"));
        String status = req.status() == null || req.status().isBlank() ? "ACTIVE" : req.status().trim().toUpperCase(Locale.ROOT);
        if (!CREATE_STATUSES.contains(status)) throw OrgException.invalid("status", "one of " + CREATE_STATUSES);
        Long owner = req.ownerMemberId() == null ? me.memberId() : req.ownerMemberId();
        requireActiveMember(orgId, owner);

        ClientAccount c = new ClientAccount();
        c.setOrgId(orgId);
        c.setKind("END_CLIENT");
        c.setName(name);
        c.setIndustry(text("industry", req.industry(), INDUSTRY_MAX, false));
        c.setWebsite(website(req.website()));
        c.setLocation(text("location", req.location(), LOCATION_MAX, false));
        c.setSizeBand(oneOf("sizeBand", req.sizeBand(), ClientBoardService.SIZE_BANDS));
        c.setClientSince(since(req.clientSince()));
        c.setAbout(text("about", req.about(), ABOUT_MAX, false));
        c.setStatus(status);
        c.setOwnerMemberId(owner);
        Instant now = Instant.now();
        c.setCreatedAt(now);
        c.setUpdatedAt(now);
        c = clients.save(c);
        audit.record(me, CLIENT_CREATE, TARGET, null, String.valueOf(c.getId()), "name: " + name);
        em.flush();
        em.clear();
        return board.detailOf(me, clients.findByOrgIdAndId(orgId, c.getId()).orElseThrow());
    }

    // ---- edit ---------------------------------------------------------------------------------------------------------------------

    @Transactional
    public ClientDTO.Detail patch(OrgMembership me, Long clientId, String ifMatch, Map<String, Object> body) {
        access.requireManage(me);
        Long orgId = me.orgId();
        final ClientAccount c = live(orgId, clientId);
        checkVersion(ifMatch, ClientBoardService.versionOf(c));
        if (body == null || body.isEmpty()) throw OrgException.invalid("body", "name at least one field to change");
        for (String key : body.keySet()) if (!EDITABLE.contains(key)) throw OrgException.invalid(key, "cannot be changed here");

        List<String> changed = new ArrayList<>();
        String fromStatus = c.getStatus();
        boolean statusChanged = false;
        if (body.containsKey("name")) {
            String v = text("name", body.get("name"), NAME_MAX, true);
            if (v.length() < 2) throw OrgException.invalid("name", "at least 2 characters");
            if (!v.equals(c.getName())) {
                clients.findByOrgIdAndNameIgnoreCase(orgId, v).filter(o -> !o.getId().equals(c.getId())).ifPresent(o -> {
                    throw OrgException.coded(409, CODE_DUPLICATE_CLIENT, "You already have a client called " + v, Map.of("field", "name"));
                });
                c.setName(v);
                changed.add("name");
            }
        }
        if (body.containsKey("industry")) {
            String v = text("industry", body.get("industry"), INDUSTRY_MAX, false);
            if (!Objects.equals(v, c.getIndustry())) { c.setIndustry(v); changed.add("industry"); }
        }
        if (body.containsKey("website")) {
            String v = website(body.get("website") == null ? null : String.valueOf(body.get("website")));
            if (!Objects.equals(v, c.getWebsite())) { c.setWebsite(v); changed.add("website"); }
        }
        if (body.containsKey("location")) {
            String v = text("location", body.get("location"), LOCATION_MAX, false);
            if (!Objects.equals(v, c.getLocation())) { c.setLocation(v); changed.add("location"); }
        }
        if (body.containsKey("sizeBand")) {
            String v = oneOf("sizeBand", body.get("sizeBand"), ClientBoardService.SIZE_BANDS);
            if (!Objects.equals(v, c.getSizeBand())) { c.setSizeBand(v); changed.add("size"); }
        }
        if (body.containsKey("clientSince")) {
            Object raw = body.get("clientSince");
            LocalDate v;
            try {
                v = raw == null || String.valueOf(raw).isBlank() ? null : LocalDate.parse(String.valueOf(raw).trim());
            } catch (DateTimeParseException e) {
                throw OrgException.invalid("clientSince", "a date such as 2022-01-15");
            }
            v = since(v);
            if (!Objects.equals(v, c.getClientSince())) { c.setClientSince(v); changed.add("client since"); }
        }
        if (body.containsKey("about")) {
            String v = text("about", body.get("about"), ABOUT_MAX, false);
            if (!Objects.equals(v, c.getAbout())) { c.setAbout(v); changed.add("about"); }
        }
        if (body.containsKey("ownerMemberId")) {
            Long v = whole("ownerMemberId", body.get("ownerMemberId"));
            if (v != null) requireActiveMember(orgId, v);
            if (!Objects.equals(v, c.getOwnerMemberId())) { c.setOwnerMemberId(v); changed.add("account manager"); }
        }
        if (body.containsKey("status")) {
            String v = oneOf("status", body.get("status"), ClientBoardService.STATUSES);
            if (v == null) throw OrgException.invalid("status", "choose a status");
            if (!v.equals(c.getStatus())) { c.setStatus(v); statusChanged = true; }
        }
        if (changed.isEmpty() && !statusChanged) return board.detailOf(me, c);

        c.setUpdatedAt(Instant.now());
        clients.save(c);
        if (statusChanged) audit.record(me, CLIENT_STATUS, TARGET, null, String.valueOf(c.getId()), fromStatus.toLowerCase(Locale.ROOT) + " to " + c.getStatus().toLowerCase(Locale.ROOT));
        if (!changed.isEmpty()) audit.record(me, CLIENT_UPDATE, TARGET, null, String.valueOf(c.getId()), String.join(", ", changed));
        em.flush();
        em.clear();
        return board.detailOf(me, clients.findByOrgIdAndId(orgId, c.getId()).orElseThrow());
    }

    // ---- contacts -----------------------------------------------------------------------------------------------------------------

    @Transactional
    public ClientDTO.Detail addContact(OrgMembership me, Long clientId, ClientDTO.ContactRequest req) {
        access.requireManage(me);
        Long orgId = me.orgId();
        ClientAccount c = live(orgId, clientId);
        if (req == null) throw OrgException.invalid("body", "send a contact");
        String name = text("name", req.name(), CONTACT_NAME_MAX, true);
        if (name.length() < 2) throw OrgException.invalid("name", "at least 2 characters");
        String email = workEmail(req.email());
        if (email != null) assertNoDuplicate(orgId, clientId, email, null);
        ClientContact x = new ClientContact();
        x.setOrgId(orgId);
        x.setClientId(c.getId());
        x.setName(name);
        x.setTitle(text("title", req.title(), TITLE_MAX, false));
        x.setWorkEmail(email);
        x.setPhone(com.dossier.api.service.ent.consultants.ConsultantContact.phone(req.phone()));
        x.setNotes(text("notes", req.notes(), CONTACT_NOTES_MAX, false));
        x.setRoleLabel(oneOf("role", req.role(), CONTACT_ROLES));
        x.setStatus("ACTIVE");
        x.setCreatedAt(Instant.now());
        contacts.save(x);
        touch(c);
        audit.record(me, CLIENT_CONTACT_ADD, TARGET, null, String.valueOf(c.getId()), "contact: " + name);
        em.flush();
        em.clear();
        return board.detailOf(me, clients.findByOrgIdAndId(orgId, c.getId()).orElseThrow());
    }

    @Transactional
    public ClientDTO.Detail patchContact(OrgMembership me, Long clientId, Long contactId, Map<String, Object> body) {
        access.requireManage(me);
        Long orgId = me.orgId();
        ClientAccount c = live(orgId, clientId);
        ClientContact x = contacts.findByOrgIdAndId(orgId, contactId).filter(k -> k.getClientId().equals(c.getId())).orElseThrow(OrgNotFoundException::new);
        if (body == null || body.isEmpty()) throw OrgException.invalid("body", "name at least one field to change");
        for (String key : body.keySet()) if (!Set.of("name", "title", "email", "phone", "notes", "role", "status").contains(key)) throw OrgException.invalid(key, "cannot be changed here");
        List<String> changed = new ArrayList<>();
        if (body.containsKey("name")) {
            String v = text("name", body.get("name"), CONTACT_NAME_MAX, true);
            if (v.length() < 2) throw OrgException.invalid("name", "at least 2 characters");
            if (!v.equals(x.getName())) { x.setName(v); changed.add("name"); }
        }
        if (body.containsKey("title")) {
            String v = text("title", body.get("title"), TITLE_MAX, false);
            if (!Objects.equals(v, x.getTitle())) { x.setTitle(v); changed.add("title"); }
        }
        if (body.containsKey("email")) {
            String v = workEmail(body.get("email") == null ? null : String.valueOf(body.get("email")));
            if (!Objects.equals(v, x.getWorkEmail())) {
                if (v != null) assertNoDuplicate(orgId, clientId, v, x.getId());
                x.setWorkEmail(v);
                changed.add("e-mail");
            }
        }
        if (body.containsKey("phone")) {
            Object raw = body.get("phone");
            String v = com.dossier.api.service.ent.consultants.ConsultantContact.phone(raw);
            if (!Objects.equals(v, x.getPhone())) { x.setPhone(v); changed.add("phone"); }
        }
        if (body.containsKey("notes")) {
            String v = text("notes", body.get("notes"), CONTACT_NOTES_MAX, false);
            if (!Objects.equals(v, x.getNotes())) { x.setNotes(v); changed.add("notes"); }
        }
        if (body.containsKey("role")) {
            String v = oneOf("role", body.get("role"), CONTACT_ROLES);
            if (!Objects.equals(v, x.getRoleLabel())) { x.setRoleLabel(v); changed.add("role"); }
        }
        if (body.containsKey("status")) {
            String v = oneOf("status", body.get("status"), List.copyOf(CONTACT_STATUSES));
            if (v == null) throw OrgException.invalid("status", "ACTIVE or LEFT");
            if (!v.equals(x.getStatus())) { x.setStatus(v); changed.add("LEFT".equals(v) ? "marked as left" : "back at the client"); }
        }
        if (changed.isEmpty()) return board.detailOf(me, c);
        contacts.save(x);
        touch(c);
        audit.record(me, CLIENT_CONTACT_UPDATE, TARGET, null, String.valueOf(c.getId()), String.join(", ", changed));
        em.flush();
        em.clear();
        return board.detailOf(me, clients.findByOrgIdAndId(orgId, c.getId()).orElseThrow());
    }

    // ---- notes --------------------------------------------------------------------------------------------------------------------

    @Transactional
    public ClientDTO.Detail addNote(OrgMembership me, Long clientId, ClientDTO.NoteRequest req) {
        access.requireManage(me);
        Long orgId = me.orgId();
        ClientAccount c = live(orgId, clientId);
        if (req == null) throw OrgException.invalid("body", "write a note");
        String body = text("body", req.body(), NOTE_MAX, true);
        ClientNote n = new ClientNote();
        n.setOrgId(orgId);
        n.setClientId(c.getId());
        n.setAuthorMemberId(me.memberId());
        n.setBody(body);
        n.setCreatedAt(Instant.now());
        notes.save(n);
        touch(c);
        audit.record(me, CLIENT_NOTE_ADD, TARGET, null, String.valueOf(c.getId()), "note added");
        em.flush();
        em.clear();
        return board.detailOf(me, clients.findByOrgIdAndId(orgId, c.getId()).orElseThrow());
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------------

    private ClientAccount live(Long orgId, Long clientId) {
        return clients.findByOrgIdAndId(orgId, clientId).filter(x -> x.getArchivedAt() == null).orElseThrow(OrgNotFoundException::new);
    }

    private void touch(ClientAccount c) {
        c.setUpdatedAt(Instant.now());
        clients.save(c);
    }

    private void requireActiveMember(Long orgId, Long memberId) {
        Long n = (Long) em.createQuery("select count(m) from OrgMember m where m.orgId = :o and m.id = :id and m.status = com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE").setParameter("o", orgId).setParameter("id", memberId).getSingleResult();
        if (n == 0) throw OrgException.invalid("ownerMemberId", "choose an active member of this organization");
    }

    private void assertNoDuplicate(Long orgId, Long clientId, String email, Long exceptId) {
        for (ClientContact k : contacts.findByOrgIdAndClientId(orgId, clientId)) {
            if (k.getWorkEmail() != null && k.getWorkEmail().equalsIgnoreCase(email) && !k.getId().equals(exceptId) && "ACTIVE".equals(k.getStatus())) {
                throw OrgException.coded(409, CODE_DUPLICATE_CONTACT, "That e-mail already belongs to a contact of this client", Map.of("field", "email"));
            }
        }
    }

    /** A work e-mail or null: lower-cased, well formed, and not on a consumer mail domain (an organization setting). */
    private String workEmail(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String e = raw.strip().toLowerCase(Locale.ROOT);
        if (e.length() > EMAIL_MAX || !EMAIL.matcher(e).matches()) throw OrgException.invalid("email", "a work e-mail such as name@company.com");
        String domain = e.substring(e.indexOf('@') + 1);
        if (settings.consumerDomains().contains(domain)) throw OrgException.coded(422, CODE_WORK_EMAIL_REQUIRED, "Use a work e-mail: we keep business contacts, not private mailboxes.", Map.of("field", "email"));
        return e;
    }

    /** A site address or null: "acme.com" becomes "https://acme.com"; anything but http(s) with a real host is refused. */
    private static String website(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String w = raw.strip();
        if (w.length() > WEBSITE_MAX) throw OrgException.invalid("website", "at most " + WEBSITE_MAX + " characters");
        if (!w.toLowerCase(Locale.ROOT).startsWith("http://") && !w.toLowerCase(Locale.ROOT).startsWith("https://")) {
            if (w.contains("://") || w.contains(":")) throw OrgException.invalid("website", "a web address such as acme.com");
            w = "https://" + w;
        }
        if (!SITE.matcher(w).matches()) throw OrgException.invalid("website", "a web address such as acme.com");
        return w;
    }

    private static LocalDate since(LocalDate d) {
        if (d == null) return null;
        if (d.isAfter(LocalDate.now(ZoneOffset.UTC).plusDays(1)) || d.getYear() < 1900) throw OrgException.invalid("clientSince", "a date in the past");
        return d;
    }

    private static Long whole(String field, Object raw) {
        if (raw == null) return null;
        if (raw instanceof Number n && n.doubleValue() == Math.rint(n.doubleValue())) return n.longValue();
        throw OrgException.invalid(field, "must be a whole number");
    }

    private static String text(String field, Object raw, int max, boolean required) {
        if (raw == null) {
            if (required) throw OrgException.invalid(field, "is required");
            return null;
        }
        if (!(raw instanceof String s)) throw OrgException.invalid(field, "must be text");
        String t = s.strip();
        if (t.isEmpty()) {
            if (required) throw OrgException.invalid(field, "is required");
            return null;
        }
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        boolean multiline = field.equals("about") || field.equals("body") || field.equals("notes");
        if (t.chars().anyMatch(ch -> Character.isISOControl(ch) && !(multiline && (ch == '\n' || ch == '\r' || ch == '\t')))) throw OrgException.invalid(field, "contains characters that are not allowed");
        if (t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid(field, "contains characters that are not allowed");
        SensitiveContent.check(field, field, t);
        return t;
    }

    private static String oneOf(String field, Object raw, List<String> allowed) {
        if (raw == null) return null;
        if (!(raw instanceof String s)) throw OrgException.invalid(field, "must be text");
        if (s.isBlank()) return null;
        String u = s.trim().toUpperCase(Locale.ROOT);
        if (field.equals("sizeBand")) u = s.trim();
        if (!allowed.contains(u)) throw OrgException.invalid(field, "one of " + allowed);
        return u;
    }

    private static void checkVersion(String header, String current) {
        if (header == null || header.isBlank()) {
            throw OrgException.coded(428, CODE_PRECONDITION_REQUIRED, "Send the version you loaded in an If-Match header", Map.of());
        }
        if (!normalise(header).equals(normalise(current))) {
            throw OrgException.coded(412, CODE_PRECONDITION_FAILED, "This client changed since you loaded it", Map.of("currentVersion", current));
        }
    }

    private static String normalise(String etag) {
        String t = etag.strip();
        if (t.startsWith("W/")) t = t.substring(2);
        if (t.length() >= 2 && t.startsWith("\"") && t.endsWith("\"")) t = t.substring(1, t.length() - 1);
        return t;
    }
}
