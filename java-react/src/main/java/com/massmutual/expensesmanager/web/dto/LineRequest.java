package com.massmutual.expensesmanager.web.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.massmutual.expensesmanager.service.LegacyMessages;
import com.massmutual.expensesmanager.service.LineService;
import com.massmutual.expensesmanager.service.model.FieldViolation;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

// Rules that depend on kind, line type or the clock are checked in LineService.
@JsonIgnoreProperties(ignoreUnknown = true)
@LineRequest.TextWithinLimits
public record LineRequest(
        Integer expenseTypeId,
        Integer earningTypeId,
        Integer currencyId,
        BigDecimal amount,
        BigDecimal kilometers,
        String title,
        String description,
        LocalDate date) {

    @Documented
    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.TYPE)
    @Constraint(validatedBy = TextWithinLimits.Validator.class)
    public @interface TextWithinLimits {

        String message() default LegacyMessages.INVALID_VALUE;

        Class<?>[] groups() default {};

        Class<? extends Payload>[] payload() default {};

        final class Validator implements ConstraintValidator<TextWithinLimits, LineRequest> {

            @Override
            public boolean isValid(LineRequest line, ConstraintValidatorContext context) {
                if (line == null) {
                    return true;
                }
                List<FieldViolation> violations = LineService.textViolations(line.title(), line.description());
                if (violations.isEmpty()) {
                    return true;
                }
                context.disableDefaultConstraintViolation();
                for (FieldViolation violation : violations) {
                    context.buildConstraintViolationWithTemplate(literal(violation.message()))
                            .addPropertyNode(violation.field())
                            .addConstraintViolation();
                }
                return false;
            }

            // Message templates interpolate braces and dollar signs, so the text is escaped to stay literal.
            private static String literal(String message) {
                return message.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("$", "\\$");
            }
        }
    }
}
