package com.massmutual.expensesmanager.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "InvoiceEarning")
public class InvoiceEarning extends InvoiceEntity {

    protected InvoiceEarning() {
    }

    public InvoiceEarning(Long earningId) {
        super(earningId);
    }
}
