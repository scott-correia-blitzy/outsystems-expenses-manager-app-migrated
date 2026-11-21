package com.massmutual.expensesmanager.web.dto;

import com.massmutual.expensesmanager.domain.ReferenceIds;
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
import java.math.RoundingMode;
import java.util.Objects;

// Keeps a line's consumed amount and distance, and their euro values, within the DECIMAL columns.
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
@Constraint(validatedBy = LineAmountsInRange.Validator.class)
public @interface LineAmountsInRange {

    String message();

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    final class Validator implements ConstraintValidator<LineAmountsInRange, LineRequest> {

        private static final int MAX_INTEGER_DIGITS = 15;
        private static final int AMOUNT_SCALE = 4;
        private static final int KILOMETERS_SCALE = 8;
        private static final int MAX_SCALE = 100;

        @Override
        public boolean isValid(LineRequest line, ConstraintValidatorContext context) {
            if (line == null) {
                return true;
            }
            boolean kilometersExpense = Objects.equals(line.expenseTypeId(), ReferenceIds.EXPENSE_TYPE_KILOMETERS);
            boolean amountValid = (kilometersExpense && line.earningTypeId() == null)
                    || inRange(line.amount(), AMOUNT_SCALE);
            boolean kilometersValid = !kilometersExpense || inRange(line.kilometers(), KILOMETERS_SCALE);
            if (amountValid && kilometersValid) {
                return true;
            }
            context.disableDefaultConstraintViolation();
            if (!amountValid) {
                addViolation(context, "amount");
            }
            if (!kilometersValid) {
                addViolation(context, "kilometers");
            }
            return false;
        }

        // Missing and non-positive values are left to LineService, which reports them per line type.
        private static boolean inRange(BigDecimal value, int columnScale) {
            if (value == null || value.signum() <= 0) {
                return true;
            }
            // Extreme exponents are refused first: rounding them would build a power of ten as large as the exponent.
            if ((long) value.precision() - value.scale() > MAX_INTEGER_DIGITS
                    || (value.scale() > MAX_SCALE && value.stripTrailingZeros().scale() > MAX_SCALE)) {
                return false;
            }
            BigDecimal stored = value.setScale(columnScale, RoundingMode.HALF_UP);
            return (long) stored.precision() - stored.scale() <= MAX_INTEGER_DIGITS;
        }

        private static void addViolation(ConstraintValidatorContext context, String property) {
            context.buildConstraintViolationWithTemplate(context.getDefaultConstraintMessageTemplate())
                    .addPropertyNode(property)
                    .addConstraintViolation();
        }
    }
}
