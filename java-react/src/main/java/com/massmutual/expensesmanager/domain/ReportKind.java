package com.massmutual.expensesmanager.domain;

import java.util.Optional;

public enum ReportKind {
    EXPENSE("expense", "EX"),
    EARNING("earning", "EA");

    private final String pathValue;
    private final String suffix;

    ReportKind(String pathValue, String suffix) {
        this.pathValue = pathValue;
        this.suffix = suffix;
    }

    public String pathValue() {
        return pathValue;
    }

    public String suffix() {
        return suffix;
    }

    public static Optional<ReportKind> fromPath(String value) {
        for (ReportKind kind : values()) {
            if (kind.pathValue.equals(value)) {
                return Optional.of(kind);
            }
        }
        return Optional.empty();
    }
}
