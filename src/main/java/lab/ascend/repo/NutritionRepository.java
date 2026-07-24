package lab.ascend.repo;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public class NutritionRepository {
    private final JdbcTemplate jdbc;

    public NutritionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void add(long telegramId, String mealType, String title, int calories, int protein, int fat, int carbs) {
        jdbc.update("""
                        INSERT INTO nutrition_logs (id, telegram_id, meal_type, title, calories, protein, fat, carbs)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                UUID.randomUUID().toString(), telegramId, mealType, title, calories, protein, fat, carbs);
    }

    public List<NutritionLog> today(long telegramId) {
        return jdbc.query("""
                        SELECT meal_type, title, calories, protein, fat, carbs, created_at
                        FROM nutrition_logs
                        WHERE telegram_id = ? AND CAST(created_at AS DATE) = CURRENT_DATE
                        ORDER BY created_at DESC
                        """,
                (rs, rowNum) -> new NutritionLog(
                        rs.getString("meal_type"),
                        rs.getString("title"),
                        rs.getInt("calories"),
                        rs.getInt("protein"),
                        rs.getInt("fat"),
                        rs.getInt("carbs")
                ),
                telegramId);
    }

    public record NutritionLog(String mealType, String title, int calories, int protein, int fat, int carbs) {
    }
}
