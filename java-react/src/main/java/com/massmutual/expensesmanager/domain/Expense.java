package com.massmutual.expensesmanager.domain;

import jakarta.persistence.AttributeOverride;
import jakarta.persistence.AttributeOverrides;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "Expense")
@AttributeOverrides({
    @AttributeOverride(name = "reportId", column = @Column(name = "ExpenseReportId")),
    @AttributeOverride(name = "typeId", column = @Column(name = "ExpenseTypeId"))
})
public class Expense extends LineEntity {

    public Expense() {
    }
}
