package com.dossier.api.web.rest.org;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks the few {@code /api/orgs} handlers that have no {@code {orgId}} in the path because they act on the
 * caller's own person, not on an org: creating an org ({@code POST /api/orgs}) and listing one's own
 * memberships ({@code GET /api/orgs/mine}). They take no org id, so they cannot be tenant-crossing; every
 * repository call they make is scoped by the caller's own user id.
 *
 * <p>The marker exists so that {@code OrgResourceGuardTest} can tell "deliberately unscoped" from "forgot the
 * check". Anything with an {@code {orgId}} must use {@link OrgPermissionRequired} instead.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface OrgUnscoped {
}
