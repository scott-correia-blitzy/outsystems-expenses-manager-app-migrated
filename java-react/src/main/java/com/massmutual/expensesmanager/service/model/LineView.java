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

    @Override
    public String toString() {
        return "LineView[id=" + id
                + ", reportId=" + reportId
                + ", date=" + Redacted.mask(date)
                + ", title=" + Redacted.length(title)
                + ", description=" + Redacted.length(description)
                + ", typeId=" + typeId
                + ", typeLabel=" + typeLabel
                + ", currencyId=" + currencyId
                + ", amount=" + Redacted.mask(amount)
                + ", kilometers=" + Redacted.mask(kilometers)
                + ", amountInEuros=" + Redacted.mask(amountInEuros)
                + ", vat=" + Redacted.mask(vat)
                + ", invoice=" + Redacted.mask(invoice) + "]";
    }
}
