package lab.ascend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lab.ascend.domain.UserProfile;
import lab.ascend.repo.AnalysisRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

@Service
public class AnalysisService {
    private final AiService ai;
    private final AnalysisRepository reports;
    private final ObjectMapper objectMapper;
    private final FaceAnalysisAccessService faceAccess;

    public AnalysisService(AiService ai,
                           AnalysisRepository reports,
                           ObjectMapper objectMapper,
                           FaceAnalysisAccessService faceAccess) {
        this.ai = ai;
        this.reports = reports;
        this.objectMapper = objectMapper;
        this.faceAccess = faceAccess;
    }

    public Map<String, Object> analyze(UserProfile user, List<UploadedImage> images, boolean pro) {
        if (!pro && !faceAccess.hasCredit(user.telegramId())) {
            throw new IllegalStateException("Сначала оплати оценку лица или подключи BodyPro");
        }
        List<String> dataUrls = images.stream()
                .filter(image -> image.bytes().length > 0)
                .limit(2)
                .map(image -> "data:" + image.contentType() + ";base64," + Base64.getEncoder().encodeToString(image.bytes()))
                .toList();
        try {
            JsonNode aiReport = ai.analyzeFaceWithAi(dataUrls, user.gender(), user.age())
                    .orElseThrow(() -> new IllegalStateException("AI-анализ сейчас недоступен. Попробуй ещё раз немного позже."));
            validatePhoto(aiReport, "Нужно крупное фото открытого лица без фильтров и сильного ракурса.");
            if (!"face".equalsIgnoreCase(aiReport.path("photoType").asText())) {
                throw new IllegalStateException("Это не фото лица для анализа. Загрузи крупный анфас.");
            }
            if (!aiReport.has("score") || !aiReport.path("metrics").isArray() || aiReport.path("metrics").size() < 5) {
                throw new IllegalStateException("AI не вернул полный результат. Попробуй другое фото при ровном свете.");
            }
            int score = calibratedScore(aiReport, dataUrls.size());
            Map<String, Object> report = new LinkedHashMap<>(objectMapper.convertValue(aiReport, Map.class));
            report.put("score", score);
            report.put("lockedPersonalPlan", !pro);
            report.put("accessLevel", pro ? "pro" : "standalone");
            if (!pro && !faceAccess.consume(user.telegramId())) {
                throw new IllegalStateException("Оплаченная оценка уже использована");
            }
            reports.save(user.telegramId(), score, objectMapper.writeValueAsString(report), pro);
            return pro ? report : limitedReport(report);
        } catch (IllegalStateException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException("Не удалось получить настоящий AI-анализ. Попробуй ещё раз позже.", ex);
        }
    }

    public Map<String, Object> analyzeBody(UserProfile user, BodyProfile profile, UploadedImage image) {
        if (image == null || image.bytes().length == 0) {
            throw new IllegalStateException("Сначала загрузи фото формы");
        }
        String dataUrl = "data:" + image.contentType() + ";base64,"
                + Base64.getEncoder().encodeToString(image.bytes());
        JsonNode aiReport = ai.analyzeBodyWithAi(
                        dataUrl,
                        profile.height(),
                        profile.weight(),
                        profile.waist(),
                        profile.goal(),
                        user.gender(),
                        user.age()
                )
                .orElseThrow(() -> new IllegalStateException("AI-анализ формы сейчас недоступен. Попробуй позже."));
        validatePhoto(aiReport, "Нужен кадр минимум от плеч до бёдер в прилегающей или спортивной одежде.");
        if (!"body".equalsIgnoreCase(aiReport.path("photoType").asText())) {
            throw new IllegalStateException("Нужно фото формы тела, а не портрет или случайный кадр.");
        }
        if (!aiReport.path("metrics").isArray() || aiReport.path("metrics").size() < 4) {
            throw new IllegalStateException("Не удалось надёжно оценить форму по этому фото.");
        }
        Map<String, Object> report = new LinkedHashMap<>(objectMapper.convertValue(aiReport, Map.class));
        report.put("score", calibratedScore(aiReport, 1));
        return report;
    }

    public Map<String, Object> analyzeTool(UserProfile user, ToolProfile tool, UploadedImage image, boolean pro) {
        List<String> dataUrls = image == null || image.bytes().length == 0
                ? List.of()
                : List.of("data:" + image.contentType() + ";base64," + Base64.getEncoder().encodeToString(image.bytes()));
        JsonNode aiReport = ai.analyzeToolWithAi(
                        tool.title(),
                        tool.text(),
                        tool.metrics(),
                        tool.tasks(),
                        dataUrls,
                        user.gender(),
                        user.age()
                )
                .orElseThrow(() -> new IllegalStateException("AI-анализ сейчас недоступен. Попробуй ещё раз немного позже."));
        validatePhoto(aiReport, "Нужно чёткое фото, на котором полностью видна зона этого анализа.");
        if (!aiReport.has("score") || !aiReport.path("metrics").isArray()) {
            throw new IllegalStateException("AI не вернул полный результат. Попробуй другое фото.");
        }
        Map<String, Object> report = new LinkedHashMap<>(objectMapper.convertValue(aiReport, Map.class));
        report.put("score", calibratedScore(aiReport, 1));
        return report;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static void validatePhoto(JsonNode report, String fallback) {
        if (!report.path("photoValid").asBoolean(false)) {
            String reason = report.path("rejectReason").asText("").trim();
            throw new IllegalStateException(reason.isBlank() ? fallback : reason);
        }
        if (report.path("qualityScore").asInt(0) < 35) {
            throw new IllegalStateException(fallback);
        }
    }

    private static int calibratedScore(JsonNode report, int imageCount) {
        List<Integer> values = new ArrayList<>();
        report.path("metrics").forEach(metric -> {
            if (metric.has("value")) values.add(clamp(metric.path("value").asInt(), 0, 100));
        });
        if (values.size() < 4) {
            throw new IllegalStateException("Недостаточно видимых метрик для честной оценки.");
        }
        values.sort(Comparator.naturalOrder());
        List<Integer> core = values.size() >= 6 ? values.subList(1, values.size() - 1) : values;
        double raw = core.stream().mapToInt(Integer::intValue).average().orElse(50);
        int quality = clamp(report.path("qualityScore").asInt(60), 0, 100);
        double calibrated = 50 + (raw - 50) * 0.78;
        calibrated -= Math.max(0, 70 - quality) * 0.22;
        int cap = quality < 55 ? 72 : quality < 70 ? 80 : imageCount < 2 ? 88 : 94;
        if (raw < 90) cap = Math.min(cap, 89);
        return clamp((int) Math.round(calibrated), 20, cap);
    }

    private static Map<String, Object> limitedReport(Map<String, Object> full) {
        Map<String, Object> limited = new LinkedHashMap<>();
        limited.put("score", full.get("score"));
        limited.put("summary", full.getOrDefault("summary", ""));
        limited.put("accessLevel", "standalone");
        limited.put("metricsLocked", true);
        Object metrics = full.get("metrics");
        limited.put("metricCount", metrics instanceof List<?> list ? list.size() : 0);
        limited.put("upgradeText", "BodyPro откроет полную карту метрик и персональные действия по каждой зоне.");
        return limited;
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

    public record BodyProfile(int height, int weight, int waist, String goal) {
    }
}
