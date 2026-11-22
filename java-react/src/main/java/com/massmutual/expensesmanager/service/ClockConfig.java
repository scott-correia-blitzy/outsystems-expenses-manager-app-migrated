package com.massmutual.expensesmanager.service;

import java.time.Clock;
import java.time.Duration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class ClockConfig {

    // Whole seconds, so a write returns its stamps exactly as they are stored and read back.
    @Bean
    public Clock clock() {
        return Clock.tick(Clock.systemDefaultZone(), Duration.ofSeconds(1));
    }
}
