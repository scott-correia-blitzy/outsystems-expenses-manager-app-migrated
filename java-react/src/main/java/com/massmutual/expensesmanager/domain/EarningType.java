package com.massmutual.expensesmanager.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

@Entity
@Immutable
@Table(name = "EarningType")
public class EarningType extends StaticEntity {

    protected EarningType() {
    }
}
