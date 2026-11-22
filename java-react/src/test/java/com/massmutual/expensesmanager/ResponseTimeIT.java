package com.massmutual.expensesmanager;

import static org.assertj.core.api.Assertions.assertThat;

import com.massmutual.expensesmanager.support.ApiClient;
import com.massmutual.expensesmanager.support.TestDatabase;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

// No stereotypes here: the plain context below scans this package without Boot's test exclude filter.
class ResponseTimeIT {

    private static final Duration MAX_STARTUP = Duration.ofSeconds(30);
    private static final Duration MAX_P95 = Duration.ofMillis(300);
    private static final int WARM_UP_CALLS = 5;
    private static final int TIMED_CALLS = 50;
    // The 48th of 50 sorted durations: 95% of the calls took at most this long.
    private static final int P95_INDEX = 47;
    private static final String DEMO_PASSWORD = "123456";

    @TempDir
    static Path tempDir;

    private static ConfigurableApplicationContext ctx;
    private static final Map<Account, ApiClient> clients = new EnumMap<>(Account.class);

    @BeforeAll
    static void start() {
        long t0 = System.nanoTime();
        // Command-line arguments outrank application.properties; builder properties would only be defaults.
        ctx = new SpringApplicationBuilder(ExpensesManagerApplication.class)
                .run("--server.port=0", TestDatabase.argument(tempDir));
        Duration startup = Duration.ofNanos(System.nanoTime() - t0);
        assertThat(startup)
                .as("startup including seeding took %.2f s", startup.toMillis() / 1000.0)
                .isLessThan(MAX_STARTUP);

        Integer port = ctx.getEnvironment().getProperty("local.server.port", Integer.class);
        assertThat(port).as("local.server.port").isNotNull();
        for (Account account : Account.values()) {
            clients.put(account, ApiClient.loggedIn(port, account.username, DEMO_PASSWORD));
        }
    }

    @AfterAll
    static void stop() {
        try {
            clients.values().forEach(ApiClient::close);
        } finally {
            clients.clear();
            if (ctx != null) {
                ctx.close();
                ctx = null;
            }
        }
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(Series.class)
    @DisplayName("p95 of 50 sequential calls after warm-up is under 300 ms")
    void p95IsUnderLimit(Series series) {
        ApiClient client = clients.get(series.account);
        for (int i = 0; i < WARM_UP_CALLS; i++) {
            assertOk(series, client.get(series.path));
        }

        long[] durations = new long[TIMED_CALLS];
        for (int i = 0; i < TIMED_CALLS; i++) {
            long callStart = System.nanoTime();
            ApiClient.Response response = client.get(series.path);
            durations[i] = System.nanoTime() - callStart;
            assertOk(series, response);
        }

        Arrays.sort(durations);
        Duration p95 = Duration.ofNanos(durations[P95_INDEX]);
        assertThat(p95)
                .as("%s: p95 was %.1f ms", series, durations[P95_INDEX] / 1_000_000.0)
                .isLessThan(MAX_P95);
    }

    private static void assertOk(Series series, ApiClient.Response response) {
        assertThat(response.status()).as("%s returned %s", series, response).isEqualTo(200);
    }

    enum Account {
        USER("em_user1"),
        ADMIN("em_admin");

        private final String username;

        Account(String username) {
            this.username = username;
        }
    }

    enum Series {
        EXPENSE_REPORTS_AS_USER(Account.USER, "/api/reports?kind=expense"),
        EARNING_REPORTS_AS_USER(Account.USER, "/api/reports?kind=earning"),
        EXPENSE_REPORTS_AS_ADMIN(Account.ADMIN, "/api/reports?kind=expense"),
        EARNING_REPORTS_AS_ADMIN(Account.ADMIN, "/api/reports?kind=earning"),
        USER_DASHBOARD(Account.USER, "/api/dashboard/user"),
        ADMIN_DASHBOARD(Account.ADMIN, "/api/dashboard/admin");

        private final Account account;
        private final String path;

        Series(Account account, String path) {
            this.account = account;
            this.path = path;
        }

        @Override
        public String toString() {
            return "GET " + path + " as " + account.username;
        }
    }
}
