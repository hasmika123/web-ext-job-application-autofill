package com.dossier.api.config;

/**
 * Application constants.
 */
public final class Constants {

    // Regex for acceptable logins
    public static final String LOGIN_REGEX = "^(?>[a-zA-Z0-9!$&*+=?^_`{|}~.-]+@[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)*)|(?>[_.@A-Za-z0-9-]+)$";

    /**
     * Decision O4 (docs/enterprise-v2/19): the login of an enterprise account starts with this prefix ({@code ent#<orgId>#...}). The {@code #}
     * is outside {@link #LOGIN_REGEX}, so a personal sign-up can never produce one; {@link #isEnterpriseLogin} is the explicit guard on
     * every personal creation path (registration, Google).
     */
    public static final String ENTERPRISE_LOGIN_PREFIX = "ent#";

    /** {@code ent#<orgId>#<email or its hash>}: the only shape of an enterprise login (see docs/enterprise-v2/19 section 1.3). */
    public static final String ENTERPRISE_LOGIN_REGEX = "^ent#[0-9]{1,19}#[_.@A-Za-z0-9+-]{1,40}$";

    /** What the {@code User} entity accepts as a login: a personal one ({@link #LOGIN_REGEX}) or an enterprise one. DTO and path validation keep using {@link #LOGIN_REGEX}, so a person can never choose an {@code ent#} login. */
    public static final String ACCOUNT_LOGIN_REGEX = "(?:" + LOGIN_REGEX + ")|(?:" + ENTERPRISE_LOGIN_REGEX + ")";

    public static boolean isEnterpriseLogin(String login) {
        return login != null && login.strip().toLowerCase(java.util.Locale.ROOT).startsWith(ENTERPRISE_LOGIN_PREFIX);
    }

    public static final String SYSTEM = "system";
    public static final String DEFAULT_LANGUAGE = "en";

    private Constants() {}
}
