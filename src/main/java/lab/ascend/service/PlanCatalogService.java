package lab.ascend.service;

import lab.ascend.domain.Plan;
import lab.ascend.domain.PlanOffer;
import lab.ascend.repo.PlanSettingsRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

@Service
public class PlanCatalogService {
    private final PlanSettingsRepository settings;

    public PlanCatalogService(PlanSettingsRepository settings) {
        this.settings = settings;
    }

    public List<PlanOffer> all() {
        return Arrays.stream(Plan.values()).map(this::offer).toList();
    }

    public PlanOffer get(String code) {
        return offer(Plan.byCode(code));
    }

    public PlanOffer update(String code, int rub, int stars, BigDecimal usd, String badge) {
        Plan plan = Plan.byCode(code);
        int safeRub = Math.max(1, rub);
        int safeStars = Math.max(1, stars);
        BigDecimal safeUsd = usd == null ? plan.usd() : usd.max(new BigDecimal("0.01"));
        settings.upsert(plan.code(), safeRub, safeStars, safeUsd, badge == null ? "" : badge.trim());
        return get(plan.code());
    }

    private PlanOffer offer(Plan plan) {
        return settings.find(plan).orElseGet(() -> PlanOffer.fromDefault(plan));
    }
}
