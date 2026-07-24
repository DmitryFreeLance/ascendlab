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
}
