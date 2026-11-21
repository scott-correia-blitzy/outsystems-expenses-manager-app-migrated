package com.massmutual.expensesmanager.service;

import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import com.massmutual.expensesmanager.domain.AppUser;
import com.massmutual.expensesmanager.domain.Role;

public class AppUserPrincipal implements UserDetails, CredentialsContainer {

    private static final long serialVersionUID = 1L;

    private final Long id;
    private final String username;
    private final String displayName;
    private String passwordHash;
    private final Set<Role> roles;

    public AppUserPrincipal(Long id, String username, String displayName, String passwordHash, Set<Role> storedRoles) {
        this.id = Objects.requireNonNull(id, "id");
        this.username = Objects.requireNonNull(username, "username");
        this.displayName = displayName;
        this.passwordHash = passwordHash;
        // Every signed-in user holds Registered, so it is granted here rather than stored.
        EnumSet<Role> granted = EnumSet.of(Role.Registered);
        if (storedRoles != null) {
            granted.addAll(storedRoles);
        }
        this.roles = Collections.unmodifiableSet(granted);
    }

    public static AppUserPrincipal from(AppUser user) {
        Objects.requireNonNull(user, "user");
        return new AppUserPrincipal(user.getId(), user.getUsername(), user.getName(), user.getPasswordHash(),
                user.getRoles());
    }

    @Override
    public List<GrantedAuthority> getAuthorities() {
        return roles.stream()
                .<GrantedAuthority>map(role -> new SimpleGrantedAuthority(role.authority()))
                .toList();
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public void eraseCredentials() {
        passwordHash = null;
    }

    public Long getId() {
        return id;
    }

    public String getDisplayName() {
        return displayName;
    }

    public Set<Role> getRoles() {
        return roles;
    }

    public Caller toCaller() {
        return new Caller(id, username, displayName, roles);
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof AppUserPrincipal principal && username.equals(principal.username);
    }

    @Override
    public int hashCode() {
        return username.hashCode();
    }

    @Override
    public String toString() {
        return "AppUserPrincipal[username=" + username + "]";
    }
}
