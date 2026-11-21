package com.massmutual.expensesmanager.support;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublisher;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.MissingNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

public final class ApiClient implements AutoCloseable {

    public static final String CSRF_COOKIE = "XSRF-TOKEN";
    public static final String CSRF_HEADER = "X-XSRF-TOKEN";
    public static final String SESSION_COOKIE = "JSESSIONID";

    public static final ObjectMapper MAPPER = JsonMapper.builder()
            .findAndAddModules()
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    private static final Set<String> WRITE_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(60);
    private static final String ME_PATH = "/api/auth/me";
    private static final String LOGIN_PATH = "/api/auth/login";
    private static final String LOGOUT_PATH = "/api/auth/logout";
    private static final String JSON_CONTENT_TYPE = "application/json";
    private static final String OCTET_STREAM = "application/octet-stream";
    private static final String CRLF = "\r\n";
    private static final int TEXT_LIMIT = 500;

    private final String baseUrl;
    private final HttpClient httpClient;
    private final Map<String, String> cookies = new LinkedHashMap<>();

    public ApiClient(int port) {
        this("http://localhost:" + port);
    }

    public ApiClient(String baseUrl) {
        String url = Objects.requireNonNull(baseUrl, "baseUrl");
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        this.baseUrl = url;
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                // Tests assert raw statuses, so a redirect must surface rather than be followed.
                .followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(CONNECT_TIMEOUT)
                .build();
    }

    public static ApiClient loggedIn(int port, String username, String password) {
        ApiClient client = new ApiClient(port);
        try {
            Response response = client.login(username, password);
            if (response.status() != 200) {
                throw new IllegalStateException(
                        "Login failed for " + username + ": HTTP " + response.status() + " " + response.text());
            }
            return client;
        } catch (Throwable e) {
            try {
                client.close();
            } catch (Throwable closeFailure) {
                e.addSuppressed(closeFailure);
            }
            throw e;
        }
    }

    public String baseUrl() {
        return baseUrl;
    }

    @Override
    public void close() {
        httpClient.close();
    }

    public Response get(String path) {
        return send("GET", path, null);
    }

    public Response post(String path) {
        return send("POST", path, null);
    }

    public Response postJson(String path, Object body) {
        return send("POST", path, body);
    }

    public Response putJson(String path, Object body) {
        return send("PUT", path, body);
    }

    public Response delete(String path) {
        return send("DELETE", path, null);
    }

    public Response send(String method, String path, Object jsonBody) {
        String verb = normalizeMethod(method);
        Map<String, String> headers = WRITE_METHODS.contains(verb) ? Map.of(CSRF_HEADER, csrfToken()) : Map.of();
        return exchange(verb, path, jsonPublisher(jsonBody), jsonContentType(jsonBody), headers);
    }

    public Response sendWithoutCsrf(String method, String path, Object jsonBody) {
        return sendWithoutCsrf(method, path, jsonBody, Map.of());
    }

    public Response sendWithoutCsrf(String method, String path, Object jsonBody, Map<String, String> extraHeaders) {
        Map<String, String> headers = extraHeaders == null ? Map.of() : extraHeaders;
        return exchange(normalizeMethod(method), path, jsonPublisher(jsonBody), jsonContentType(jsonBody), headers);
    }

    public Response login(String username, String password) {
        return login(username, password, false);
    }

    public Response login(String username, String password, boolean rememberMe) {
        ObjectNode body = object();
        body.put("username", username);
        body.put("password", password);
        body.put("rememberMe", rememberMe);
        return postJson(LOGIN_PATH, body);
    }

    public Response logout() {
        return post(LOGOUT_PATH);
    }

    public Response logoutWithoutCsrf() {
        return sendWithoutCsrf("POST", LOGOUT_PATH, null);
    }

    public Response me() {
        return get(ME_PATH);
    }

    public Response putFile(String path, String filename, String contentType, byte[] bytes) {
        String boundary = "ApiClientBoundary" + UUID.randomUUID().toString().replace("-", "");
        byte[] body = multipartBody(boundary, filename, contentType, bytes);
        return exchange("PUT", path, BodyPublishers.ofByteArray(body),
                "multipart/form-data; boundary=" + boundary, Map.of(CSRF_HEADER, csrfToken()));
    }

    public Optional<String> cookie(String name) {
        synchronized (cookies) {
            return Optional.ofNullable(cookies.get(name));
        }
    }

    public void removeCookie(String name) {
        synchronized (cookies) {
            cookies.remove(name);
        }
    }

    public void clearCookies() {
        synchronized (cookies) {
            cookies.clear();
        }
    }

    public static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    public static ObjectNode object() {
        return MAPPER.createObjectNode();
    }

    private String csrfToken() {
        if (cookie(CSRF_COOKIE).isEmpty()) {
            exchange("GET", ME_PATH, BodyPublishers.noBody(), null, Map.of());
        }
        // Read per write, never cached: login rotates the token and logout deletes it.
        return cookie(CSRF_COOKIE).orElseThrow(() -> new IllegalStateException("Server issued no XSRF-TOKEN cookie"));
    }

    private Response exchange(String method, String path, BodyPublisher body, String contentType,
            Map<String, String> headers) {
        HttpRequest.Builder request = HttpRequest.newBuilder(uri(path))
                .timeout(REQUEST_TIMEOUT)
                .method(method, body);
        // No default Accept: invoice downloads are binary and SPA deep links are HTML.
        if (contentType != null) {
            request.header("Content-Type", contentType);
        }
        cookieHeader().ifPresent(value -> request.header("Cookie", value));
        headers.forEach(request::setHeader);

        HttpResponse<byte[]> response;
        try {
            response = httpClient.send(request.build(), BodyHandlers.ofByteArray());
        } catch (IOException e) {
            throw new UncheckedIOException(method + " " + path + " failed", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted during " + method + " " + path, e);
        }
        storeCookies(response.headers().allValues("set-cookie"));
        return new Response(response.statusCode(), response.headers(), response.body());
    }

    private URI uri(String path) {
        Objects.requireNonNull(path, "path");
        if (path.startsWith("http")) {
            return URI.create(path);
        }
        return URI.create(path.startsWith("/") ? baseUrl + path : baseUrl + "/" + path);
    }

    private Optional<String> cookieHeader() {
        synchronized (cookies) {
            if (cookies.isEmpty()) {
                return Optional.empty();
            }
            return Optional.of(cookies.entrySet().stream()
                    .map(entry -> entry.getKey() + "=" + entry.getValue())
                    .collect(Collectors.joining("; ")));
        }
    }

    private void storeCookies(List<String> setCookieHeaders) {
        synchronized (cookies) {
            setCookieHeaders.forEach(this::applySetCookie);
        }
    }

    private void applySetCookie(String setCookie) {
        String[] parts = setCookie.split(";");
        int separator = parts[0].indexOf('=');
        if (separator < 0) {
            return;
        }
        String name = parts[0].substring(0, separator).trim();
        String value = parts[0].substring(separator + 1).trim();
        if (name.isEmpty()) {
            return;
        }
        boolean expired = value.isEmpty();
        for (int i = 1; i < parts.length; i++) {
            String attribute = parts[i].trim();
            int equals = attribute.indexOf('=');
            if (equals > 0 && attribute.substring(0, equals).trim().equalsIgnoreCase("Max-Age")) {
                expired |= isNonPositive(attribute.substring(equals + 1).trim());
            }
        }
        if (expired) {
            cookies.remove(name);
        } else {
            cookies.put(name, value);
        }
    }

    private static boolean isNonPositive(String maxAge) {
        try {
            return Long.parseLong(maxAge) <= 0;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    private static String normalizeMethod(String method) {
        return Objects.requireNonNull(method, "method").trim().toUpperCase(Locale.ROOT);
    }

    private static String jsonContentType(Object body) {
        return body == null ? null : JSON_CONTENT_TYPE;
    }

    private static BodyPublisher jsonPublisher(Object body) {
        if (body == null) {
            return BodyPublishers.noBody();
        }
        if (body instanceof String text) {
            return BodyPublishers.ofString(text, StandardCharsets.UTF_8);
        }
        try {
            return BodyPublishers.ofByteArray(MAPPER.writeValueAsBytes(body));
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Cannot serialize a " + body.getClass().getName() + " as JSON", e);
        }
    }

    private static byte[] multipartBody(String boundary, String filename, String contentType, byte[] bytes) {
        StringBuilder head = new StringBuilder()
                .append("--").append(boundary).append(CRLF)
                .append("Content-Disposition: form-data; name=\"file\"");
        if (filename != null) {
            boolean printable = filename.codePoints().allMatch(ApiClient::isPrintableAscii);
            String plain = printable ? filename : filename.codePoints()
                    .map(c -> isPrintableAscii(c) ? c : '_')
                    .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                    .toString();
            head.append("; filename=\"").append(plain.replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
            // CR/LF would end the part header and raw UTF-8 has no declared charset, so such names use filename*.
            if (!printable) {
                head.append("; filename*=UTF-8''").append(encode(filename).replace("*", "%2A"));
            }
        }
        head.append(CRLF)
                .append("Content-Type: ").append(contentType == null ? OCTET_STREAM : contentType).append(CRLF)
                .append(CRLF);
        String tail = CRLF + "--" + boundary + "--" + CRLF;

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(head.toString().getBytes(StandardCharsets.UTF_8));
        out.writeBytes(bytes == null ? new byte[0] : bytes);
        out.writeBytes(tail.getBytes(StandardCharsets.UTF_8));
        return out.toByteArray();
    }

    private static boolean isPrintableAscii(int c) {
        return c >= ' ' && c <= '~';
    }

    private static String abbreviate(String text) {
        return text.length() <= TEXT_LIMIT ? text : text.substring(0, TEXT_LIMIT - 3) + "...";
    }

    public record Response(int status, HttpHeaders headers, byte[] body) {

        public Response {
            headers = headers == null ? HttpHeaders.of(Map.of(), (name, value) -> true) : headers;
            body = body == null ? new byte[0] : body;
        }

        public String header(String name) {
            return headers.firstValue(name).orElse(null);
        }

        public List<String> headerValues(String name) {
            return headers.allValues(name);
        }

        public String text() {
            return new String(body, StandardCharsets.UTF_8);
        }

        public JsonNode json() {
            if (body.length == 0) {
                return MissingNode.getInstance();
            }
            try {
                return MAPPER.readTree(body);
            } catch (IOException e) {
                throw new IllegalStateException("Not JSON: HTTP " + status + " " + abbreviate(text()), e);
            }
        }

        public <T> T as(Class<T> type) {
            try {
                return MAPPER.readValue(body, type);
            } catch (IOException e) {
                throw new IllegalStateException(cannotRead(type.getTypeName()), e);
            }
        }

        public <T> T as(TypeReference<T> type) {
            try {
                return MAPPER.readValue(body, type);
            } catch (IOException e) {
                throw new IllegalStateException(cannotRead(type.getType().getTypeName()), e);
            }
        }

        @Override
        public String toString() {
            return abbreviate("HTTP " + status + " " + text());
        }

        private String cannotRead(String typeName) {
            return "Cannot read " + typeName + " from HTTP " + status + " " + abbreviate(text());
        }
    }
}
