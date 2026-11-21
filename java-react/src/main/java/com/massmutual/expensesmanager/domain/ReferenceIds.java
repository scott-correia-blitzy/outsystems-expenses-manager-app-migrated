package com.massmutual.expensesmanager.domain;

// Must match the Static Entity rows seeded by data.sql.
public final class ReferenceIds {

    public static final int STATUS_DRAFT = 1;
    public static final int STATUS_SUBMITTED = 2;
    public static final int STATUS_APPROVED = 3;
    public static final int STATUS_DECLINED = 4;

    public static final int CURRENCY_EURO = 1;
    public static final int CURRENCY_DOLLAR = 2;

    public static final int EXPENSE_TYPE_RESTAURANT = 1;
    public static final int EXPENSE_TYPE_TRAVEL = 2;
    public static final int EXPENSE_TYPE_KILOMETERS = 3;
    public static final int EXPENSE_TYPE_OTHER = 4;

    public static final int EARNING_TYPE_SALARY = 1;
    public static final int EARNING_TYPE_INVESTMENT = 2;
    public static final int EARNING_TYPE_SERVICE = 3;
    public static final int EARNING_TYPE_OTHER = 4;

    private ReferenceIds() {
    }
}
