package lab.ascend.domain;

import java.math.BigDecimal;

public record PlanOffer(
        String code,
        String title,
        String subtitle,
        int days,
        int rub,
        int stars,
        BigDecimal usd,
        String badge
) {
    public static PlanOffer fromDefault(Plan plan) {
        return new PlanOffer(
                plan.code(),
                plan.title(),
                plan.subtitle(),
                plan.days(),
                plan.rub(),
                plan.stars(),
                plan.usd(),
                plan.badge()
        );
    }
}
