package com.dossier.api.service.ent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * The pure rules behind the platform admin's per-organization enterprise switch (X1.11). The switch edits the allow and deny
 * lists of the {@code flag.enterprise} FLAG value {@code {on, pct, allow, deny}} ({@link EnterpriseFeatureFlag}); nothing here
 * touches settings, so the rules are unit-tested alone.
 *
 * <ul>
 *   <li><b>On</b> puts the organization in {@code allow} and takes it out of {@code deny}. A non-empty allow list makes the flag a
 *       pilot (only the listed organizations), so when the master {@code on} was false it becomes true with just this organization
 *       in the list, and nobody else is switched on by it. When the flag is already on for everyone (on, empty allow list, no
 *       percentage) and the organization is not denied there is nothing to do: adding it would NARROW the flag to a pilot.</li>
 *   <li><b>Off</b> takes the organization out of {@code allow}. If that leaves the allow list empty while the flag is on, the flag
 *       would fall through to "everyone", so the organization goes into {@code deny} instead (deny always wins).</li>
 * </ul>
 */
public final class EnterpriseAllowList {

    private EnterpriseAllowList() {}

    /** The flag as stored; an absent or malformed value reads as the safe default (off, empty lists). */
    public record State(boolean on, int pct, Set<Long> allow, Set<Long> deny) {
        public static State parse(JsonNode n) {
            EnterpriseFeatureFlag.Rule rule = EnterpriseFeatureFlag.Rule.parse(n);
            return new State(rule.on(), rule.pct(), new LinkedHashSet<>(rule.allow()), new LinkedHashSet<>(rule.deny()));
        }

        public boolean everyone() {
            return on && allow.isEmpty() && (pct == 0 || pct >= 100);
        }

        public ObjectNode toJson() {
            ObjectNode o = JsonNodeFactory.instance.objectNode();
            o.put("on", on);
            o.put("pct", pct);
            o.set("allow", ids(allow));
            o.set("deny", ids(deny));
            return o;
        }

        private static ArrayNode ids(Set<Long> ids) {
            ArrayNode a = JsonNodeFactory.instance.arrayNode();
            ids.forEach(a::add);
            return a;
        }
    }

    /** The state after switching {@code orgId} on; the same state (equal lists) when nothing needs to change. */
    public static State turnOn(State s, long orgId) {
        Set<Long> allow = new LinkedHashSet<>(s.allow());
        Set<Long> deny = new LinkedHashSet<>(s.deny());
        boolean denied = deny.remove(orgId);
        if (s.everyone() && !denied) return s;
        if (s.on() && s.allow().isEmpty() && denied && (s.pct() == 0 || s.pct() >= 100)) {
            return new State(true, s.pct(), allow, deny); // removing the deny is enough: it is on for everyone again
        }
        allow.add(orgId);
        return new State(true, s.pct(), allow, deny);
    }

    /** The state after switching {@code orgId} off. */
    public static State turnOff(State s, long orgId) {
        Set<Long> allow = new LinkedHashSet<>(s.allow());
        Set<Long> deny = new LinkedHashSet<>(s.deny());
        allow.remove(orgId);
        if (s.on() && allow.isEmpty()) deny.add(orgId); // an empty allow list means everyone: keep this one out explicitly
        return new State(s.on(), s.pct(), allow, deny);
    }
}
