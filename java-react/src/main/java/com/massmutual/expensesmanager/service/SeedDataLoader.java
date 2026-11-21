package com.massmutual.expensesmanager.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.massmutual.expensesmanager.domain.AppUser;
import com.massmutual.expensesmanager.domain.BlogPost;
import com.massmutual.expensesmanager.domain.LineEntity;
import com.massmutual.expensesmanager.domain.ReferenceIds;
import com.massmutual.expensesmanager.domain.ReportEntity;
import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.domain.Role;
import com.massmutual.expensesmanager.repository.AppUserRepository;
import com.massmutual.expensesmanager.repository.BlogPostRepository;
import com.massmutual.expensesmanager.repository.EarningReportRepository;
import com.massmutual.expensesmanager.repository.ExpenseReportRepository;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class SeedDataLoader implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedDataLoader.class);

    private static final String SEED_RESOURCE = "seed/demo-data.json";
    private static final int UNUSABLE_PASSWORD_BYTES = 32;

    private final ExpensesProperties properties;
    private final ObjectMapper objectMapper;
    private final PasswordEncoder passwordEncoder;
    private final AppUserRepository appUserRepository;
    private final BlogPostRepository blogPostRepository;
    private final ExpenseReportRepository expenseReportRepository;
    private final EarningReportRepository earningReportRepository;
    private final KindRepositories kindRepositories;
    private final AmountCalculator calculator;
    private final ReferenceDataService referenceData;
    private final TransactionTemplate transactionTemplate;
    private final SecureRandom secureRandom = new SecureRandom();

    public SeedDataLoader(
            ExpensesProperties properties,
            ObjectMapper objectMapper,
            PasswordEncoder passwordEncoder,
            AppUserRepository appUserRepository,
            BlogPostRepository blogPostRepository,
            ExpenseReportRepository expenseReportRepository,
            EarningReportRepository earningReportRepository,
            KindRepositories kindRepositories,
            AmountCalculator calculator,
            ReferenceDataService referenceData,
            PlatformTransactionManager transactionManager) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.passwordEncoder = passwordEncoder;
        this.appUserRepository = appUserRepository;
        this.blogPostRepository = blogPostRepository;
        this.expenseReportRepository = expenseReportRepository;
        this.earningReportRepository = earningReportRepository;
        this.kindRepositories = kindRepositories;
        this.calculator = calculator;
        this.referenceData = referenceData;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!properties.seed().enabled()) {
            return;
        }
        if (expenseReportRepository.count() != 0 || earningReportRepository.count() != 0) {
            return;
        }
        SeedFile seed = readSeedFile();
        SeedCounts counts = transactionTemplate.execute(status -> load(seed));
        if (counts != null) {
            log.info("Seeded demo data: {} users, {} reports, {} lines, {} blog posts",
                    counts.users(), counts.reports(), counts.lines(), counts.posts());
        }
    }

    private SeedFile readSeedFile() {
        try (InputStream in = new ClassPathResource(SEED_RESOURCE).getInputStream()) {
            SeedFile seed = objectMapper.readValue(in, SeedFile.class);
            if (seed == null) {
                throw new IllegalStateException("Seed file " + SEED_RESOURCE + " is empty");
            }
            return seed;
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read seed file " + SEED_RESOURCE, e);
        }
    }

    private SeedCounts load(SeedFile seed) {
        Map<String, Long> userIds = new HashMap<>();
        for (SeedUser user : seed.users()) {
            userIds.put(user.username(), userId(user));
        }
        int lines = 0;
        // Inserted in file order, which lists codes ascending, so id-descending lists show codes descending.
        for (SeedReport report : seed.reports()) {
            lines += saveReport(report, userIds);
        }
        for (SeedPost post : seed.blogPosts()) {
            savePost(post, userIds);
        }
        return new SeedCounts(userIds.size(), seed.reports().size(), lines, seed.blogPosts().size());
    }

    private Long userId(SeedUser user) {
        if (user.username() == null || user.username().isBlank()) {
            throw new IllegalStateException("Seed user without a username");
        }
        return appUserRepository.findByUsername(user.username())
                .orElseGet(() -> appUserRepository.save(new AppUser(
                        user.username(),
                        user.name(),
                        passwordEncoder.encode(user.password() != null ? user.password() : unusablePassword()),
                        roles(user.roles()))))
                .getId();
    }

    // Users without a seed password own demo reports but must not be able to sign in.
    private String unusablePassword() {
        byte[] bytes = new byte[UNUSABLE_PASSWORD_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }

    private static Set<Role> roles(List<String> names) {
        Set<Role> roles = EnumSet.noneOf(Role.class);
        for (String name : names) {
            Role role = role(name);
            if (role == Role.Registered) {
                throw new IllegalStateException("Role Registered is granted at login and cannot be seeded");
            }
            roles.add(role);
        }
        return roles;
    }

    private static Role role(String name) {
        if (name == null) {
            throw new IllegalStateException("Seed user with a null role");
        }
        try {
            return Role.valueOf(name);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Unknown role in seed file: " + name, e);
        }
    }

    private int saveReport(SeedReport seed, Map<String, Long> userIds) {
        ReportKind kind = ReportKind.fromPath(seed.kind())
                .orElseThrow(() -> new IllegalStateException("Unknown report kind in seed file: " + seed.kind()));
        Long owner = requireUserId(userIds, seed.owner());
        Integer statusId = referenceData.statusIdForLabel(seed.status())
                .orElseThrow(() -> new IllegalStateException("Unknown status in seed file: " + seed.status()));
        if (seed.createdOn() == null) {
            throw new IllegalStateException("Seed report " + seed.code() + " has no createdOn");
        }

        ReportEntity report = kindRepositories.newReport(kind);
        report.setCode(seed.code());
        report.setTitle(seed.title());
        report.setStatusId(statusId);
        report.setCreatedBy(owner);
        report.setSubmitedBy(owner);
        report.setUpdatedBy(owner);
        report.setCreatedOn(seed.createdOn());
        report.setSubmitedOn(seed.submitedOn());
        report.setProcessedOn(seed.processedOn());
        report.setUpdatedOn(seed.updatedOn() != null
                ? seed.updatedOn()
                : latest(seed.createdOn(), seed.submitedOn(), seed.processedOn()));
        report.setIsActive(false);
        Long reportId = kindRepositories.reports(kind).save(report).getId();

        for (SeedLine line : seed.lines()) {
            kindRepositories.lines(kind).save(newLine(kind, reportId, owner, seed.createdOn(), line));
        }
        return seed.lines().size();
    }

    private LineEntity newLine(ReportKind kind, Long reportId, Long owner, LocalDateTime stamp, SeedLine seed) {
        AmountCalculator.LineAmounts amounts = calculator.lineAmounts(
                kind,
                seed.typeId(),
                seed.currencyId() != null ? seed.currencyId() : ReferenceIds.CURRENCY_EURO,
                seed.amount(),
                seed.kilometers());

        LineEntity line = kindRepositories.newLine(kind);
        line.setReportId(reportId);
        line.setDate(seed.date());
        line.setTitle(seed.title());
        line.setDescription(Objects.requireNonNullElse(seed.description(), ""));
        line.setTypeId(seed.typeId());
        line.setCurrencyId(amounts.currencyId());
        line.setAmount(amounts.amount());
        line.setKilometers(amounts.kilometers());
        line.setAmountInEuros(amounts.amountInEuros());
        line.setCreatedBy(owner);
        line.setUpdatedBy(owner);
        line.setCreatedOn(stamp);
        line.setUpdatedOn(stamp);
        line.setIsActive(false);
        return line;
    }

    private void savePost(SeedPost seed, Map<String, Long> userIds) {
        Long author = requireUserId(userIds, seed.author());
        BlogPost post = new BlogPost();
        post.setTitle(seed.title());
        post.setDescription(seed.description());
        post.setCreatedBy(author);
        post.setUpdatedBy(author);
        post.setCreatedOn(seed.createdOn());
        post.setUpdatedOn(seed.updatedOn() != null ? seed.updatedOn() : seed.createdOn());
        post.setIsActive(Objects.requireNonNullElse(seed.isActive(), Boolean.TRUE));
        blogPostRepository.save(post);
    }

    private static Long requireUserId(Map<String, Long> userIds, String username) {
        Long id = userIds.get(username);
        if (id == null) {
            throw new IllegalStateException("Seed file references unknown user: " + username);
        }
        return id;
    }

    private static LocalDateTime latest(LocalDateTime... stamps) {
        return Stream.of(stamps).filter(Objects::nonNull).max(LocalDateTime::compareTo).orElseThrow();
    }

    private record SeedCounts(int users, int reports, int lines, int posts) {
    }

    private record SeedFile(List<SeedUser> users, List<SeedReport> reports, List<SeedPost> blogPosts) {
        SeedFile {
            users = Objects.requireNonNullElse(users, List.of());
            reports = Objects.requireNonNullElse(reports, List.of());
            blogPosts = Objects.requireNonNullElse(blogPosts, List.of());
        }
    }

    private record SeedUser(String username, String name, String password, List<String> roles) {
        SeedUser {
            roles = Objects.requireNonNullElse(roles, List.of());
        }
    }

    private record SeedReport(
            String kind,
            String code,
            String title,
            String owner,
            String status,
            LocalDateTime createdOn,
            LocalDateTime submitedOn,
            LocalDateTime processedOn,
            LocalDateTime updatedOn,
            List<SeedLine> lines) {
        SeedReport {
            lines = Objects.requireNonNullElse(lines, List.of());
        }
    }

    private record SeedLine(
            LocalDate date,
            String title,
            String description,
            Integer typeId,
            Integer currencyId,
            BigDecimal amount,
            BigDecimal kilometers) {
    }

    private record SeedPost(
            String title,
            String description,
            String author,
            LocalDateTime createdOn,
            LocalDateTime updatedOn,
            Boolean isActive) {
    }
}
