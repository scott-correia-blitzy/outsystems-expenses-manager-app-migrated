package com.massmutual.expensesmanager.support;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Objects;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

public final class MutableClock extends Clock {

    public static final LocalDateTime DEFAULT_TIME = LocalDateTime.of(2024, 5, 23, 10, 0);

    private volatile Instant instant;
    private final ZoneId zone;

    public MutableClock(Instant instant, ZoneId zone) {
        this.instant = Objects.requireNonNull(instant, "instant");
        this.zone = Objects.requireNonNull(zone, "zone");
    }

    // Matches ClockConfig's zone, so service stamps equal the time a test sets.
    public static MutableClock at(LocalDateTime time) {
        ZoneId zone = ZoneId.systemDefault();
        return new MutableClock(time.atZone(zone).toInstant(), zone);
    }

    public void set(LocalDateTime time) {
        instant = time.atZone(zone).toInstant();
    }

    public LocalDateTime localDateTime() {
        return LocalDateTime.ofInstant(instant, zone);
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this.zone.equals(zone) ? this : new MutableClock(instant, zone);
    }

    @Override
    public Instant instant() {
        return instant;
    }

    @Override
    public long millis() {
        return instant.toEpochMilli();
    }

    public static class Beans {

        // ClockConfig owns "clock" and bean overriding is disabled.
        @Bean
        @Primary
        public MutableClock mutableClock() {
            return MutableClock.at(DEFAULT_TIME);
        }
    }
}
