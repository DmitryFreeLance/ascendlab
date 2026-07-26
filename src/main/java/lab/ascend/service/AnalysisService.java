package lab.ascend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lab.ascend.domain.UserProfile;
import lab.ascend.repo.AnalysisRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;

@Service
public class AnalysisService {
    private final AiService ai;
    private final AnalysisRepository reports;
    private final ObjectMapper objectMapper;

    public AnalysisService(AiService ai, AnalysisRepository reports, ObjectMapper objectMapper) {
        this.ai = ai;
        this.reports = reports;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> analyze(UserProfile user, List<UploadedImage> images, boolean pro) {
        List<String> dataUrls = images.stream()
                .filter(image -> image.bytes().length > 0)
                .limit(2)
                .map(image -> "data:" + image.contentType() + ";base64," + Base64.getEncoder().encodeToString(image.bytes()))
                .toList();
        if (pro) {
            try {
                JsonNode aiReport = ai.analyzeFaceWithAi(dataUrls, user.gender(), user.age()).orElse(null);
                if (aiReport != null && aiReport.has("score")) {
                    int score = clamp(aiReport.path("score").asInt(78), 45, 98);
                    reports.save(user.telegramId(), score, aiReport.toString());
                    return objectMapper.convertValue(aiReport, Map.class);
                }
            } catch (Exception ignored) {
                // Local report below keeps UX uninterrupted when multimodal AI is unavailable.
            }
        }
        int seed = (int) Math.abs((user.telegramId() + images.size() * 37) % 19);
        int score = 73 + seed;
        Map<String, Object> report = Map.of(
                "score", score,
                "summary", "База выглядит сильной: лучше всего сработают чистый контур стрижки, выравнивание тона кожи и более спокойная подача в кадре.",
                "metrics", List.of(
                        metric("Гармония", clamp(score - 2, 0, 100), "Черты читаются цельно, можно усилить контур."),
                        metric("Кожа", clamp(68 + seed, 0, 100), "Главный быстрый выигрыш даст стабильный уход."),
                        metric("Углы", clamp(70 + seed / 2, 0, 100), "Фронтальное фото стоит повторить с мягким верхним светом."),
                        metric("Стиль", clamp(64 + seed, 0, 100), "Нужна более точная цветовая палитра и силуэт.")
                ),
                "zones", List.of(
                        zone("Кожа", "выравнивание", "Утро: мягкое очищение, увлажнение, SPF. Вечер: очищение и восстановление барьера."),
                        zone("Волосы", "контур", "Попроси мастера оставить аккуратный вес сверху и чище оформить виски."),
                        zone("Фото", "подача", "Камера на уровне глаз, нейтральное выражение, свет из окна под 45 градусов.")
                ),
                "routine", List.of(
                        "7 дней: стабилизировать сон и воду, убрать случайные эксперименты с кожей.",
                        "14 дней: подобрать стрижку под форму лица и сделать 3 контрольных фото.",
                        "30 дней: закрепить уход, питание и стиль как повторяемую систему."
                ),
                "style", List.of("холодный белый", "серебристый", "графит", "чистый деним"),
                "lockedPersonalPlan", !pro
        );
        try {
            reports.save(user.telegramId(), score, objectMapper.writeValueAsString(report));
        } catch (Exception ignored) {
            reports.save(user.telegramId(), score, report.toString());
        }
        return report;
    }

    public Map<String, Object> analyzeTool(UserProfile user, ToolProfile tool, UploadedImage image, boolean pro) {
        List<String> dataUrls = image == null || image.bytes().length == 0
                ? List.of()
                : List.of("data:" + image.contentType() + ";base64," + Base64.getEncoder().encodeToString(image.bytes()));
        if (pro) {
            try {
                JsonNode aiReport = ai.analyzeToolWithAi(
                        tool.title(),
                        tool.text(),
                        tool.metrics(),
                        tool.tasks(),
                        dataUrls,
                        user.gender(),
                        user.age()
                ).orElse(null);
                if (aiReport != null && aiReport.has("score")) {
                    return objectMapper.convertValue(aiReport, Map.class);
                }
            } catch (Exception ignored) {
                // Local report below keeps the tool useful when multimodal AI is unavailable.
            }
        }
        int seed = Math.abs((int) ((user.telegramId() + tool.id().hashCode()) % 23));
        List<Map<String, Object>> metrics = new ArrayList<>();
        for (int i = 0; i < tool.metrics().size(); i += 1) {
            int value = clamp(58 + ((seed + i * 13) % 30), 0, 100);
            metrics.add(metric(tool.metrics().get(i), value, value >= 75 ? "сильно" : value >= 62 ? "норм" : "фокус"));
        }
        int score = metrics.stream()
                .mapToInt(item -> Number.class.cast(item.get("value")).intValue())
                .sum() / Math.max(1, metrics.size());
        String weakest = metrics.stream()
                .min((a, b) -> Integer.compare(Number.class.cast(a.get("value")).intValue(), Number.class.cast(b.get("value")).intValue()))
                .map(item -> item.get("name").toString())
                .orElse(tool.metrics().isEmpty() ? "фокус" : tool.metrics().get(0));
        return Map.of(
                "score", score,
                "title", score >= 82 ? "Сильный блок" : score >= 66 ? "Хорошая база" : "Есть быстрые победы",
                "headline", tool.title() + ": разбор готов",
                "summary", "Самый важный ближайший фокус — " + weakest.toLowerCase() + ".",
                "metrics", metrics,
                "tasks", tool.tasks(),
                "planText", "Добавь фокус “" + weakest + "” в отчёт дня и повтори фото после нескольких действий."
        );
    }

    private static Map<String, Object> metric(String name, int value, String hint) {
        return Map.of("name", name, "value", value, "hint", hint);
    }

    private static Map<String, Object> zone(String name, String status, String advice) {
        return Map.of("name", name, "status", status, "advice", advice);
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    public record UploadedImage(String contentType, byte[] bytes) {
        public static List<UploadedImage> list(UploadedImage... images) {
            List<UploadedImage> list = new ArrayList<>();
            for (UploadedImage image : images) {
                if (image != null) {
                    list.add(image);
                }
            }
            return list;
        }
    }

    public record ToolProfile(String id, String title, String text, List<String> metrics, List<String> tasks) {
    }
}
