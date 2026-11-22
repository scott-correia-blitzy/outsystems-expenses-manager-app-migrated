package com.massmutual.expensesmanager.repository;

import java.math.BigDecimal;
import java.time.LocalDate;

public record DatedAmountRow(LocalDate date, BigDecimal amountInEuros) {}
