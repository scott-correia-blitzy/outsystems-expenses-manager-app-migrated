package com.massmutual.expensesmanager.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.massmutual.expensesmanager.service.LegacyMessages;
import com.massmutual.expensesmanager.service.model.FieldViolation.Redacted;
import jakarta.validation.constraints.NotNull;

@JsonIgnoreProperties(ignoreUnknown = true)
public record DecisionRequest(
        // Boxed so a missing value is rejected instead of silently declining the report.
        @NotNull(message = LegacyMessages.FIELD_REQUIRED) Boolean accept) {

    @Override
    public String toString() {
        return "DecisionRequest[accept=" + Redacted.mask(accept) + "]";
    }
}
