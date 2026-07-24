package lab.ascend.domain;

import java.math.BigDecimal;
import java.util.Arrays;

public enum Plan {
    INTRO("intro", "Ознакомительный", "1 анализ лица + знакомство с ботом", 1, 99, 49, new BigDecimal("1.20"), ""),
    WEEK("week", "1 неделя", "7 дней полного доступа", 7, 499, 249, new BigDecimal("5.60"), ""),
    MONTH("month", "1 месяц", "30 дней полного доступа", 30, 999, 499, new BigDecimal("11.20"), "Выгода -50%"),
    QUARTER("quarter", "3 месяца", "90 дней полного доступа", 90, 1999, 999, new BigDecimal("22.20"), "Хит");

    private final String code;
    private final String title;
    private final String subtitle;
    private final int days;
    private final int rub;
    private final int stars;
    private final BigDecimal usd;
    private final String badge;

    Plan(String code, String title, String subtitle, int days, int rub, int stars, BigDecimal usd, String badge) {
        this.code = code;
        this.title = title;
        this.subtitle = subtitle;
        this.days = days;
        this.rub = rub;
        this.stars = stars;
        this.usd = usd;
        this.badge = badge;
    }

    public String code() {
        return code;
    }

    public String title() {
        return title;
    }

    public String subtitle() {
        return subtitle;
    }

    public int days() {
        return days;
    }

    public int rub() {
        return rub;
    }

    public int stars() {
        return stars;
    }

    public BigDecimal usd() {
        return usd;
    }

    public String badge() {
        return badge;
    }

    public static Plan byCode(String code) {
        return Arrays.stream(values())
                .filter(plan -> plan.code.equalsIgnoreCase(code))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown plan: " + code));
    }
}
