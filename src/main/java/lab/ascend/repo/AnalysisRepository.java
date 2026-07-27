package lab.ascend.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Repository
public class AnalysisRepository {
    private final JdbcTemplate jdbc;

    public AnalysisRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void save(long telegramId, int score, String json, boolean communityEligible) {
        jdbc.update("""
                        INSERT INTO analysis_reports (id, telegram_id, score, report_json, community_eligible)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                UUID.randomUUID().toString(), telegramId, score, json, communityEligible);
    }

    public boolean existsByTelegramId(long telegramId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM analysis_reports WHERE telegram_id = ?",
                Integer.class,
                telegramId
        );
        return count != null && count > 0;
    }

    public Map<String, Object> communityProgress() {
        List<ScoreRow> rows = jdbc.query("""
                        SELECT telegram_id, score, created_at
                        FROM analysis_reports
                        WHERE community_eligible = TRUE
                        ORDER BY telegram_id, created_at DESC, id DESC
                        """,
                (result, rowNum) -> new ScoreRow(
                        result.getLong("telegram_id"),
                        result.getInt("score"),
                        result.getTimestamp("created_at")
                ));

        Map<Long, List<ScoreRow>> byUser = new LinkedHashMap<>();
        for (ScoreRow row : rows) {
            byUser.computeIfAbsent(row.telegramId(), ignored -> new ArrayList<>(2));
            List<ScoreRow> scores = byUser.get(row.telegramId());
            if (scores.size() < 2) {
                scores.add(row);
            }
        }

        List<Integer> latestScores = new ArrayList<>();
        List<Integer> previousScores = new ArrayList<>();
        List<Integer> comparableLatestScores = new ArrayList<>();
        int improved = 0;
        for (List<ScoreRow> scores : byUser.values()) {
            if (scores.isEmpty()) continue;
            latestScores.add(scores.getFirst().score());
            if (scores.size() > 1) {
                int latest = scores.getFirst().score();
                int previous = scores.get(1).score();
                comparableLatestScores.add(latest);
                previousScores.add(previous);
                if (latest > previous) improved += 1;
            }
        }

        LocalDate today = LocalDate.now();
        long analyzedToday = rows.stream()
                .filter(row -> row.createdAt() != null && row.createdAt().toLocalDateTime().toLocalDate().equals(today))
                .count();
        double currentAverage = average(previousScores.isEmpty() ? latestScores : comparableLatestScores);
        double previousAverage = previousScores.isEmpty() ? currentAverage : average(previousScores);
        double delta = roundOne(currentAverage - previousAverage);
        int comparisonUsers = previousScores.size();
        int improvedPercent = comparisonUsers == 0 ? 0 : (int) Math.round(improved * 100.0 / comparisonUsers);

        return Map.of(
                "participants", latestScores.size(),
                "comparisonUsers", comparisonUsers,
                "analyzedToday", analyzedToday,
                "previousAverage", previousAverage,
                "currentAverage", currentAverage,
                "delta", delta,
                "improvedPercent", improvedPercent
        );
    }

    private static double average(List<Integer> values) {
        if (values.isEmpty()) return 0;
        return roundOne(values.stream().mapToInt(Integer::intValue).average().orElse(0));
    }

    private static double roundOne(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private record ScoreRow(long telegramId, int score, Timestamp createdAt) {
    }
}
