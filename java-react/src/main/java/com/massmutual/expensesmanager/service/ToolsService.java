package com.massmutual.expensesmanager.service;

import java.math.BigDecimal;

import org.springframework.stereotype.Service;

import com.massmutual.expensesmanager.domain.Role;
import com.massmutual.expensesmanager.service.model.MileageResult;
import com.massmutual.expensesmanager.service.model.UsdToEurResult;

@Service
public class ToolsService {

    private final AmountCalculator calculator;
    private final ExpensesProperties properties;
    private final ReportAccessPolicy policy;

    public ToolsService(AmountCalculator calculator, ExpensesProperties properties, ReportAccessPolicy policy) {
        this.calculator = calculator;
        this.properties = properties;
        this.policy = policy;
    }

    public UsdToEurResult usdToEur(Caller caller, BigDecimal amount, BigDecimal rate) {
        requireToolAccess(caller);
        BigDecimal effectiveRate = rate != null ? rate : properties.dollarsToEuros();
        BigDecimal eur = calculator.usdToEur(amount, effectiveRate);
        return new UsdToEurResult(calculator.money(eur), effectiveRate);
    }

    public MileageResult mileage(Caller caller, BigDecimal km) {
        requireToolAccess(caller);
        if (km == null || km.signum() <= 0) {
            throw ApiException.validation("km", LegacyMessages.DISTANCE_POSITIVE);
        }
        BigDecimal eur = calculator.mileage(km);
        return new MileageResult(calculator.money(eur), properties.mileageReimbursement());
    }

    private void requireToolAccess(Caller caller) {
        policy.requireAnyRole(caller, Role.User, Role.Approver, Role.Administrator);
    }
}
