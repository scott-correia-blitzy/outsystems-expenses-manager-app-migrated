package com.massmutual.expensesmanager.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.massmutual.expensesmanager.service.LegacyMessages;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

// Unannotated fields are checked in LineService, since their rules depend on kind, line type and the clock.
@JsonIgnoreProperties(ignoreUnknown = true)
public record LineRequest(
        Integer expenseTypeId,
        Integer earningTypeId,
        Integer currencyId,
        BigDecimal amount,
        BigDecimal kilometers,
        @NotBlank(message = LegacyMessages.FIELD_REQUIRED)
        @Size(max = 50, message = LegacyMessages.MAX_LENGTH_50) String title,
        @Size(max = 1500, message = LegacyMessages.MAX_LENGTH_1500) String description,
        LocalDate date) {
}
