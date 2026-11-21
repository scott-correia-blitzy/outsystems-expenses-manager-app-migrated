package com.massmutual.expensesmanager.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.massmutual.expensesmanager.service.LegacyMessages;
import jakarta.validation.constraints.NotBlank;

@JsonIgnoreProperties(ignoreUnknown = true)
public record LoginRequest(
        @NotBlank(message = LegacyMessages.FIELD_REQUIRED) String username,
        @NotBlank(message = LegacyMessages.FIELD_REQUIRED) String password,
        boolean rememberMe) {

    // Keeps the password out of logs and exception messages.
    @Override
    public String toString() {
        return "LoginRequest[username=" + username + ", password=***, rememberMe=" + rememberMe + "]";
    }
}
