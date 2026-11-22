package com.massmutual.expensesmanager.web;

import com.massmutual.expensesmanager.service.AppUserPrincipal;
import com.massmutual.expensesmanager.service.DashboardService;
import com.massmutual.expensesmanager.service.model.AdminDashboard;
import com.massmutual.expensesmanager.service.model.UserDashboard;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/user")
    public UserDashboard user(@AuthenticationPrincipal AppUserPrincipal principal) {
        return dashboardService.user(principal.toCaller());
    }

    @GetMapping("/admin")
    public AdminDashboard admin(@AuthenticationPrincipal AppUserPrincipal principal) {
        return dashboardService.admin(principal.toCaller());
    }
}
