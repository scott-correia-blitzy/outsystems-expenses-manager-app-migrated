package com.massmutual.expensesmanager.domain;

import jakarta.persistence.AttributeOverride;
import jakarta.persistence.AttributeOverrides;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "Earning")
@AttributeOverrides({
    @AttributeOverride(name = "reportId", column = @Column(name = "EarningReportId")),
    @AttributeOverride(name = "typeId", column = @Column(name = "EarningTypeId"))
})
public class Earning extends LineEntity {

    public Earning() {
    }
}
