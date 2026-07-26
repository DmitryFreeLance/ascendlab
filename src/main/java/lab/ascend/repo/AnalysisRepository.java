package lab.ascend.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public class AnalysisRepository {
    private final JdbcTemplate jdbc;

    public AnalysisRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void save(long telegramId, int score, String json) {
        jdbc.update("""
                        INSERT INTO analysis_reports (id, telegram_id, score, report_json)
                        VALUES (?, ?, ?, ?)
                        """,
                UUID.randomUUID().toString(), telegramId, score, json);
    }

    public boolean existsByTelegramId(long telegramId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM analysis_reports WHERE telegram_id = ?",
                Integer.class,
                telegramId
        );
        return count != null && count > 0;
    }
}
