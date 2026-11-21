package com.massmutual.expensesmanager.service;

import com.massmutual.expensesmanager.domain.ReportKind;
import java.time.Clock;
import java.time.Year;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class ReportCodeGenerator {

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
        int highest = codes.stream().mapToInt(ReportCodeGenerator::sequenceNumber).max().orElse(0);
        return (highest + 1) + "/" + yearAndSuffix;
    }

    // Mirrors the legacy TextToInteger, which reads a non-numeric prefix as 0.
    private static int sequenceNumber(String code) {
        int slash = code.indexOf('/');
        if (slash < 0) {
            return 0;
        }
        try {
            return Integer.parseInt(code.substring(0, slash).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
