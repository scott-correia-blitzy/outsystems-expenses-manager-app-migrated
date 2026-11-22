package com.massmutual.expensesmanager.web;

import com.massmutual.expensesmanager.service.ApiException;
import com.massmutual.expensesmanager.service.AppUserPrincipal;
import com.massmutual.expensesmanager.service.LegacyMessages;
import com.massmutual.expensesmanager.service.ToolsService;
import com.massmutual.expensesmanager.service.model.MileageResult;
import com.massmutual.expensesmanager.service.model.UsdToEurResult;
import java.math.BigDecimal;
import org.springframework.beans.propertyeditors.CustomNumberEditor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tools")
public class ToolsController {

    private static final String RATE = "rate";

    private final ToolsService toolsService;

    public ToolsController(ToolsService toolsService) {
        this.toolsService = toolsService;
    }

    // Only an omitted rate takes the default; a blank one would otherwise bind to null and look omitted.
    @InitBinder(RATE)
    void rejectBlankRate(WebDataBinder binder) {
        binder.registerCustomEditor(BigDecimal.class, new CustomNumberEditor(BigDecimal.class, false) {
            @Override
            public void setAsText(String text) {
                if (!StringUtils.hasText(text)) {
                    throw ApiException.validation(RATE, LegacyMessages.RATE_ABOVE_ZERO);
                }
                super.setAsText(text);
            }
        });
    }

    @GetMapping("/usd-to-eur")
    public UsdToEurResult usdToEur(@AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam BigDecimal amount, @RequestParam(name = RATE, required = false) BigDecimal rate) {
        return toolsService.usdToEur(principal.toCaller(), amount, rate);
    }

    @GetMapping("/mileage")
    public MileageResult mileage(@AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam BigDecimal km) {
        return toolsService.mileage(principal.toCaller(), km);
    }
}
