package com.massmutual.expensesmanager.web;

import com.massmutual.expensesmanager.service.AppUserPrincipal;
import com.massmutual.expensesmanager.service.AuthService;
import com.massmutual.expensesmanager.service.ExpensesProperties;
import com.massmutual.expensesmanager.service.model.SessionUser;
import com.massmutual.expensesmanager.web.dto.LoginRequest;
import jakarta.servlet.ServletContext;
import jakarta.servlet.SessionCookieConfig;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.http.MediaType;
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
import org.springframework.web.util.UriUtils;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final String DEFAULT_SESSION_COOKIE = "JSESSIONID";
    private static final String HTTP_ONLY = "HttpOnly";

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
        // A remembered login outlives the browser session, so the session cookie is re-sent with a Max-Age.
        response.addCookie(sessionCookie(request, session.getId(), seconds));
    }

    // Built as Tomcat builds its own session cookie, so re-sending or clearing it replaces the one Tomcat issued.
    static Cookie sessionCookie(HttpServletRequest request, String value, int maxAge) {
        ServletContext servletContext = request.getServletContext();
        SessionCookieConfig config = servletContext.getSessionCookieConfig();
        String name = StringUtils.hasLength(config.getName()) ? config.getName() : DEFAULT_SESSION_COOKIE;
        String path = StringUtils.hasLength(config.getPath()) ? config.getPath()
                : UriUtils.encodePath(servletContext.getContextPath(), StandardCharsets.UTF_8);
        Cookie cookie = new Cookie(name, value);
        config.getAttributes().forEach(cookie::setAttribute);
        cookie.setDomain(config.getDomain());
        cookie.setPath(path.isEmpty() ? "/" : path);
        cookie.setSecure(config.isSecure() || request.isSecure());
        // Tomcat's session cookie is HttpOnly unless server.servlet.session.cookie.http-only turns it off.
        cookie.setHttpOnly(config.getAttribute(HTTP_ONLY) == null || config.isHttpOnly());
        cookie.setMaxAge(maxAge);
        return cookie;
    }
}
