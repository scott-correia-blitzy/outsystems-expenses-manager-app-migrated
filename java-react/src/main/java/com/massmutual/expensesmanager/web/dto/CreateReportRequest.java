package com.massmutual.expensesmanager.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.service.LegacyMessages;
import com.massmutual.expensesmanager.service.ReportService;
import com.massmutual.expensesmanager.service.model.FieldViolation.Redacted;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import jakarta.validation.constraints.NotBlank;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

// kind is a String so an unknown value fails with "Select a report type" rather than a JSON parse error.
@JsonIgnoreProperties(ignoreUnknown = true)
public record CreateReportRequest(
        @NotBlank(message = LegacyMessages.SELECT_REPORT_TYPE) String kind,
        @NotBlank(message = LegacyMessages.INSERT_TITLE)
        @CreateReportRequest.SizeUnlessBlank(max = 50, message = LegacyMessages.MAX_LENGTH_50) String title) {

    @Override
    public String toString() {
        String shownKind = ReportKind.fromPath(kind == null ? null : kind.trim())
                .map(ReportKind::pathValue)
                .orElseGet(() -> Redacted.length(kind));
        return "CreateReportRequest[kind=" + shownKind + ", title=" + Redacted.length(title) + "]";
    }

    // Like @Size(max), but text that normalizes to blank is left to the required-title checks to report one error.
    @Documented
    @Retention(RetentionPolicy.RUNTIME)
    @Target({ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER, ElementType.ANNOTATION_TYPE})
    @Constraint(validatedBy = SizeUnlessBlank.Validator.class)
    public @interface SizeUnlessBlank {

        int max();

        String message();

        Class<?>[] groups() default {};

        Class<? extends Payload>[] payload() default {};

        final class Validator implements ConstraintValidator<SizeUnlessBlank, CharSequence> {

            private int max;

            @Override
            public void initialize(SizeUnlessBlank constraint) {
                max = constraint.max();
            }

            @Override
            public boolean isValid(CharSequence value, ConstraintValidatorContext context) {
                return value == null || value.length() <= max
                        || ReportService.normalizeTitle(value.toString()).isEmpty();
            }
        }
    }
}
