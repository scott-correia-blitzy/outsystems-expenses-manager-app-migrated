package com.massmutual.expensesmanager.web;

import com.massmutual.expensesmanager.domain.ReportKind;
import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.LegacyMessages;
import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.core.io.AbstractResource;
import org.springframework.core.io.Resource;
import org.springframework.format.FormatterRegistry;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.HttpResource;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.beans.PropertyEditorSupport;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URL;
import java.nio.channels.ReadableByteChannel;
import java.nio.charset.Charset;
import java.time.Duration;

@Configuration
public class SpaWebConfig implements WebMvcConfigurer {

    private static final String STATIC_LOCATION = "classpath:/static/";
    private static final String INDEX_HTML = "index.html";
    private static final String HASHED_ASSETS = "assets/";
    private static final String KIND_FIELD = "kind";

    private static final Converter<String, ReportKind> REPORT_KIND = source -> ReportKind.fromPath(source.trim())
            .orElseThrow(() -> ApiException.validation(KIND_FIELD, LegacyMessages.SELECT_REPORT_TYPE));

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations(STATIC_LOCATION)
                .resourceChain(true)
                .addResolver(new SpaResourceResolver());
    }

    @Override
    public void addFormatters(FormatterRegistry registry) {
        registry.addConverter(String.class, ReportKind.class, REPORT_KIND);
    }

    // After a converter rejects a value, Spring retries enums by constant name, so "EXPENSE" would slip through.
    @ControllerAdvice
    static class StrictReportKindBinding {

        @InitBinder
        void bindReportKind(WebDataBinder binder) {
            binder.registerCustomEditor(ReportKind.class, new PropertyEditorSupport() {
                @Override
                public void setAsText(String text) {
                    setValue(REPORT_KIND.convert(text));
                }
            });
        }
    }

    // Replaces Boot's error page: a direct visit is one more SPA path, while a container error dispatch gets JSON.
    @Controller
    static class SpaErrorController implements ErrorController {

        private final JsonSecurityHandlers jsonSecurityHandlers;

        SpaErrorController(JsonSecurityHandlers jsonSecurityHandlers) {
            this.jsonSecurityHandlers = jsonSecurityHandlers;
        }

        @RequestMapping("${server.error.path:/error}")
        void error(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
            if (request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE) instanceof Integer) {
                // An error body must not keep the caching the failed handler set, such as an asset's year-long max-age.
                response.setHeader(HttpHeaders.CACHE_CONTROL, "no-cache, no-store, max-age=0, must-revalidate");
                response.setHeader(HttpHeaders.PRAGMA, "no-cache");
                response.setHeader(HttpHeaders.EXPIRES, "0");
                jsonSecurityHandlers.write(response, jsonSecurityHandlers.errorDispatchBody(request));
                return;
            }
            request.getRequestDispatcher("/" + INDEX_HTML).forward(request, response);
        }
    }

    private static final class SpaResourceResolver extends PathResourceResolver {

        @Override
        protected Resource getResource(String resourcePath, Resource location) throws IOException {
            // Unknown API paths must reach the JSON 404 handler rather than load the SPA.
            if (resourcePath.equals("api") || resourcePath.startsWith("api/")) {
                return null;
            }
            if (!resourcePath.isEmpty() && !resourcePath.endsWith("/")) {
                Resource file = super.getResource(resourcePath, location);
                if (file != null) {
                    return resourcePath.startsWith(HASHED_ASSETS) ? new ImmutableAsset(file) : file;
                }
            }
            Resource index = location.createRelative(INDEX_HTML);
            return index.isReadable() ? index : null;
        }
    }

    // Vite names every assets/ file by its content hash, so only index.html must be fetched fresh.
    private static final class ImmutableAsset extends AbstractResource implements HttpResource {

        // Private, as a cookie-less client's response also sets its CSRF token cookie.
        private static final String CACHE_CONTROL =
                CacheControl.maxAge(Duration.ofDays(365)).cachePrivate().immutable().getHeaderValue();

        private final Resource file;

        ImmutableAsset(Resource file) {
            this.file = file;
        }

        @Override
        public HttpHeaders getResponseHeaders() {
            HttpHeaders headers = new HttpHeaders();
            headers.setCacheControl(CACHE_CONTROL);
            return headers;
        }

        @Override
        public boolean exists() {
            return file.exists();
        }

        @Override
        public boolean isReadable() {
            return file.isReadable();
        }

        @Override
        public boolean isOpen() {
            return file.isOpen();
        }

        @Override
        public boolean isFile() {
            return file.isFile();
        }

        @Override
        public URL getURL() throws IOException {
            return file.getURL();
        }

        @Override
        public URI getURI() throws IOException {
            return file.getURI();
        }

        @Override
        public File getFile() throws IOException {
            return file.getFile();
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return file.getInputStream();
        }

        @Override
        public ReadableByteChannel readableChannel() throws IOException {
            return file.readableChannel();
        }

        @Override
        public byte[] getContentAsByteArray() throws IOException {
            return file.getContentAsByteArray();
        }

        @Override
        public String getContentAsString(Charset charset) throws IOException {
            return file.getContentAsString(charset);
        }

        @Override
        public long contentLength() throws IOException {
            return file.contentLength();
        }

        @Override
        public long lastModified() throws IOException {
            return file.lastModified();
        }

        @Override
        public Resource createRelative(String relativePath) throws IOException {
            return file.createRelative(relativePath);
        }

        @Override
        public String getFilename() {
            return file.getFilename();
        }

        @Override
        public String getDescription() {
            return file.getDescription();
        }
    }
}
