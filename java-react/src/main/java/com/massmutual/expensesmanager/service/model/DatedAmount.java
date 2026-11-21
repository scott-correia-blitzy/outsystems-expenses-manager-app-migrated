package com.massmutual.expensesmanager.service.model;

import java.math.BigDecimal;
import java.time.LocalDate;

public record DatedAmount(String kind, LocalDate date, BigDecimal amountInEuros) {}
