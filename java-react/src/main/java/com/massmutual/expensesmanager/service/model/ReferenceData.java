package com.massmutual.expensesmanager.service.model;

import java.math.BigDecimal;
import java.util.List;

public record ReferenceData(
        List<RefItem> currencies,
        List<RefItem> statuses,
        List<RefItem> expenseTypes,
        List<RefItem> earningTypes,
        BigDecimal mileageReimbursement,
        BigDecimal dollarsToEuros,
        BigDecimal vatRate) {

    public ReferenceData {
        currencies = currencies == null ? List.of() : List.copyOf(currencies);
        statuses = statuses == null ? List.of() : List.copyOf(statuses);
        expenseTypes = expenseTypes == null ? List.of() : List.copyOf(expenseTypes);
        earningTypes = earningTypes == null ? List.of() : List.copyOf(earningTypes);
    }
}
