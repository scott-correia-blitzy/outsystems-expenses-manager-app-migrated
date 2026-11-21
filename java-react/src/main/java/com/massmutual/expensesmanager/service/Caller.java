package com.massmutual.expensesmanager.service;

import java.util.Objects;
import java.util.Set;

import com.massmutual.expensesmanager.domain.Role;

public record Caller(Long id, String username, String displayName, Set<Role> roles) {

    public Caller {
        Objects.requireNonNull(id, "id");
        roles = roles == null ? Set.of() : Set.copyOf(roles);
    }

    public boolean has(Role role) {
        return role != null && roles.contains(role);
    }

    public boolean hasAny(Role... candidates) {
        if (candidates == null) {
            return false;
        }
        for (Role candidate : candidates) {
            if (has(candidate)) {
                return true;
            }
        }
        return false;
    }
}
