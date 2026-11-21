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
import org.springframework.core.io.Resource;
import org.springframework.format.FormatterRegistry;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.beans.PropertyEditorSupport;
import java.io.IOException;

@Configuration
public class SpaWebConfig implements WebMvcConfigurer {

    private static final String STATIC_LOCATION = "classpath:/static/";
    private static final String INDEX_HTML = "index.html";
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
                    return file;
                }
            }
            Resource index = location.createRelative(INDEX_HTML);
            return index.isReadable() ? index : null;
        }
    }
}
