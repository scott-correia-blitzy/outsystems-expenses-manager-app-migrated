package com.massmutual.expensesmanager.support;

import java.nio.file.Path;
import java.util.function.Supplier;

import org.springframework.test.context.DynamicPropertyRegistry;

public final class TestDatabase {

    public static final String PROPERTY = "spring.datasource.url";

    private TestDatabase() {
    }

    public static String url(Path dir) {
        if (dir == null) {
            throw new IllegalStateException("No test database directory");
        }
        String file = dir.toAbsolutePath().normalize().resolve("expenses").toString().replace('\\', '/');
        return "jdbc:h2:file:" + file;
    }

    public static String argument(Path dir) {
        return "--" + PROPERTY + "=" + url(dir);
    }

    public static void register(DynamicPropertyRegistry registry, Supplier<Path> dir) {
        // @TempDir may not be injected yet when the registry is populated.
        registry.add(PROPERTY, () -> url(dir.get()));
    }
}
