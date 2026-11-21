package com.massmutual.expensesmanager.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.LegacyMessages;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.FilterChain;
import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationTrustResolver;
import org.springframework.security.authentication.AuthenticationTrustResolverImpl;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.firewall.RequestRejectedException;
import org.springframework.security.web.firewall.RequestRejectedHandler;
import org.springframework.security.web.header.HeaderWriterFilter;
import org.springframework.stereotype.Component;

@Component
public class JsonSecurityHandlers implements AuthenticationEntryPoint, AccessDeniedHandler, RequestRejectedHandler {

    private static final Logger log = LoggerFactory.getLogger(JsonSecurityHandlers.class);

    private static final ErrorResponse UNAUTHENTICATED = ErrorResponse.of(
            HttpStatus.UNAUTHORIZED.value(), ApiException.UNAUTHENTICATED, LegacyMessages.UNAUTHENTICATED);
    private static final ErrorResponse FORBIDDEN = ErrorResponse.of(
            HttpStatus.FORBIDDEN.value(), ApiException.FORBIDDEN, LegacyMessages.NO_PERMISSIONS);
    private static final String API_PATH = "/api";
    private static final String API_PATH_SEPARATORS = "/;%";

    private final ObjectMapper objectMapper;
    private final SecurityContextRepository securityContextRepository;
    private final CsrfTokenRepository csrfTokenRepository;
    private final ObjectProvider<SecurityFilterChain> securityFilterChains;
    private final AuthenticationTrustResolver trustResolver = new AuthenticationTrustResolverImpl();

    public JsonSecurityHandlers(ObjectMapper objectMapper, SecurityContextRepository securityContextRepository,
            CsrfTokenRepository csrfTokenRepository, ObjectProvider<SecurityFilterChain> securityFilterChains) {
        this.objectMapper = objectMapper;
        this.securityContextRepository = securityContextRepository;
        this.csrfTokenRepository = csrfTokenRepository;
        this.securityFilterChains = securityFilterChains;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException authException) throws IOException {
        write(response, UNAUTHENTICATED);
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            AccessDeniedException accessDeniedException) throws IOException {
        // Anonymous callers always get 401; the CSRF filter rejects them before anonymous authentication is set.
        if (accessDeniedException instanceof CsrfException && isAnonymous()) {
            write(response, UNAUTHENTICATED);
            return;
        }
        write(response, FORBIDDEN);
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            RequestRejectedException requestRejectedException) throws IOException, ServletException {
        // The rejection message quotes the offending header, URI or parameter, so it never reaches the log.
        log.debug("Firewall rejected a request ({} dispatch)", request.getDispatcherType());
        // A rejected error dispatch keeps the status of the error being reported.
        if (request.getDispatcherType() == DispatcherType.ERROR) {
            respond(request, response, ErrorResponse.forStatus(
                    request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE) instanceof Integer status
                            ? status : HttpStatus.INTERNAL_SERVER_ERROR.value()));
            return;
        }
        reject(request, response);
    }

    // Also answers URIs Tomcat rejects; neither kind reaches the security chain, so the session names the caller.
    void reject(HttpServletRequest request, HttpServletResponse response) throws IOException, ServletException {
        boolean anonymousApiCall = isApiPath(request)
                && isAnonymous(securityContextRepository.loadDeferredContext(request).get().getAuthentication());
        respond(request, response, ErrorResponse.forStatus(
                anonymousApiCall ? HttpStatus.UNAUTHORIZED.value() : HttpStatus.NOT_FOUND.value()));
    }

    // Rejected requests skip the CSRF filter and the header writer, so the token cookie and headers are added here.
    private void respond(HttpServletRequest request, HttpServletResponse response, ErrorResponse body)
            throws IOException, ServletException {
        if (response.isCommitted()) {
            return;
        }
        FilterChain writeBody = (req, res) -> {
            csrfTokenRepository.loadDeferredToken((HttpServletRequest) req, (HttpServletResponse) res).get();
            write((HttpServletResponse) res, body);
        };
        Optional<HeaderWriterFilter> headerWriterFilter = securityFilterChains.orderedStream()
                .flatMap(chain -> chain.getFilters().stream())
                .filter(HeaderWriterFilter.class::isInstance)
                .map(HeaderWriterFilter.class::cast)
                .findFirst();
        if (headerWriterFilter.isPresent()) {
            headerWriterFilter.get().doFilter(request, response, writeBody);
        } else {
            writeBody.doFilter(request, response);
        }
    }

    private boolean isAnonymous() {
        return isAnonymous(SecurityContextHolder.getContextHolderStrategy().getContext().getAuthentication());
    }

    private boolean isAnonymous(Authentication authentication) {
        return authentication == null || trustResolver.isAnonymous(authentication);
    }

    // The raw and the normalized path both count, so neither "/api/../x" nor "//api/x" escapes the anonymous 401.
    static boolean isApiPath(HttpServletRequest request) {
        String rawPath = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (rawPath.startsWith(contextPath)) {
            rawPath = rawPath.substring(contextPath.length());
        }
        String normalizedPath = request.getServletPath() + Objects.requireNonNullElse(request.getPathInfo(), "");
        return isApiPath(rawPath) || isApiPath(normalizedPath);
    }

    private static boolean isApiPath(String path) {
        return path.startsWith(API_PATH) && (path.length() == API_PATH.length()
                || API_PATH_SEPARATORS.indexOf(path.charAt(API_PATH.length())) >= 0);
    }

    void write(HttpServletResponse response, ErrorResponse body) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(body.status());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getOutputStream(), body);
    }
}
