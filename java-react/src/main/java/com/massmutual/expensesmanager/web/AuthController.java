package com.massmutual.expensesmanager.web;

import com.massmutual.expensesmanager.service.AppUserPrincipal;
import com.massmutual.expensesmanager.service.AuthService;
import com.massmutual.expensesmanager.service.ExpensesProperties;
import com.massmutual.expensesmanager.service.model.SessionUser;
import com.massmutual.expensesmanager.web.dto.LoginRequest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final String SESSION_COOKIE = "JSESSIONID";

    private final AuthService authService;
    private final SecurityContextRepository securityContextRepository;
    private final CsrfAuthenticationStrategy csrfStrategy;
    private final ExpensesProperties expensesProperties;
    private final SecurityContextHolderStrategy securityContextHolderStrategy =
            SecurityContextHolder.getContextHolderStrategy();

    public AuthController(AuthService authService, SecurityContextRepository securityContextRepository,
            CsrfTokenRepository csrfTokenRepository, CsrfTokenRequestHandler csrfTokenRequestHandler,
            ExpensesProperties expensesProperties) {
        this.authService = authService;
        this.securityContextRepository = securityContextRepository;
        this.expensesProperties = expensesProperties;
        CsrfAuthenticationStrategy strategy = new CsrfAuthenticationStrategy(csrfTokenRepository);
        strategy.setRequestHandler(csrfTokenRequestHandler);
        this.csrfStrategy = strategy;
    }

    @PostMapping(path = "/login", produces = MediaType.APPLICATION_JSON_VALUE)
    public SessionUser login(@Valid @RequestBody LoginRequest body, HttpServletRequest request,
            HttpServletResponse response) {
        Authentication authentication = authService.authenticate(body.username(), body.password());

        // Login runs in a controller, so the filter chain's session fixation protection never sees it.
        if (request.getSession(false) != null) {
            request.changeSessionId();
        }
        SecurityContext context = securityContextHolderStrategy.createEmptyContext();
        context.setAuthentication(authentication);
        securityContextHolderStrategy.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        csrfStrategy.onAuthentication(authentication, request, response);

        HttpSession session = request.getSession();
        if (body.rememberMe()) {
            rememberSession(session, request, response);
        } else {
            restoreIdleTimeout(session, request);
        }
        return authService.sessionUser((AppUserPrincipal) authentication.getPrincipal());
    }

    @GetMapping("/me")
    public SessionUser me(@AuthenticationPrincipal AppUserPrincipal principal) {
        return authService.sessionUser(principal);
    }

    private void restoreIdleTimeout(HttpSession session, HttpServletRequest request) {
        int minutes = request.getServletContext().getSessionTimeout();
        session.setMaxInactiveInterval(Math.toIntExact(Duration.ofMinutes(minutes).toSeconds()));
    }

    private void rememberSession(HttpSession session, HttpServletRequest request, HttpServletResponse response) {
        int seconds = Math.toIntExact(Duration.ofDays(expensesProperties.rememberMeDays()).toSeconds());
        session.setMaxInactiveInterval(seconds);
        String contextPath = request.getContextPath();
        // A remembered login outlives the browser session, so the session cookie is re-sent with a Max-Age.
        ResponseCookie cookie = ResponseCookie.from(SESSION_COOKIE, session.getId())
                .path(StringUtils.hasText(contextPath) ? contextPath : "/")
                .httpOnly(true)
                .secure(request.isSecure())
                .sameSite("Lax")
                .maxAge(seconds)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
