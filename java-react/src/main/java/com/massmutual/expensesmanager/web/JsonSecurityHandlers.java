package com.massmutual.expensesmanager.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.LegacyMessages;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationTrustResolver;
import org.springframework.security.authentication.AuthenticationTrustResolverImpl;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.stereotype.Component;

@Component
public class JsonSecurityHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {

    private static final ErrorResponse UNAUTHENTICATED = ErrorResponse.of(
            HttpStatus.UNAUTHORIZED.value(), ApiException.UNAUTHENTICATED, LegacyMessages.UNAUTHENTICATED);
    private static final ErrorResponse FORBIDDEN = ErrorResponse.of(
            HttpStatus.FORBIDDEN.value(), ApiException.FORBIDDEN, LegacyMessages.NO_PERMISSIONS);

    private final ObjectMapper objectMapper;
    private final AuthenticationTrustResolver trustResolver = new AuthenticationTrustResolverImpl();

    public JsonSecurityHandlers(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
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

    private boolean isAnonymous() {
        Authentication authentication = SecurityContextHolder.getContextHolderStrategy()
                .getContext()
                .getAuthentication();
        return authentication == null || trustResolver.isAnonymous(authentication);
    }

    private void write(HttpServletResponse response, ErrorResponse body) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(body.status());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getOutputStream(), body);
    }
}
