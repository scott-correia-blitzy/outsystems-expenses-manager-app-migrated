package com.massmutual.expensesmanager.service.model;

import java.time.LocalDateTime;

public record BlogPostView(
        Long id,
        String title,
        String description,
        LocalDateTime createdOn,
        String createdByName,
        LocalDateTime updatedOn,
        String updatedByName) {

    @Override
    public String toString() {
        return "BlogPostView[id=" + id
                + ", title=" + Redacted.length(title)
                + ", description=" + Redacted.length(description)
                + ", createdOn=" + createdOn
                + ", createdByName=" + Redacted.length(createdByName)
                + ", updatedOn=" + updatedOn
                + ", updatedByName=" + Redacted.length(updatedByName) + "]";
    }
}
