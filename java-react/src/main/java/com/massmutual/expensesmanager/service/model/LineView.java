package com.massmutual.expensesmanager.service.model;

import java.math.BigDecimal;
import java.time.LocalDate;

public record LineView(
        Long id,
        Long reportId,
        LocalDate date,
        String title,
        String description,
        Integer typeId,
        String typeLabel,
        Integer currencyId,
        BigDecimal amount,
        BigDecimal kilometers,
        BigDecimal amountInEuros,
        BigDecimal vat,
        InvoiceInfo invoice) {
}
