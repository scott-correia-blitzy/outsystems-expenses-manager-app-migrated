package com.massmutual.expensesmanager.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.massmutual.expensesmanager.service.LegacyMessages;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

// Rules that depend on kind, line type or the clock are checked in LineService.
@JsonIgnoreProperties(ignoreUnknown = true)
@LineAmountsInRange(message = LegacyMessages.INVALID_VALUE)
public record LineRequest(
        Integer expenseTypeId,
        Integer earningTypeId,
        Integer currencyId,
        BigDecimal amount,
        BigDecimal kilometers,
        @NotBlank(message = LegacyMessages.FIELD_REQUIRED)
        @SizeUnlessBlank(max = 50, message = LegacyMessages.MAX_LENGTH_50) String title,
        @Size(max = 1500, message = LegacyMessages.MAX_LENGTH_1500) String description,
        LocalDate date) {
}
