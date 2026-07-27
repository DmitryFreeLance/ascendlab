package lab.ascend.web;

import com.fasterxml.jackson.databind.JsonNode;
import lab.ascend.service.AiService;
import lab.ascend.service.CurrentUserService;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@RestController
@RequestMapping("/api/battle")
public class BattleController {
    private static final Map<String, Opponent> OPPONENTS = Map.of(
            "neo", new Opponent("Артём", "static/assets/battle/fake-neo.jpg"),
            "soft", new Opponent("Никита", "static/assets/battle/fake-soft.jpg"),
            "raw", new Opponent("Илья", "static/assets/battle/fake-raw.jpg")
    );

    private final CurrentUserService currentUser;
    private final AiService ai;

    public BattleController(CurrentUserService currentUser, AiService ai) {
        this.currentUser = currentUser;
        this.ai = ai;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> compare(
            @RequestHeader(value = "X-Telegram-Init-Data", required = false) String initData,
            @RequestPart("photo") MultipartFile photo) throws IOException {
        currentUser.require(initData);
        if (photo == null || photo.isEmpty()) {
            throw new IllegalArgumentException("Добавь фото для честного сравнения.");
        }
        List<Map.Entry<String, Opponent>> draw = List.copyOf(OPPONENTS.entrySet());
        Map.Entry<String, Opponent> selected = draw.get(ThreadLocalRandom.current().nextInt(draw.size()));
        String opponentId = selected.getKey();
        Opponent opponent = selected.getValue();

        byte[] opponentBytes = new ClassPathResource(opponent.resourcePath()).getContentAsByteArray();
        String ownDataUrl = dataUrl(photo.getContentType(), photo.getBytes());
        String opponentDataUrl = dataUrl("image/jpeg", opponentBytes);
        JsonNode report = ai.analyzeBattleWithAi(ownDataUrl, opponentDataUrl)
                .orElseThrow(() -> new IllegalStateException("AI-сравнение сейчас недоступно. Попробуй ещё раз немного позже."));
        if (!report.has("ownScore") || !report.has("opponentScore")) {
            throw new IllegalStateException("AI не вернул полный результат сравнения. Попробуй другое фото.");
        }
        if (!report.path("ownPhotoValid").asBoolean(false) || report.path("ownQualityScore").asInt(0) < 35) {
            String reason = report.path("rejectReason").asText("").trim();
            throw new IllegalStateException(reason.isBlank()
                    ? "Для честного баттла нужно крупное открытое лицо без фильтра и сильного ракурса."
                    : reason);
        }

        int ownScore = calibratedScore(
                report.path("ownMetrics"),
                report.path("ownScore").asInt(),
                report.path("ownQualityScore").asInt()
        );
        int opponentScore = calibratedScore(
                report.path("opponentMetrics"),
                report.path("opponentScore").asInt(),
                85
        );
        int delta = ownScore - opponentScore;
        String result = Math.abs(delta) <= 2 ? "tie" : delta > 0 ? "win" : "lose";
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("result", result);
        response.put("opponentId", opponentId);
        response.put("name", opponent.name());
        response.put("ownScore", ownScore);
        response.put("opponentScore", opponentScore);
        response.put("summary", labeledSummary(report.path("summary").asText("")));
        response.put("ownStrengths", textList(report.path("ownStrengths")));
        response.put("opponentStrengths", textList(report.path("opponentStrengths")));
        response.put("focus", textList(report.path("focus")));
        return response;
    }

    private static String dataUrl(String contentType, byte[] bytes) {
        String safeContentType = contentType == null || contentType.isBlank() ? "image/jpeg" : contentType;
        return "data:" + safeContentType + ";base64," + Base64.getEncoder().encodeToString(bytes);
    }

    private static List<String> textList(JsonNode node) {
        if (!node.isArray()) return List.of();
        return java.util.stream.StreamSupport.stream(node.spliterator(), false)
                .map(JsonNode::asText)
                .filter(value -> !value.isBlank())
                .limit(4)
                .toList();
    }

    private static int clamp(int value) {
        return Math.max(0, Math.min(100, value));
    }

    static String labeledSummary(String value) {
        return value
                .replaceAll("(?iu)на первом фото", "на твоём фото")
                .replaceAll("(?iu)на втором фото", "на фото соперника")
                .replaceAll("(?iu)первое фото", "Твоё фото")
                .replaceAll("(?iu)второе фото", "Фото соперника")
                .replaceAll("(?iu)первый кадр", "Твоё фото")
                .replaceAll("(?iu)второй кадр", "Фото соперника");
    }

    private static int calibratedScore(JsonNode metrics, int modelScore, int quality) {
        List<Integer> values = textMetricValues(metrics);
        double raw = values.size() >= 3
                ? values.stream().mapToInt(Integer::intValue).average().orElse(modelScore)
                : clamp(modelScore);
        double calibrated = 50 + (raw - 50) * 0.78 - Math.max(0, 65 - clamp(quality)) * 0.18;
        int cap = quality < 55 ? 76 : quality < 70 ? 84 : raw < 90 ? 89 : 93;
        return Math.max(20, Math.min(cap, (int) Math.round(calibrated)));
    }

    private static List<Integer> textMetricValues(JsonNode node) {
        if (!node.isArray()) return List.of();
        return java.util.stream.StreamSupport.stream(node.spliterator(), false)
                .filter(item -> item.has("value"))
                .map(item -> clamp(item.path("value").asInt()))
                .limit(8)
                .toList();
    }

    private record Opponent(String name, String resourcePath) {
    }
}
