package com.massmutual.expensesmanager.service;

// Legacy wording is kept verbatim, misspellings included; clients match these strings exactly.
public final class LegacyMessages {

    public static final String REPORT_CANT_BE_DELETED = "This report cant be deleted";
    public static final String DETAIL_CANT_BE_DELETED = "This detail cant be deleted";
    public static final String CANNOT_SUBMIT = "It is not possible to submit the expense report";
    public static final String NO_LINES = "There are no expenses associated to the report";
    public static final String NO_PERMISSIONS = "The user does not have permissions";
    public static final String INSERT_TITLE = "Please insert a title";
    public static final String SELECT_REPORT_TYPE = "Select a report type";
    public static final String GENERIC_ERROR = "An error occurred, please try later";
    public static final String BLOG_POST_PUBLISHED = "Blog post successfuly published";
    public static final String DATE_PAST_OR_CURRENT = "Date must be set to past or current";
    public static final String DISTANCE_POSITIVE = "Distance must be a positive number";
    public static final String MUST_SET_AMOUNT = "Must set an amount";
    public static final String USD_AMOUNT_ABOVE_ZERO = "Please insert a USD amount above 0";
    public static final String RATE_ABOVE_ZERO = "Please insert an exchange rate above 0";
    public static final String NO_INVOICE = "No invoice available";
    public static final String NO_FILE_SELECTED = "No file selected";
    public static final String NO_FILE_UPLOADED = "No file uploaded";
    public static final String FILE_TYPE_NOT_SUPPORTED = "File type is not supported";
    public static final String FIELD_REQUIRED = "This field is required.";
    public static final String FORBIDDEN = "You don't have permissions to view this screen.";

    public static final String BAD_CREDENTIALS = "Invalid username or password.";
    public static final String NOT_DRAFT = "The report is no longer in Draft";
    public static final String FILE_TOO_LARGE = "The file exceeds the 5 MB limit";
    public static final String MAX_LENGTH_50 = "Maximum length is 50 characters";
    public static final String MAX_LENGTH_1500 = "Maximum length is 1500 characters";
    public static final String MAX_LENGTH_10000 = "Maximum length is 10000 characters";
    public static final String FILE_NAME_TOO_LONG = "File name must be 50 characters or fewer";
    public static final String UNAUTHENTICATED = "Please log in to continue.";
    public static final String NOT_FOUND = "The requested resource was not found";
    public static final String INVALID_VALUE = "Invalid value";
    public static final String INTERNAL_ERROR = GENERIC_ERROR;

    private LegacyMessages() {
    }
}
