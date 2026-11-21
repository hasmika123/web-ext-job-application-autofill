package com.dossier.api.service.ent.pipeline;

import java.util.Map;
import java.util.Optional;

/**
 * The first canonical {@code opportunity_match} transition rows. Keeping these rows as data makes the lifecycle
 * service the only place that can decide whether a status move is legal; later pipeline objects can join this registry.
 */
final class OpportunityMatchTransitionRegistry {

    enum ActorKind {
        MARKETER,
        CONSULTANT
    }

    record Transition(String from, OpportunityMatchLifecycleService.Target to, ActorKind actorKind, String permissionKey) {}

    private record Key(String from, OpportunityMatchLifecycleService.Target to) {}

    private static final Map<Key, Transition> TRANSITIONS = Map.of(
        key("SUGGESTED", OpportunityMatchLifecycleService.Target.ASSIGNED),
        new Transition("SUGGESTED", OpportunityMatchLifecycleService.Target.ASSIGNED, ActorKind.MARKETER, "opportunities.manage"),
        key("SUGGESTED", OpportunityMatchLifecycleService.Target.DISMISSED),
        new Transition("SUGGESTED", OpportunityMatchLifecycleService.Target.DISMISSED, ActorKind.MARKETER, "matches.run"),
        key("ASSIGNED", OpportunityMatchLifecycleService.Target.ACCEPTED),
        new Transition("ASSIGNED", OpportunityMatchLifecycleService.Target.ACCEPTED, ActorKind.CONSULTANT, "opportunities.respond"),
        key("ASSIGNED", OpportunityMatchLifecycleService.Target.DECLINED),
        new Transition("ASSIGNED", OpportunityMatchLifecycleService.Target.DECLINED, ActorKind.CONSULTANT, "opportunities.respond"),
        key("DECLINED", OpportunityMatchLifecycleService.Target.ACCEPTED),
        new Transition("DECLINED", OpportunityMatchLifecycleService.Target.ACCEPTED, ActorKind.CONSULTANT, "opportunities.respond")
    );

    private OpportunityMatchTransitionRegistry() {}

    static Optional<Transition> find(String from, OpportunityMatchLifecycleService.Target to) {
        return Optional.ofNullable(TRANSITIONS.get(key(from, to)));
    }

    /** The authorization row for a requested action, before the current-state guard is evaluated. */
    static Transition authorizationFor(OpportunityMatchLifecycleService.Target to) {
        return TRANSITIONS.values().stream().filter(transition -> transition.to() == to).findFirst().orElseThrow();
    }

    private static Key key(String from, OpportunityMatchLifecycleService.Target to) {
        return new Key(from, to);
    }
}
