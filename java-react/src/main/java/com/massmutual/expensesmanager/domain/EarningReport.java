package com.massmutual.expensesmanager.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "EarningReport")
public class EarningReport extends ReportEntity {

    public EarningReport() {
    }
}
