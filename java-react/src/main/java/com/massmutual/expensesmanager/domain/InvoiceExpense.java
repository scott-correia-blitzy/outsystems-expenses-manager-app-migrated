package com.massmutual.expensesmanager.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "InvoiceExpense")
public class InvoiceExpense extends InvoiceEntity {

    protected InvoiceExpense() {
    }

    public InvoiceExpense(Long expenseId) {
        super(expenseId);
    }
}
