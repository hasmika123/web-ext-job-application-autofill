package com.dossier.api.service.entitlement;

import java.time.Instant;
import java.util.List;

/**
 * The port through which the personal add-ons a subscriber holds reach the resolver (story K5.2 implements it over {@code subscription_addon}). When no
 * bean implements it the resolver sees no add-ons, which is today's behaviour.
 */
public interface PersonalAddonSource {
    /** The add-on lines live at {@code now} ({@code startsAt <= now < coalesce(endsAt, infinity)}) for a personal account. */
    List<Addon> liveAddons(long userId, Instant now);

    /** One add-on: a service key, how many units, and its dates ({@code endsAt} null while it runs). */
    record Addon(String featureKey, int quantity, Instant startsAt, Instant endsAt) {}
}
