package lab.ascend.repo;

import lab.ascend.domain.Plan;
import lab.ascend.domain.PlanOffer;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.Optional;

@Repository
public class PlanSettingsRepository {
    private final JdbcTemplate jdbc;

    public PlanSettingsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<PlanOffer> find(Plan plan) {
        try {
            return Optional.ofNullable(jdbc.queryForObject("""
                            SELECT code, rub, stars, usd, badge FROM plan_settings WHERE code = ?
                            """,
                    (rs, rowNum) -> new PlanOffer(
                            plan.code(),
                            plan.title(),
                            plan.subtitle(),
                            plan.days(),
                            rs.getInt("rub"),
                            rs.getInt("stars"),
                            rs.getBigDecimal("usd"),
                            rs.getString("badge") == null ? "" : rs.getString("badge")
                    ),
                    plan.code()));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    public void upsert(String code, int rub, int stars, BigDecimal usd, String badge) {
        int updated = jdbc.update("""
                        UPDATE plan_settings
                        SET rub = ?, stars = ?, usd = ?, badge = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE code = ?
                        """,
                rub, stars, usd, badge, code);
        if (updated == 0) {
            jdbc.update("""
                            INSERT INTO plan_settings (code, rub, stars, usd, badge)
                            VALUES (?, ?, ?, ?, ?)
                            """,
                    code, rub, stars, usd, badge);
        }
    }
}
