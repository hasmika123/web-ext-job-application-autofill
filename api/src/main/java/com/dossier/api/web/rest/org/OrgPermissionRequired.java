package com.dossier.api.web.rest.org;

import com.dossier.api.domain.enumeration.OrgPermission;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Declares what a {@code /api/orgs/{orgId}/...} handler needs, and makes the check impossible to forget: the
 * {@code OrgPermissionInterceptor} runs {@code OrgAccessService} against the {@code {orgId}} path variable BEFORE
 * the handler body, answers 404 when it fails, and hands the resolved {@code OrgMembership} to the handler as the
 * request attribute {@link #MEMBERSHIP_ATTRIBUTE} (declare {@code @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE)}).
 *
 * <p>A handler under {@code /api/orgs/**} with neither this annotation nor {@link OrgUnscoped} is refused with a 404
 * at runtime (fail closed) and fails {@code OrgResourceGuardTest} at build time.
 *
 * <p>With no values the caller only has to be an ACTIVE member of any role; with several values they must hold ALL.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface OrgPermissionRequired {
    /** Request attribute under which the resolved {@code OrgMembership} is stored. */
    String MEMBERSHIP_ATTRIBUTE = "com.dossier.api.org.membership";

    OrgPermission[] value() default {};
}
