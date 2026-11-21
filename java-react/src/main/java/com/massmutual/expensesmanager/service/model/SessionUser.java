package com.massmutual.expensesmanager.service.model;

import java.util.List;

public record SessionUser(String username, String displayName, List<String> roles, String landingRoute) {

    public SessionUser {
        roles = roles == null ? List.of() : List.copyOf(roles);
    }
}
