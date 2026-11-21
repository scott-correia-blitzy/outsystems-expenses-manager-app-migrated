package com.massmutual.expensesmanager.service;

import java.util.List;
import java.util.Set;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.InternalAuthenticationServiceException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;

import com.massmutual.expensesmanager.domain.Role;
import com.massmutual.expensesmanager.service.model.SessionUser;

@Service
public class AuthService {

    private final AuthenticationManager authenticationManager;

    public AuthService(AuthenticationManager authenticationManager) {
        this.authenticationManager = authenticationManager;
    }

    public Authentication authenticate(String username, String password) {
        try {
            return authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(username, password));
        } catch (InternalAuthenticationServiceException ex) {
            // A failing user store is a server error (500), not a credentials failure.
            throw new IllegalStateException("User lookup failed during login", ex);
        } catch (AuthenticationException ex) {
            // One answer for every rejection, so callers cannot tell an unknown user from a wrong password.
            throw ApiException.badCredentials(ex);
        }
    }

    public SessionUser sessionUser(AppUserPrincipal principal) {
        Set<Role> roles = principal.getRoles();
        List<String> roleNames = roles.stream().sorted().map(Role::name).toList();
        return new SessionUser(principal.getUsername(), principal.getDisplayName(), roleNames, landingRoute(roles));
    }

    public static String landingRoute(Set<Role> roles) {
        if (roles.contains(Role.Administrator)) {
            return "/admin";
        }
        if (roles.contains(Role.User)) {
            return "/dashboard";
        }
        return "/blog";
    }
}
