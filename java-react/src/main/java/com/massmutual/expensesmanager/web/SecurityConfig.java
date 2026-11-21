package com.massmutual.expensesmanager.web;

import com.massmutual.expensesmanager.domain.Role;
import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.AppUserDetailsService;
import com.massmutual.expensesmanager.service.LegacyMessages;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.header.HeaderWriterFilter;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final String LOGOUT_URL = "/api/auth/logout";

    private static final String USER = Role.User.authority();
    private static final String APPROVER = Role.Approver.authority();
    private static final String ADMINISTRATOR = Role.Administrator.authority();

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AppUserDetailsService userDetailsService,
            PasswordEncoder passwordEncoder) {
        // Not a bean of its own: a provider bean makes Spring Security warn that the UserDetailsService goes unused.
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return new ProviderManager(provider);
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public CsrfTokenRepository csrfTokenRepository() {
        return CookieCsrfTokenRepository.withHttpOnlyFalse();
    }

    @Bean
    public CsrfTokenRequestHandler csrfTokenRequestHandler() {
        return new SpaCsrfTokenRequestHandler();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, JsonSecurityHandlers jsonSecurityHandlers,
            SecurityContextRepository securityContextRepository, CsrfTokenRepository csrfTokenRepository,
            CsrfTokenRequestHandler csrfTokenRequestHandler, ApplicationAvailability availability) throws Exception {
        ReadinessGate readinessGate = new ReadinessGate(availability, csrfTokenRepository, jsonSecurityHandlers);
        http
                .addFilterAfter(readinessGate, HeaderWriterFilter.class)
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfTokenRepository)
                        .csrfTokenRequestHandler(csrfTokenRequestHandler))
                .securityContext(context -> context.securityContextRepository(securityContextRepository))
                // Anonymous API calls answered 401 must not open a session just to remember the request.
                .requestCache(cache -> cache.requestCache(new NullRequestCache()))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(jsonSecurityHandlers)
                        .accessDeniedHandler(jsonSecurityHandlers))
                .logout(logout -> logout
                        .logoutUrl(LOGOUT_URL)
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT))
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .deleteCookies("JSESSIONID"))
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        // Open to anonymous callers so the SPA can still clear its state once the session has expired.
                        .requestMatchers(HttpMethod.POST, LOGOUT_URL).permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/me", "/api/reference").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/reports").hasAnyAuthority(USER, APPROVER, ADMINISTRATOR)
                        .requestMatchers(HttpMethod.POST, "/api/reports").hasAuthority(USER)
                        .requestMatchers(HttpMethod.GET, "/api/reports/*/*").hasAnyAuthority(USER, ADMINISTRATOR)
                        .requestMatchers(HttpMethod.PUT, "/api/reports/*/*").hasAuthority(USER)
                        .requestMatchers(HttpMethod.DELETE, "/api/reports/*/*").hasAuthority(USER)
                        .requestMatchers(HttpMethod.POST, "/api/reports/*/*/submit", "/api/reports/*/*/lines")
                        .hasAuthority(USER)
                        .requestMatchers(HttpMethod.POST, "/api/reports/*/*/decision").hasAuthority(ADMINISTRATOR)
                        .requestMatchers(HttpMethod.PUT, "/api/lines/*/*", "/api/lines/*/*/invoice").hasAuthority(USER)
                        .requestMatchers(HttpMethod.DELETE, "/api/lines/*/*").hasAuthority(USER)
                        .requestMatchers(HttpMethod.GET, "/api/lines/*/*/invoice").hasAnyAuthority(USER, ADMINISTRATOR)
                        .requestMatchers(HttpMethod.GET, "/api/dashboard/user").hasAuthority(USER)
                        .requestMatchers(HttpMethod.GET, "/api/dashboard/admin").hasAuthority(ADMINISTRATOR)
                        .requestMatchers(HttpMethod.GET, "/api/blog", "/api/blog/**").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/blog").hasAuthority(ADMINISTRATOR)
                        .requestMatchers(HttpMethod.PUT, "/api/blog/*").hasAuthority(ADMINISTRATOR)
                        .requestMatchers(HttpMethod.GET, "/api/tools/**").hasAnyAuthority(USER, APPROVER, ADMINISTRATOR)
                        .requestMatchers("/api/**").authenticated()
                        // SPA routes and static assets; the SPA guards its own routes by role.
                        .anyRequest().permitAll());
        return http.build();
    }

    // Demo data is seeded after the connector opens, so until then a valid login would be refused as invalid.
    private static final class ReadinessGate extends OncePerRequestFilter {

        private static final RequestMatcher API_PATHS = PathPatternRequestMatcher.withDefaults().matcher("/api/**");
        private static final String RETRY_AFTER_SECONDS = "1";
        private static final ErrorResponse STARTING = ErrorResponse.of(
                HttpStatus.SERVICE_UNAVAILABLE.value(), ApiException.SERVICE_UNAVAILABLE, LegacyMessages.STARTING);

        private final ApplicationAvailability availability;
        private final CsrfTokenRepository csrfTokenRepository;
        private final JsonSecurityHandlers jsonSecurityHandlers;

        ReadinessGate(ApplicationAvailability availability, CsrfTokenRepository csrfTokenRepository,
                JsonSecurityHandlers jsonSecurityHandlers) {
            this.availability = availability;
            this.csrfTokenRepository = csrfTokenRepository;
            this.jsonSecurityHandlers = jsonSecurityHandlers;
        }

        @Override
        protected boolean shouldNotFilter(HttpServletRequest request) {
            return !API_PATHS.matches(request);
        }

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            if (availability.getReadinessState() == ReadinessState.ACCEPTING_TRAFFIC) {
                chain.doFilter(request, response);
                return;
            }
            // The CSRF filter never sees this request, so its token cookie is issued here for the client's retry.
            csrfTokenRepository.loadDeferredToken(request, response).get();
            response.setHeader(HttpHeaders.RETRY_AFTER, RETRY_AFTER_SECONDS);
            jsonSecurityHandlers.write(response, STARTING);
        }
    }
}
