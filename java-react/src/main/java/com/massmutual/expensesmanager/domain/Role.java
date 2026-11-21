package com.massmutual.expensesmanager.domain;

public enum Role {
    Administrator,
    Approver,
    User,
    // Granted to every signed-in user at login; never stored.
    Registered;

    public String authority() {
        return "ROLE_" + name();
    }
}
