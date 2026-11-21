package com.massmutual.expensesmanager.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

@Entity
@Immutable
@Table(name = "ExpenseType")
public class ExpenseType extends StaticEntity {

    protected ExpenseType() {
    }
}
