package com.dossier.api.web.rest;

import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.DemoAccountService;
import com.dossier.api.service.DemoAccountService.DemoAccount;
import com.dossier.api.service.DemoException;
import com.dossier.api.service.TokenIssuer;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public side of the demo accounts (phase demo): what the login page asks, and the one-click
 * sign-in. Both are {@code permitAll} in {@code SecurityConfiguration}.
 *
 * <p>Kept apart from {@link AuthenticateController} on purpose: a demo login needs no password
 * check, only the switch and a fixed list of logins. Tokens come from {@link TokenIssuer}, the same
 * issuer the Google sign-in uses, so a demo session carries exactly the claims (and so the cookies)
 * of a password login.
 *
 * <p><b>No response here ever contains a password.</b>
 */
@RestController
@Tag(name = "demo", description = "Public demo accounts (only while an admin has switched them on).")
public class DemoResource {

    /** Body of {@code POST /api/authenticate/demo}. */
    public record DemoLoginVM(String login) {}

    private final DemoAccountService demoAccountService;
    private final UserRepository userRepository;
    private final TokenIssuer tokenIssuer;

    public DemoResource(DemoAccountService demoAccountService, UserRepository userRepository, TokenIssuer tokenIssuer) {
        this.demoAccountService = demoAccountService;
        this.userRepository = userRepository;
        this.tokenIssuer = tokenIssuer;
    }

    @Operation(summary = "Demo accounts on offer", description = "Whether demos are on, and which accounts the login page can open. No passwords.")
    @GetMapping("/api/public/demo")
    public Map<String, Object> publicDemo() {
        boolean enabled = demoAccountService.isEnabled();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("enabled", enabled);
        // Hide the list while off: nothing for the login page to draw.
        body.put("accounts", enabled ? demoAccountService.accounts() : List.<DemoAccount>of());
        return body;
    }

    @Operation(
        summary = "Open a demo account",
        description = "Issue the normal access + refresh token pair for a demo account. 403 DEMO_DISABLED while the demo is off; 404 for any other login."
    )
    @PostMapping("/api/authenticate/demo")
    public ResponseEntity<TokenIssuer.TokenPair> demoLogin(@RequestBody DemoLoginVM vm) {
        if (!demoAccountService.isEnabled()) {
            throw DemoException.disabled();
        }
        String login = vm == null || vm.login() == null ? "" : vm.login().trim().toLowerCase(Locale.ENGLISH);
        if (!demoAccountService.isDemo(login) || (DemoAccountService.LOGIN_ADMIN.equals(login) && !demoAccountService.isAdminDemoEnabled())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        if (DemoAccountService.LOGIN_JOB_SEEKER.equals(login)) {
            demoAccountService.ensureSeeded(); // a SQL-flipped switch seeds nothing; fill an empty demo now
        }
        User user = userRepository.findOneWithAuthoritiesByLogin(login).orElse(null);
        if (user == null || !user.isActivated()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        String authorities = user.getAuthorities().stream().map(Authority::getName).collect(Collectors.joining(" "));
        TokenIssuer.TokenPair pair = tokenIssuer.issue(user.getLogin(), authorities, user.getId());
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(pair.accessToken());
        return new ResponseEntity<>(pair, headers, HttpStatus.OK);
    }
}
