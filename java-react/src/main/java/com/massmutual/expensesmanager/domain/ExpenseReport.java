package com.massmutual.expensesmanager.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "ExpenseReport")
public class ExpenseReport extends ReportEntity {

    public ExpenseReport() {
    }
}
