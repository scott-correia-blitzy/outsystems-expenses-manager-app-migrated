package com.massmutual.expensesmanager.domain;

import jakarta.persistence.Column;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import java.time.LocalDateTime;

@MappedSuperclass
public abstract class ReportEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "Id")
    private Long id;

    @Column(name = "Code", length = 50)
    private String code;

    @Column(name = "Title", length = 50)
    private String title;

    @Column(name = "StatusId")
    private Integer statusId;

    // "Submited" is the legacy column spelling, kept so names match the schema.
    @Column(name = "SubmitedBy")
    private Long submitedBy;

    @Column(name = "CreatedOn")
    private LocalDateTime createdOn;

    @Column(name = "CreatedBy")
    private Long createdBy;

    @Column(name = "UpdatedBy")
    private Long updatedBy;

    @Column(name = "UpdatedOn")
    private LocalDateTime updatedOn;

    @Column(name = "IsActive")
    private Boolean isActive;

    @Column(name = "SubmitedOn")
    private LocalDateTime submitedOn;

    @Column(name = "ProcessedOn")
    private LocalDateTime processedOn;

    protected ReportEntity() {
    }

    public Long getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public Integer getStatusId() {
        return statusId;
    }

    public void setStatusId(Integer statusId) {
        this.statusId = statusId;
    }

    public Long getSubmitedBy() {
        return submitedBy;
    }

    public void setSubmitedBy(Long submitedBy) {
        this.submitedBy = submitedBy;
    }

    public LocalDateTime getCreatedOn() {
        return createdOn;
    }

    public void setCreatedOn(LocalDateTime createdOn) {
        this.createdOn = createdOn;
    }

    public Long getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(Long createdBy) {
        this.createdBy = createdBy;
    }

    public Long getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(Long updatedBy) {
        this.updatedBy = updatedBy;
    }

    public LocalDateTime getUpdatedOn() {
        return updatedOn;
    }

    public void setUpdatedOn(LocalDateTime updatedOn) {
        this.updatedOn = updatedOn;
    }

    public Boolean getIsActive() {
        return isActive;
    }

    public void setIsActive(Boolean isActive) {
        this.isActive = isActive;
    }

    public LocalDateTime getSubmitedOn() {
        return submitedOn;
    }

    public void setSubmitedOn(LocalDateTime submitedOn) {
        this.submitedOn = submitedOn;
    }

    public LocalDateTime getProcessedOn() {
        return processedOn;
    }

    public void setProcessedOn(LocalDateTime processedOn) {
        this.processedOn = processedOn;
    }
}
