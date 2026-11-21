package com.massmutual.expensesmanager.service.model;

// String forms for records Spring MVC logs at DEBUG and TRACE, where user-entered values must never appear.
public final class Redacted {

    private Redacted() {
    }

    public static String length(String text) {
        return text == null ? "null" : "<" + text.length() + " chars>";
    }

    public static String mask(Object value) {
        return value == null ? "null" : "***";
    }
}
