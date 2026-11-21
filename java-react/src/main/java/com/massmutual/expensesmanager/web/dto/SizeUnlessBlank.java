package com.massmutual.expensesmanager.web.dto;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

// Like @Size(max), but blank text is left to @NotBlank so a blank over-long field reports one error.
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
            return value == null || value.length() <= max || value.toString().trim().isEmpty();
        }
    }
}
