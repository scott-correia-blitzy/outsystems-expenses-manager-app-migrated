package com.massmutual.expensesmanager.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;

@MappedSuperclass
public abstract class StaticEntity {

    @Id
    @Column(name = "Id")
    private Integer id;

    @Column(name = "Label", length = 50, nullable = false)
    private String label;

    // Quoted because H2 reserves ORDER.
    @Column(name = "\"Order\"", nullable = false)
    private Integer order;

    @Column(name = "Is_Active", nullable = false)
    private Boolean isActive;

    protected StaticEntity() {
    }

    public Integer getId() {
        return id;
    }

    public String getLabel() {
        return label;
    }

    public Integer getOrder() {
        return order;
    }

    public Boolean getIsActive() {
        return isActive;
    }
}
