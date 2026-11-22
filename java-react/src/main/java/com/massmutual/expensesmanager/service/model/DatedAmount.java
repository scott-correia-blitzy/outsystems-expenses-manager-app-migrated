package com.massmutual.expensesmanager.service.model;

import com.massmutual.expensesmanager.service.model.FieldViolation.Redacted;

import java.math.BigDecimal;
import java.time.LocalDate;

public record DatedAmount(String kind, LocalDate date, BigDecimal amountInEuros) {

    @Override
    public String toString() {
        return "DatedAmount[kind=" + kind
                + ", date=" + Redacted.mask(date)
                + ", amountInEuros=" + Redacted.mask(amountInEuros) + "]";
    }
}
