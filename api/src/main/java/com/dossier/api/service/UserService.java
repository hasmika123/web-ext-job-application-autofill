package com.dossier.api.service;

import com.dossier.api.config.Constants;
import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.AdminUserDTO;
import com.dossier.api.service.dto.UserDTO;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;
import org.hibernate.Hibernate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.CacheManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tech.jhipster.security.RandomUtil;

/**
 * Service class for managing users.
 */
@Service
@Transactional
public class UserService {

    private static final Logger LOG = LoggerFactory.getLogger(UserService.class);

    private final UserRepository userRepository;

    private final PasswordEncoder passwordEncoder;

    private final AuthorityRepository authorityRepository;

    private final CacheManager cacheManager;

    public UserService(
        UserRepository userRepository,
        PasswordEncoder passwordEncoder,
        AuthorityRepository authorityRepository,
        CacheManager cacheManager
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.authorityRepository = authorityRepository;
        this.cacheManager = cacheManager;
    }

    public Optional<User> activateRegistration(String key) {
        LOG.debug("Activating user for activation key {}", key);
        return userRepository
            .findOneByActivationKey(key)
            .map(user -> {
                // activate given user for the registration key.
                user.setActivated(true);
                user.setActivationKey(null);
                this.clearUserCaches(user);
                LOG.debug("Activated user: {}", user);
                return user;
            });
    }

    public Optional<User> completePasswordReset(String newPassword, String key) {
        LOG.debug("Reset user password for reset key {}", key);
        return userRepository
            .findOneByResetKey(key)
            .filter(user -> user.getResetDate().isAfter(Instant.now().minus(1, ChronoUnit.DAYS)))
            .map(user -> {
                user.setPassword(passwordEncoder.encode(newPassword));
                user.setResetKey(null);
                user.setResetDate(null);
                user.setPasswordChangeRequired(false);
                user.setPasswordTempExpiresAt(null);
                this.clearUserCaches(user);
                return user;
            });
    }

    public Optional<User> requestPasswordReset(String mail) {
        return userRepository
            .findOneByOrgIdIsNullAndEmailIgnoreCase(mail) // personal accounts only until host-scoped reset (O4 phase S3)
            .filter(User::isActivated)
            .map(user -> {
                user.setResetKey(RandomUtil.generateResetKey());
                user.setResetDate(Instant.now());
                this.clearUserCaches(user);
                return user;
            });
    }

    public User registerUser(AdminUserDTO userDTO, String password) {
        if (DemoAccountService.isDemoLogin(userDTO.getLogin())) {
            throw new UsernameAlreadyUsedException(); // the demo namespaces (demo, demo-org, demo-ent-*) are never registrable
        }
        userRepository
            .findOneByLogin(userDTO.getLogin().toLowerCase())
            .ifPresent(existingUser -> {
                boolean removed = removeNonActivatedUser(existingUser);
                if (!removed) {
                    throw new UsernameAlreadyUsedException();
                }
            });
        if (Constants.isEnterpriseLogin(userDTO.getLogin())) {
            throw new UsernameAlreadyUsedException(); // the ent# login namespace belongs to enterprise accounts (decision O4)
        }
        userRepository
            .findOneByOrgIdIsNullAndEmailIgnoreCase(userDTO.getEmail())
            .ifPresent(existingUser -> {
                boolean removed = removeNonActivatedUser(existingUser);
                if (!removed) {
                    throw new EmailAlreadyUsedException();
                }
            });
        User newUser = new User();
        String encryptedPassword = passwordEncoder.encode(password);
        newUser.setLogin(userDTO.getLogin().toLowerCase());
        // new user gets initially a generated password
        newUser.setPassword(encryptedPassword);
        newUser.setFirstName(userDTO.getFirstName());
        newUser.setLastName(userDTO.getLastName());
        if (userDTO.getEmail() != null) {
            newUser.setEmail(userDTO.getEmail().toLowerCase());
        }
        newUser.setImageUrl(userDTO.getImageUrl());
        newUser.setLangKey(userDTO.getLangKey());
        // new user is not active
        newUser.setActivated(false);
        // new user gets registration key
        newUser.setActivationKey(RandomUtil.generateActivationKey());
        Set<Authority> authorities = new HashSet<>();
        authorityRepository.findById(AuthoritiesConstants.USER).ifPresent(authorities::add);
        newUser.setAuthorities(authorities);
        userRepository.save(newUser);
        this.clearUserCaches(newUser);
        LOG.debug("Created Information for User: {}", newUser);
        return newUser;
    }

    /**
     * Find-or-create the account for a verified Google sign-in. Linking is by verified
     * email: if an account already exists for the email, that account is used (and
     * activated if it wasn't — Google has verified the address), so Google sign-in and
     * password sign-in resolve to the SAME account. A new account is created activated,
     * with the email as its login and an unusable random password (Google is its only
     * sign-in). The caller has already verified the Google token + email_verified.
     */
    public User findOrCreateGoogleUser(String email, String firstName, String lastName) {
        String mail = email.toLowerCase();
        if (Constants.isEnterpriseLogin(mail)) {
            throw new UsernameAlreadyUsedException(); // the ent# login namespace belongs to enterprise accounts (decision O4)
        }
        Optional<User> existing = userRepository.findOneByOrgIdIsNullAndEmailIgnoreCase(mail);
        if (existing.isPresent()) {
            User user = existing.get();
            boolean changed = false;
            if (!user.isActivated()) {
                user.setActivated(true);
                user.setActivationKey(null);
                changed = true;
            }
            if ((user.getFirstName() == null || user.getFirstName().isBlank()) && firstName != null) {
                user.setFirstName(firstName);
                changed = true;
            }
            if ((user.getLastName() == null || user.getLastName().isBlank()) && lastName != null) {
                user.setLastName(lastName);
                changed = true;
            }
            if (changed) {
                this.clearUserCaches(user);
            }
            // Initialize the lazy authorities collection WITHIN this transaction — the Google
            // controller reads user.getAuthorities() after the session closes (which otherwise
            // throws LazyInitializationException on the link path).
            Hibernate.initialize(user.getAuthorities());
            return user;
        }
        User newUser = new User();
        newUser.setLogin(mail);
        // No usable password — a random one is encoded so password login can never match.
        newUser.setPassword(passwordEncoder.encode(RandomUtil.generatePassword()));
        newUser.setFirstName(firstName);
        newUser.setLastName(lastName);
        newUser.setEmail(mail);
        newUser.setLangKey("en");
        newUser.setActivated(true); // Google already verified the email
        Set<Authority> authorities = new HashSet<>();
        authorityRepository.findById(AuthoritiesConstants.USER).ifPresent(authorities::add);
        newUser.setAuthorities(authorities);
        userRepository.save(newUser);
        this.clearUserCaches(newUser);
        LOG.debug("Created Google user: {}", newUser);
        return newUser;
    }

    private boolean removeNonActivatedUser(User existingUser) {
        if (existingUser.isActivated()) {
            return false;
        }
        userRepository.delete(existingUser);
        userRepository.flush();
        this.clearUserCaches(existingUser);
        return true;
    }

    public User createUser(AdminUserDTO userDTO) {
        User user = new User();
        user.setLogin(userDTO.getLogin().toLowerCase());
        user.setFirstName(userDTO.getFirstName());
        user.setLastName(userDTO.getLastName());
        if (userDTO.getEmail() != null) {
            user.setEmail(userDTO.getEmail().toLowerCase());
        }
        user.setImageUrl(userDTO.getImageUrl());
        if (userDTO.getLangKey() == null) {
            user.setLangKey(Constants.DEFAULT_LANGUAGE); // default language
        } else {
            user.setLangKey(userDTO.getLangKey());
        }
        String encryptedPassword = passwordEncoder.encode(RandomUtil.generatePassword());
        user.setPassword(encryptedPassword);
        user.setResetKey(RandomUtil.generateResetKey());
        user.setResetDate(Instant.now());
        user.setActivated(true);
        if (userDTO.getAuthorities() != null) {
            Set<Authority> authorities = userDTO
                .getAuthorities()
                .stream()
                .map(authorityRepository::findById)
                .filter(Optional::isPresent)
                .map(Optional::get)
                .collect(Collectors.toSet());
            user.setAuthorities(authorities);
        }
        userRepository.save(user);
        this.clearUserCaches(user);
        LOG.debug("Created Information for User: {}", user);
        return user;
    }

    /**
     * Update all information for a specific user, and return the modified user.
     *
     * @param userDTO user to update.
     * @return updated user.
     */
    public Optional<AdminUserDTO> updateUser(AdminUserDTO userDTO) {
        return Optional.of(userRepository.findById(userDTO.getId()))
            .filter(Optional::isPresent)
            .map(Optional::get)
            .map(user -> {
                this.clearUserCaches(user);
                user.setLogin(userDTO.getLogin().toLowerCase());
                user.setFirstName(userDTO.getFirstName());
                user.setLastName(userDTO.getLastName());
                if (userDTO.getEmail() != null) {
                    user.setEmail(userDTO.getEmail().toLowerCase());
                }
                user.setImageUrl(userDTO.getImageUrl());
                user.setActivated(userDTO.isActivated());
                user.setLangKey(userDTO.getLangKey());
                Set<Authority> managedAuthorities = user.getAuthorities();
                managedAuthorities.clear();
                userDTO
                    .getAuthorities()
                    .stream()
                    .map(authorityRepository::findById)
                    .filter(Optional::isPresent)
                    .map(Optional::get)
                    .forEach(managedAuthorities::add);
                userRepository.save(user);
                this.clearUserCaches(user);
                LOG.debug("Changed Information for User: {}", user);
                return user;
            })
            .map(AdminUserDTO::new);
    }

    public void deleteUser(String login) {
        userRepository
            .findOneByLogin(login)
            .ifPresent(user -> {
                userRepository.delete(user);
                this.clearUserCaches(user);
                LOG.debug("Deleted User: {}", user);
            });
    }

    /**
     * Update basic information (first name, last name, email, language) for the current user.
     *
     * @param firstName first name of user.
     * @param lastName  last name of user.
     * @param email     email id of user.
     * @param langKey   language key.
     * @param imageUrl  image URL of user.
     */
    public void updateUser(String firstName, String lastName, String email, String langKey, String imageUrl) {
        SecurityUtils.getCurrentUserLogin()
            .flatMap(userRepository::findOneByLogin)
            .ifPresent(user -> {
                user.setFirstName(firstName);
                user.setLastName(lastName);
                if (email != null) {
                    user.setEmail(email.toLowerCase());
                }
                user.setLangKey(langKey);
                user.setImageUrl(imageUrl);
                userRepository.save(user);
                this.clearUserCaches(user);
                LOG.debug("Changed Information for User: {}", user);
            });
    }

    @Transactional
    public void changePassword(String currentClearTextPassword, String newPassword) {
        SecurityUtils.getCurrentUserLogin()
            .flatMap(userRepository::findOneByLogin)
            .ifPresent(user -> {
                String currentEncryptedPassword = user.getPassword();
                if (!passwordEncoder.matches(currentClearTextPassword, currentEncryptedPassword)) {
                    throw new InvalidPasswordException();
                }
                if (user.isPasswordChangeRequired() && passwordEncoder.matches(newPassword, currentEncryptedPassword)) {
                    throw new InvalidPasswordException(); // a forced change must actually change it
                }
                String encryptedPassword = passwordEncoder.encode(newPassword);
                user.setPassword(encryptedPassword);
                user.setPasswordChangeRequired(false);
                user.setPasswordTempExpiresAt(null);
                this.clearUserCaches(user);
                LOG.debug("Changed password for User: {}", user);
            });
    }

    @Transactional(readOnly = true)
    public Page<AdminUserDTO> getAllManagedUsers(Pageable pageable) {
        return userRepository.findAllByOrgIdIsNull(pageable).map(AdminUserDTO::new);
    }

    @Transactional(readOnly = true)
    public Page<UserDTO> getAllPublicUsers(Pageable pageable) {
        return userRepository.findAllByOrgIdIsNullAndActivatedIsTrue(pageable).map(UserDTO::new);
    }

    @Transactional(readOnly = true)
    public Optional<User> getUserWithAuthoritiesByLogin(String login) {
        return userRepository.findOneWithAuthoritiesByLogin(login);
    }

    @Transactional(readOnly = true)
    public Optional<User> getUserWithAuthorities() {
        return SecurityUtils.getCurrentUserLogin().flatMap(userRepository::findOneWithAuthoritiesByLogin);
    }

    /**
     * Not activated users should be automatically deleted after 3 days.
     * <p>
     * This is scheduled to get fired every day, at 01:00 (am).
     */
    @Scheduled(cron = "0 0 1 * * ?")
    public void removeNotActivatedUsers() {
        userRepository
            .findAllByActivatedIsFalseAndActivationKeyIsNotNullAndCreatedDateBefore(Instant.now().minus(3, ChronoUnit.DAYS))
            .forEach(user -> {
                LOG.debug("Deleting not activated user {}", user.getLogin());
                userRepository.delete(user);
                this.clearUserCaches(user);
            });
    }

    /**
     * Gets a list of all the authorities.
     * @return a list of all the authorities.
     */
    @Transactional(readOnly = true)
    public List<String> getAuthorities() {
        return authorityRepository.findAll().stream().map(Authority::getName).toList();
    }

    private void clearUserCaches(User user) {
        Objects.requireNonNull(cacheManager.getCache(UserRepository.USERS_BY_LOGIN_CACHE)).evictIfPresent(user.getLogin());
        if (user.getEmail() != null) {
            Objects.requireNonNull(cacheManager.getCache(UserRepository.USERS_BY_EMAIL_CACHE)).evictIfPresent(UserRepository.emailCacheKey(user.getOrgId(), user.getEmail()));
        }
    }

    // ---- administrator-issued temporary passwords (X1.11 owner onboarding, employee direct-create) -------------------

    private static final java.security.SecureRandom TEMP_RANDOM = new java.security.SecureRandom();
    private static final String TEMP_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final String TEMP_LOWER = "abcdefghijkmnopqrstuvwxyz";
    private static final String TEMP_DIGIT = "23456789";
    private static final String TEMP_SYMBOL = "!#$%*+-=?@";
    public static final int TEMP_PASSWORD_LENGTH = 16;

    /** What creating (or finding) an account for an administrator produced. {@code tempPassword} is null when the account already existed (its password is untouched). */
    public record TempAccount(User user, String tempPassword, boolean created) {}

    /** A random 16-character password with at least one upper-case letter, lower-case letter, digit and symbol; no look-alike characters (0 O 1 l I). */
    public static String generateTempPassword() {
        String all = TEMP_UPPER + TEMP_LOWER + TEMP_DIGIT + TEMP_SYMBOL;
        char[] out = new char[TEMP_PASSWORD_LENGTH];
        String[] required = { TEMP_UPPER, TEMP_LOWER, TEMP_DIGIT, TEMP_SYMBOL };
        for (int i = 0; i < out.length; i++) {
            String pool = i < required.length ? required[i] : all;
            out[i] = pool.charAt(TEMP_RANDOM.nextInt(pool.length()));
        }
        for (int i = out.length - 1; i > 0; i--) { // shuffle so the required classes are not always first
            int j = TEMP_RANDOM.nextInt(i + 1);
            char t = out[i];
            out[i] = out[j];
            out[j] = t;
        }
        return new String(out);
    }

    /**
     * The account for {@code email}: the existing one untouched (no new password, no flag), or a NEW activated account (no email
     * verification step) whose password is {@code password} - the server-generated one, or an administrator-chosen one the caller
     * has already checked against the password rules - flagged "must change on first sign-in" and expiring at {@code expiresAt}.
     */
    @Transactional
    public TempAccount createTempAccount(String email, String firstName, String lastName, String password, Instant expiresAt) {
        String mail = email.strip().toLowerCase(Locale.ROOT);
        // Personal scope: the "attach an existing account" branch stays until phase S4 replaces it with a separate enterprise account.
        Optional<User> existing = userRepository.findOneByOrgIdIsNullAndEmailIgnoreCase(mail);
        if (existing.isPresent()) {
            Hibernate.initialize(existing.get().getAuthorities());
            return new TempAccount(existing.get(), null, false);
        }
        String temp = password == null ? generateTempPassword() : password;
        User user = new User();
        user.setLogin(freeLogin(mail));
        user.setPassword(passwordEncoder.encode(temp));
        user.setFirstName(trimTo(firstName, 50));
        user.setLastName(trimTo(lastName, 50));
        user.setEmail(mail);
        user.setLangKey("en");
        user.setActivated(true);
        user.setPasswordChangeRequired(true);
        user.setPasswordTempExpiresAt(expiresAt);
        Set<Authority> authorities = new HashSet<>();
        authorityRepository.findById(AuthoritiesConstants.USER).ifPresent(authorities::add);
        user.setAuthorities(authorities);
        userRepository.save(user);
        clearUserCaches(user);
        return new TempAccount(user, temp, true);
    }

    /** Gives the account a new temporary password (server-generated unless {@code password} is given), flags it for change and sets its expiry. Returns the clear-text password for the one-time display; it is stored hashed only. */
    @Transactional
    public String resetTempPassword(User user, String password, Instant expiresAt) {
        String temp = password == null ? generateTempPassword() : password;
        user.setPassword(passwordEncoder.encode(temp));
        user.setPasswordChangeRequired(true);
        user.setPasswordTempExpiresAt(expiresAt);
        userRepository.save(user);
        clearUserCaches(user);
        return temp;
    }

    /** True when the account still holds an administrator-issued password that has run out (sign-in must be refused). */
    public static boolean tempPasswordExpired(User user) {
        return user.isPasswordChangeRequired() && user.getPasswordTempExpiresAt() != null && user.getPasswordTempExpiresAt().isBefore(Instant.now());
    }

    private String freeLogin(String mail) {
        String login = mail.length() <= 50 ? mail : mail.substring(0, 40);
        if (mail.length() <= 50 && userRepository.findOneByLogin(login).isEmpty()) return login;
        String head = login.length() > 40 ? login.substring(0, 40) : login;
        for (int i = 0; i < 50; i++) {
            String candidate = head + "-" + (1000 + TEMP_RANDOM.nextInt(9000));
            if (userRepository.findOneByLogin(candidate).isEmpty()) return candidate;
        }
        throw new IllegalStateException("could not find a free login");
    }

    private static String trimTo(String s, int max) {
        if (s == null || s.isBlank()) return null;
        String t = s.strip();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
