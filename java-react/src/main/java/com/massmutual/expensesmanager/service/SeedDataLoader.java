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
import java.util.ArrayList;
import java.util.Base64;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.BiConsumer;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

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
        seed(new ClassPathResource(SEED_RESOURCE));
    }

    public void seed(Resource resource) {
        SeedFile seed = readSeedFile(resource);
        List<String> problems = problems(seed);
        if (!problems.isEmpty()) {
            throw new IllegalStateException("Seed file " + resource.getDescription() + " is invalid: "
                    + String.join("; ", problems));
        }
        SeedCounts counts = transactionTemplate.execute(status -> load(seed));
        if (counts != null) {
            log.info("Seeded demo data: {} users, {} reports, {} lines, {} blog posts",
                    counts.users(), counts.reports(), counts.lines(), counts.posts());
        }
    }

    private SeedFile readSeedFile(Resource resource) {
        try (InputStream in = resource.getInputStream()) {
            SeedFile seed = objectMapper.readValue(in, SeedFile.class);
            if (seed == null) {
                throw new IllegalStateException("Seed file " + resource.getDescription() + " is empty");
            }
            return seed;
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read seed file " + resource.getDescription(), e);
        }
    }

    // Checked in full before the transaction opens, so an incomplete file fails without writing a row.
    private List<String> problems(SeedFile seed) {
        List<String> problems = new ArrayList<>();
        Set<String> usernames = new HashSet<>();
        each(problems, "users", null, seed.users(), (path, user) -> {
            checkUser(problems, path, user);
            if (StringUtils.hasText(user.username()) && !usernames.add(user.username())) {
                problems.add(labelled(path, user.username()) + " repeats an earlier username");
            }
        });
        each(problems, "reports", null, seed.reports(),
                (path, report) -> checkReport(problems, path, report, usernames));
        each(problems, "blogPosts", null, seed.blogPosts(),
                (path, post) -> checkPost(problems, path, post, usernames));
        return problems;
    }

    private static void checkUser(List<String> problems, String path, SeedUser user) {
        String at = labelled(path, user.username());
        require(problems, StringUtils.hasText(user.username()), at, "has no username");
        require(problems, StringUtils.hasText(user.name()), at, "has no name");
        each(problems, path + ".roles", user.username(), user.roles(), (rolePath, name) -> {
            Optional<Role> role = Stream.of(Role.values()).filter(r -> r.name().equals(name)).findFirst();
            if (role.isEmpty()) {
                problems.add(labelled(rolePath, user.username()) + " is unknown role " + name);
            } else if (role.get() == Role.Registered) {
                problems.add(labelled(rolePath, user.username()) + " is Registered, which is granted at login");
            }
        });
    }

    private void checkReport(List<String> problems, String path, SeedReport report, Set<String> usernames) {
        String at = labelled(path, report.code());
        Optional<ReportKind> kind = ReportKind.fromPath(report.kind());
        requireKnown(problems, at, "kind", report.kind(), kind.isPresent());
        require(problems, StringUtils.hasText(report.code()), at, "has no code");
        require(problems, StringUtils.hasText(report.title()), at, "has no title");
        requireKnown(problems, at, "owner", report.owner(), usernames.contains(report.owner()));
        requireKnown(problems, at, "status", report.status(),
                referenceData.statusIdForLabel(report.status()).isPresent());
        require(problems, report.createdOn() != null, at, "has no createdOn");
        each(problems, path + ".lines", report.code(), report.lines(),
                (linePath, line) -> checkLine(problems, labelled(linePath, report.code()), kind.orElse(null), line));
    }

    private static void checkLine(List<String> problems, String at, ReportKind kind, SeedLine line) {
        require(problems, line.date() != null, at, "has no date");
        require(problems, StringUtils.hasText(line.title()), at, "has no title");
        require(problems, line.typeId() != null, at, "has no typeId");
        // AmountCalculator derives a mileage line's amount from its kilometers.
        if (kind == ReportKind.EXPENSE && Objects.equals(line.typeId(), ReferenceIds.EXPENSE_TYPE_KILOMETERS)) {
            require(problems, line.kilometers() != null, at, "has no kilometers");
        } else {
            require(problems, line.amount() != null, at, "has no amount");
        }
    }

    private static void checkPost(List<String> problems, String path, SeedPost post, Set<String> usernames) {
        String at = labelled(path, post.title());
        require(problems, StringUtils.hasText(post.title()), at, "has no title");
        require(problems, post.description() != null, at, "has no description");
        requireKnown(problems, at, "author", post.author(), usernames.contains(post.author()));
        require(problems, post.createdOn() != null, at, "has no createdOn");
    }

    private static <T> void each(List<String> problems, String path, String label, List<T> items,
            BiConsumer<String, T> check) {
        if (items == null) {
            problems.add(labelled(path, label) + " is missing");
            return;
        }
        for (int i = 0; i < items.size(); i++) {
            String itemPath = path + "[" + i + "]";
            if (items.get(i) == null) {
                problems.add(labelled(itemPath, label) + " is null");
            } else {
                check.accept(itemPath, items.get(i));
            }
        }
    }

    private static void require(List<String> problems, boolean valid, String at, String problem) {
        if (!valid) {
            problems.add(at + " " + problem);
        }
    }

    private static void requireKnown(List<String> problems, String at, String field, String value, boolean known) {
        if (!StringUtils.hasText(value)) {
            problems.add(at + " has no " + field);
        } else if (!known) {
            problems.add(at + " has unknown " + field + " " + value);
        }
    }

    private static String labelled(String path, String label) {
        return StringUtils.hasText(label) ? path + " (" + label + ")" : path;
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
        names.forEach(name -> roles.add(Role.valueOf(name)));
        return roles;
    }

    private int saveReport(SeedReport seed, Map<String, Long> userIds) {
        ReportKind kind = ReportKind.fromPath(seed.kind()).orElseThrow();
        Long owner = userIds.get(seed.owner());
        Integer statusId = referenceData.statusIdForLabel(seed.status()).orElseThrow();

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
        Long author = userIds.get(seed.author());
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

    private static LocalDateTime latest(LocalDateTime... stamps) {
        return Stream.of(stamps).filter(Objects::nonNull).max(LocalDateTime::compareTo).orElseThrow();
    }

    private record SeedCounts(int users, int reports, int lines, int posts) {
    }

    private record SeedFile(List<SeedUser> users, List<SeedReport> reports, List<SeedPost> blogPosts) {
    }

    private record SeedUser(String username, String name, String password, List<String> roles) {
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
