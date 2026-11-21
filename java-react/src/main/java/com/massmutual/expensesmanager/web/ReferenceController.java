package com.massmutual.expensesmanager.web;

import com.massmutual.expensesmanager.service.ReferenceDataService;
import com.massmutual.expensesmanager.service.model.ReferenceData;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReferenceController {

    private final ReferenceDataService referenceDataService;

    public ReferenceController(ReferenceDataService referenceDataService) {
        this.referenceDataService = referenceDataService;
    }

    @GetMapping("/api/reference")
    public ReferenceData reference() {
        return referenceDataService.referenceData();
    }
}
