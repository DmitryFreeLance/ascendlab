package lab.ascend.service;

import lab.ascend.repo.NutritionRepository;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.Base64;
import java.util.Map;

@Service
public class NutritionService {
    private final NutritionRepository nutrition;
    private final AiService ai;

    public NutritionService(NutritionRepository nutrition, AiService ai) {
        this.nutrition = nutrition;
        this.ai = ai;
    }

    public Map<String, Object> add(long telegramId, String mealType, String text, boolean pro) {
        AiService.NutritionEstimate estimate = pro
                ? ai.estimateMealWithAi(text, mealType).orElseGet(() -> heuristic(text))
                : heuristic(text);
        nutrition.add(telegramId, mealType, estimate.title(), estimate.calories(), estimate.protein(), estimate.fat(), estimate.carbs());
        return summary(telegramId);
    }

    public Map<String, Object> addPhoto(long telegramId,
                                        String mealType,
                                        String text,
                                        String contentType,
                                        byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new IllegalStateException("Сначала загрузи фото тарелки");
        }
        String dataUrl = "data:" + contentType + ";base64," + Base64.getEncoder().encodeToString(bytes);
        AiService.NutritionEstimate estimate = ai.estimateMealPhotoWithAi(dataUrl, text, mealType)
                .orElseThrow(() -> new IllegalStateException("Не удалось распознать еду на фото. Попробуй кадр сверху при хорошем свете."));
        nutrition.add(telegramId, mealType, estimate.title(), estimate.calories(), estimate.protein(), estimate.fat(), estimate.carbs());
        return summary(telegramId);
    }

    public Map<String, Object> summary(long telegramId) {
        var logs = nutrition.today(telegramId);
        int calories = logs.stream().mapToInt(NutritionRepository.NutritionLog::calories).sum();
        int protein = logs.stream().mapToInt(NutritionRepository.NutritionLog::protein).sum();
        int fat = logs.stream().mapToInt(NutritionRepository.NutritionLog::fat).sum();
        int carbs = logs.stream().mapToInt(NutritionRepository.NutritionLog::carbs).sum();
        return Map.of(
                "targetCalories", 2200,
                "calories", calories,
                "protein", protein,
                "fat", fat,
                "carbs", carbs,
                "waterMl", 0,
                "logs", logs
        );
    }

    public Map<String, Object> history(long telegramId) {
        return Map.of("days", nutrition.history(telegramId));
    }

    private AiService.NutritionEstimate heuristic(String text) {
        String normalized = text == null ? "" : text.toLowerCase(Locale.ROOT);
        int calories = 260;
        int protein = 18;
        int fat = 10;
        int carbs = 22;
        if (normalized.contains("яй")) {
            calories += 160;
            protein += 13;
            fat += 11;
        }
        if (normalized.contains("тост") || normalized.contains("хлеб")) {
            calories += 110;
            carbs += 20;
        }
        if (normalized.contains("авокад")) {
            calories += 160;
            fat += 15;
        }
        if (normalized.contains("кур") || normalized.contains("гов") || normalized.contains("рыб")) {
            calories += 220;
            protein += 32;
            fat += 8;
        }
        if (normalized.contains("рис") || normalized.contains("паста") || normalized.contains("греч")) {
            calories += 210;
            carbs += 42;
        }
        String title = text == null || text.isBlank() ? "Приём пищи" : text.trim();
        return new AiService.NutritionEstimate(title, calories, protein, fat, carbs);
    }
}
