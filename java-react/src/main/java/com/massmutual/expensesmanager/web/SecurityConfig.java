package com.massmutual.expensesmanager.web;

import com.massmutual.expensesmanager.domain.Role;
import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.AppUserDetailsService;
import com.massmutual.expensesmanager.service.LegacyMessages;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.catalina.Context;
import org.apache.catalina.Manager;
import org.apache.catalina.Session;
import org.apache.catalina.connector.Request;
import org.apache.catalina.connector.Response;
import org.apache.catalina.util.SessionConfig;
import org.apache.catalina.valves.ValveBase;
import org.apache.coyote.InputBuffer;
import org.apache.tomcat.util.buf.EncodedSolidusHandling;
import org.apache.tomcat.util.net.ApplicationBufferHandler;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
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
import org.springframework.security.config.annotation.web.configuration.WebSecurityCustomizer;
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
    public WebSecurityCustomizer webSecurityCustomizer(JsonSecurityHandlers jsonSecurityHandlers) {
        return web -> web.requestRejectedHandler(jsonSecurityHandlers);
    }

    // Tomcat would reject encoded (back)slashes with an HTML 400; passed through, the firewall rejects them as JSON.
    @Bean
    public WebServerFactoryCustomizer<TomcatServletWebServerFactory> encodedSlashPassThrough() {
        return factory -> factory.addConnectorCustomizers(connector -> {
            connector.setEncodedSolidusHandling(EncodedSolidusHandling.PASS_THROUGH.getValue());
            connector.setEncodedReverseSolidusHandling(EncodedSolidusHandling.PASS_THROUGH.getValue());
        });
    }

    // Tomcat refuses TRACE and malformed or oversized requests before app code runs; TRACE and /api ones get JSON.
    @Bean
    public WebServerFactoryCustomizer<TomcatServletWebServerFactory> connectorRejectionBody(
            ObjectProvider<JsonSecurityHandlers> jsonSecurityHandlers) {
        return factory -> factory.addContextCustomizers(context -> context.getParent().getPipeline()
                .addValve(new ConnectorRejectionValve(context, jsonSecurityHandlers)));
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
                        .addLogoutHandler((request, response, authentication) ->
                                response.addCookie(AuthController.sessionCookie(request, null, 0))))
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

    // Writes its answer before Boot's HTML error report runs, whichever valve comes first, so nothing replaces it.
    private static final class ConnectorRejectionValve extends ValveBase {

        private final Context context;
        private final ObjectProvider<JsonSecurityHandlers> jsonSecurityHandlers;

        private ConnectorRejectionValve(Context context, ObjectProvider<JsonSecurityHandlers> jsonSecurityHandlers) {
            super(true);
            this.context = context;
            this.jsonSecurityHandlers = jsonSecurityHandlers;
        }

        @Override
        public void invoke(Request request, Response response) throws IOException, ServletException {
            // The connector refuses TRACE after mapping a Context; once reported, passing it on would run the app.
            if (request.getContext() != null && response.isError() && !response.isCommitted()
                    && HttpMethod.TRACE.name().equalsIgnoreCase(request.getMethod())) {
                response.setSuspended(false);
                response.getCoyoteResponse().getMimeHeaders().removeHeader(HttpHeaders.ALLOW);
                jsonSecurityHandlers.getObject().reject(request.getRequest(), response.getResponse());
                response.setErrorReported();
                return;
            }
            // An error before any Context was mapped means the connector refused the request line or its headers.
            if (request.getContext() == null && response.isError() && !response.isCommitted()) {
                RootContextRequest rootRequest = new RootContextRequest(request, context);
                if (JsonSecurityHandlers.isApiPath(rootRequest)) {
                    // Undoes sendError's suspension; an unreported error makes the error valve drop the connection.
                    response.setSuspended(false);
                    // Tomcat's 400 would close the connection too; a partly read request leaves it unusable.
                    response.setHeader(HttpHeaders.CONNECTION, "close");
                    jsonSecurityHandlers.getObject()
                            .reject(rootRequest, new RootContextResponse(response, context, rootRequest));
                    response.setErrorReported();
                }
            }
            getNext().invoke(request, response);
        }
    }

    // A refused URI maps no Context, so the root application's session store is read here and never adds a session.
    private static final class RootContextRequest extends HttpServletRequestWrapper {

        private static final Pattern ABSOLUTE_FORM =
                Pattern.compile("https?://[^/]*+(/.*)", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

        private final Context context;
        private final InputBuffer connectorInput;
        // Tomcat reports attribute removal to the mapped Context, so changes stay here; null marks a removal.
        private final Map<String, Object> attributes = new HashMap<>();

        private RootContextRequest(Request request, Context context) {
            super(request);
            this.context = context;
            this.connectorInput = request.getCoyoteRequest().getInputBuffer();
        }

        @Override
        public String getContextPath() {
            return context.getPath();
        }

        @Override
        public String getServletPath() {
            return "";
        }

        // Tomcat leaves the URI unset when it refuses a request line mid-parse; the line read so far is still buffered.
        @Override
        public String getRequestURI() {
            String uri = super.getRequestURI();
            return uri != null ? uri : bufferedRequestPath();
        }

        // Parsed as Tomcat does: blank lines, method, spaces, then the target up to its query or the buffer's end.
        private String bufferedRequestPath() {
            ByteBuffer buffer = connectorInput instanceof ApplicationBufferHandler handler
                    ? handler.getByteBuffer() : null;
            if (buffer == null) {
                return null;
            }
            int method = skip(buffer, 0, "\r\n", true);
            int target = skip(buffer, skip(buffer, method, " \t\r\n", false), " \t", true);
            byte[] bytes = new byte[skip(buffer, target, " \t\r\n?", false) - target];
            buffer.get(target, bytes);
            String path = new String(bytes, StandardCharsets.ISO_8859_1);
            Matcher absoluteForm = ABSOLUTE_FORM.matcher(path);
            return path.startsWith("/") ? path : absoluteForm.matches() ? absoluteForm.group(1) : null;
        }

        private static int skip(ByteBuffer buffer, int from, String bytes, boolean members) {
            int index = from;
            while (index < buffer.limit() && (bytes.indexOf(buffer.get(index)) >= 0) == members) {
                index++;
            }
            return index;
        }

        @Override
        public Object getAttribute(String name) {
            return attributes.containsKey(name) ? attributes.get(name) : super.getAttribute(name);
        }

        @Override
        public Enumeration<String> getAttributeNames() {
            Set<String> names = new LinkedHashSet<>(Collections.list(super.getAttributeNames()));
            attributes.forEach((name, value) -> {
                if (value == null) {
                    names.remove(name);
                } else {
                    names.add(name);
                }
            });
            return Collections.enumeration(names);
        }

        @Override
        public void setAttribute(String name, Object value) {
            attributes.put(Objects.requireNonNull(name, "name"), value);
        }

        @Override
        public void removeAttribute(String name) {
            attributes.put(name, null);
        }

        @Override
        public HttpSession getSession() {
            return getSession(false);
        }

        @Override
        public HttpSession getSession(boolean create) {
            Manager manager = context.getManager();
            Cookie[] cookies = getCookies();
            if (manager == null || cookies == null) {
                return null;
            }
            String sessionCookieName = SessionConfig.getSessionCookieName(context);
            try {
                for (Cookie cookie : cookies) {
                    Session session = sessionCookieName.equals(cookie.getName())
                            ? manager.findSession(cookie.getValue()) : null;
                    if (session != null && session.isValid()) {
                        return session.getSession();
                    }
                }
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
            return null;
        }
    }

    // Tomcat formats cookies with the mapped Context's processor, which a refused request lacks.
    private static final class RootContextResponse extends HttpServletResponseWrapper {

        private final Context context;
        private final HttpServletRequest request;

        private RootContextResponse(Response response, Context context, HttpServletRequest request) {
            super(response);
            this.context = context;
            this.request = request;
        }

        @Override
        public void addCookie(Cookie cookie) {
            addHeader(HttpHeaders.SET_COOKIE, context.getCookieProcessor().generateHeader(cookie, request));
        }
    }
}
