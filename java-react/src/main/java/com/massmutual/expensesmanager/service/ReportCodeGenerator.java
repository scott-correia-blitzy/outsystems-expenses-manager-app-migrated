package com.massmutual.expensesmanager.service;

import com.massmutual.expensesmanager.domain.ReportKind;
import java.math.BigInteger;
import java.time.Clock;
import java.time.Year;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class ReportCodeGenerator {

    private static final int MAX_CODE_LENGTH = 50;

    private final KindRepositories kindRepositories;
    private final Clock clock;

    public ReportCodeGenerator(KindRepositories kindRepositories, Clock clock) {
        this.kindRepositories = kindRepositories;
        this.clock = clock;
    }

    public String nextCode(ReportKind kind) {
        int year = Year.now(clock).getValue();
        String yearAndSuffix = year + " " + kind.suffix();
        List<String> codes = kindRepositories.reports(kind).findCodesLike("%/" + yearAndSuffix);
        BigInteger highest = codes.stream().map(ReportCodeGenerator::sequenceNumber)
                .max(BigInteger::compareTo).orElse(BigInteger.ZERO);
        String code = highest.add(BigInteger.ONE) + "/" + yearAndSuffix;
        if (code.length() > MAX_CODE_LENGTH) {
            throw new IllegalStateException(
                    "The next report code would exceed the " + MAX_CODE_LENGTH + "-character Code column");
        }
        return code;
    }

    // Mirrors the legacy TextToInteger, which reads a non-numeric prefix as 0.
    private static BigInteger sequenceNumber(String code) {
        int slash = code.indexOf('/');
        if (slash < 0) {
            return BigInteger.ZERO;
        }
        try {
            return new BigInteger(code.substring(0, slash).trim());
        } catch (NumberFormatException e) {
            return BigInteger.ZERO;
        }
    }
}
