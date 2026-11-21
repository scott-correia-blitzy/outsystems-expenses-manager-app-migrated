package com.massmutual.expensesmanager.web;

import com.massmutual.expensesmanager.service.AppUserPrincipal;
import com.massmutual.expensesmanager.service.ToolsService;
import com.massmutual.expensesmanager.service.model.MileageResult;
import com.massmutual.expensesmanager.service.model.UsdToEurResult;
import java.math.BigDecimal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tools")
public class ToolsController {

    private final ToolsService toolsService;

    public ToolsController(ToolsService toolsService) {
        this.toolsService = toolsService;
    }

    @GetMapping("/usd-to-eur")
    public UsdToEurResult usdToEur(@AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam BigDecimal amount, @RequestParam(required = false) BigDecimal rate) {
        return toolsService.usdToEur(principal.toCaller(), amount, rate);
    }

    @GetMapping("/mileage")
    public MileageResult mileage(@AuthenticationPrincipal AppUserPrincipal principal,
            @RequestParam BigDecimal km) {
        return toolsService.mileage(principal.toCaller(), km);
    }
}
